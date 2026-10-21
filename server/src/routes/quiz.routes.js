import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { writeAudit } from '../middleware/audit.js';
import { uploadMaterial } from '../middleware/upload.js';
import { ApiError } from '../utils/errors.js';
import { store } from '../store.js';
import {
  generateQuizSchema,
  publishSchema,
  flagReviewSchema,
} from '../validators/schemas.js';
import {
  generateQuiz,
  getQuizForTeacher,
  publishQuiz,
  closeQuiz,
} from '../services/quiz.service.js';
import { computeStats } from '../services/attempt.service.js';
import { generateText } from '../services/gemini.service.js';
import { extractMaterialText } from '../services/material.service.js';

export const quizzesRouter = Router();
quizzesRouter.use(authenticate);

const materialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many file uploads. Please wait a few minutes.' } },
});

// --- material upload (text extraction) -------------------------------------

quizzesRouter.post(
  '/upload-material',
  requireRole('teacher'),
  materialLimiter,
  uploadMaterial,
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError(400, 'Attach a file in a "material" field.');
      const extracted = await extractMaterialText(req.file.buffer, req.file.originalname);
      await writeAudit(req, {
        action: 'material.upload',
        targetType: 'file',
        targetId: req.file.originalname,
        after: { chars: extracted.chars, truncated: extracted.truncated },
      });
      res.json({
        fileName: req.file.originalname,
        fileSize: req.file.size,
        ...extracted,
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- create (AI pool generation) ------------------------------------------

quizzesRouter.post(
  '/generate',
  requireRole('teacher'),
  validate({ body: generateQuizSchema }),
  async (req, res, next) => {
    try {
      const quiz = await generateQuiz(req.user, req.body);
      await writeAudit(req, {
        action: 'quiz.generate',
        targetType: 'quiz',
        targetId: quiz.id,
        after: { title: quiz.title, poolSize: quiz.pool.questions.length },
      });
      res.status(201).json(quiz);
    } catch (err) {
      next(err);
    }
  },
);

// --- list ------------------------------------------------------------------

quizzesRouter.get('/', async (req, res, next) => {
  try {
    const scope = req.query.scope === 'student' ? 'student' : 'teacher';

    if (scope === 'student') {
      if (req.user.role !== 'student' && req.user.role !== 'admin') {
        throw new ApiError(403, 'Students only.');
      }
      const [published, closed] = await Promise.all([
        store.all('quizzes', { where: [['status', '==', 'published']] }),
        store.all('quizzes', { where: [['status', '==', 'closed']] }),
      ]);
      const quizzes = [...published, ...closed];
      const out = [];
      for (const q of quizzes) {
        const attempt = await store.get('attempts', `${q.id}_${req.user.uid}`);
        out.push({
          id: q.id,
          title: q.title,
          subject: q.subject,
          topic: q.topic,
          status: q.status,
          closesAt: q.closesAt,
          questionCount: q.blueprint.count,
          timeLimitMin: q.blueprint.timeLimitMin,
          myAttempt: attempt
            ? { status: attempt.status, score: attempt.score, submittedAt: attempt.submittedAt }
            : null,
        });
      }
      out.sort((a, b) => new Date(b.closesAt) - new Date(a.closesAt));
      return res.json(out);
    }

    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      throw new ApiError(403, 'Teachers only.');
    }
    const quizzes = await store.all('quizzes', {
      where: [['createdBy', '==', req.user.uid]],
    });
    const out = [];
    for (const q of quizzes) {
      const attempts = await store.all('attempts', {
        where: [['quizId', '==', q.id]],
      });
      const submitted = attempts.filter((a) => a.status === 'submitted');
      out.push({
        id: q.id,
        title: q.title,
        subject: q.subject,
        topic: q.topic,
        status: q.status,
        createdAt: q.createdAt,
        closesAt: q.closesAt,
        questionCount: q.blueprint.count,
        poolSize: q.pool.questions.length,
        poolSource: q.pool.source,
        submissions: submitted.length,
        avgPercent: submitted.length
          ? Math.round(
              (submitted.reduce((s, a) => s + a.score.percent, 0) / submitted.length) * 10,
            ) / 10
          : null,
      });
    }
    out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(out);
  } catch (err) {
    return next(err);
  }
});

// --- teacher detail / publish / close --------------------------------------

quizzesRouter.get('/:id', requireRole('teacher'), async (req, res, next) => {
  try {
    res.json(await getQuizForTeacher(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
});

quizzesRouter.post(
  '/:id/publish',
  requireRole('teacher'),
  validate({ body: publishSchema }),
  async (req, res, next) => {
    try {
      const quiz = await publishQuiz(req.user, req.params.id, req.body);
      await writeAudit(req, {
        action: 'quiz.publish',
        targetType: 'quiz',
        targetId: quiz.id,
        after: { opensAt: quiz.opensAt, closesAt: quiz.closesAt },
      });
      res.json(quiz);
    } catch (err) {
      next(err);
    }
  },
);

quizzesRouter.post('/:id/close', requireRole('teacher'), async (req, res, next) => {
  try {
    const quiz = await closeQuiz(req.user, req.params.id);
    await writeAudit(req, {
      action: 'quiz.close',
      targetType: 'quiz',
      targetId: quiz.id,
    });
    res.json(quiz);
  } catch (err) {
    next(err);
  }
});

// --- results, flags, versions ----------------------------------------------

quizzesRouter.get('/:id/results', requireRole('teacher'), async (req, res, next) => {
  try {
    const quiz = await getQuizForTeacher(req.params.id, req.user);
    const [attempts, flags, insights] = await Promise.all([
      store.all('attempts', { where: [['quizId', '==', quiz.id]] }),
      store.all('integrityFlags', { where: [['quizId', '==', quiz.id]] }),
      store.all('aiInsights', { where: [['quizId', '==', quiz.id]] }),
    ]);

    const results = attempts
      .filter((a) => a.status === 'submitted')
      .map((a) => ({
        id: a.id,
        studentId: a.studentId,
        studentName: a.studentName,
        score: a.score,
        submittedAt: a.submittedAt,
        autoSubmitted: a.autoSubmitted,
        blurEvents: (a.events || []).filter((e) => e.type === 'blur').length,
        flagCount: flags.filter(
          (f) =>
            (f.attemptId === a.id || f.relatedAttemptId === a.id) && f.status !== 'dismissed',
        ).length,
      }))
      .sort((a, b) => b.score.percent - a.score.percent);

    const inProgress = attempts
      .filter((a) => a.status === 'in_progress')
      .map((a) => ({
        id: a.id,
        studentId: a.studentId,
        studentName: a.studentName,
        startedAt: a.startedAt,
        endsAt: a.endsAt,
      }));

    const stats = computeStats(quiz, attempts);
    insights.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ quiz, results, inProgress, flags, stats, insight: insights[0] || null });
  } catch (err) {
    next(err);
  }
});

// Exact paper a student received (including answers) — professor review.
quizzesRouter.get(
  '/:id/version/:studentId',
  requireRole('teacher'),
  async (req, res, next) => {
    try {
      const quiz = await getQuizForTeacher(req.params.id, req.user);
      const version = await store.get('quizVersions', `${quiz.id}_${req.params.studentId}`);
      if (!version) throw new ApiError(404, 'No quiz version for that student.');
      const pool = quiz.pool.questions;
      const questions = version.questionIndexes.map((qi) => {
        const q = pool[qi];
        const item = {
          qi,
          type: q.type,
          prompt: q.prompt,
          topic: q.topic,
          difficulty: q.difficulty,
          answer: q.type === 'mcq' ? q.options[q.answerIndex] : q.answer,
          explanation: q.explanation,
        };
        if (q.type === 'mcq') {
          item.options = version.optionOrders[qi].map((orig) => q.options[orig]);
        }
        return item;
      });
      res.json({ version: { seed: version.seed, createdAt: version.createdAt }, questions });
    } catch (err) {
      next(err);
    }
  },
);

// --- AI integrity narrative --------------------------------------------------

quizzesRouter.post('/:id/insight', requireRole('teacher'), async (req, res, next) => {
  try {
    const quiz = await getQuizForTeacher(req.params.id, req.user);
    const [attempts, flags] = await Promise.all([
      store.all('attempts', { where: [['quizId', '==', quiz.id]] }),
      store.all('integrityFlags', { where: [['quizId', '==', quiz.id]] }),
    ]);
    const stats = computeStats(quiz, attempts);
    if (stats.submissions === 0) {
      throw new ApiError(400, 'No submissions to analyze yet.');
    }

    const flagSummary = flags
      .filter((f) => f.status !== 'dismissed')
      .reduce((acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      }, {});

    // Pseudonymized payload: statistics and item text only — no student names.
    const payload = {
      quiz: { title: quiz.title, topic: quiz.topic, objectives: quiz.objectives },
      stats,
      integrityFlagCounts: flagSummary,
      flaggedQuestionIndexes: [
        ...new Set(
          flags
            .filter((f) => f.status !== 'dismissed')
            .flatMap((f) => f.evidence?.sharedWrongQuestions || f.evidence?.questionIndexes || []),
        ),
      ],
    };

    const result = await generateText({
      system: `You are an assessment-integrity and learning analyst writing for a teacher.
Provide a plain-text report with two sections:
SUMMARY: 2-4 sentences interpreting performance and integrity signals.
RECOMMENDATIONS: 3-5 bullets (review actions, teaching adjustments, items to revise).
Rules: reference topics and question numbers, never student identities; advisory tone only — the teacher makes all decisions; no markdown headers, plain text.`,
      prompt: `Quiz data (anonymized):\n${JSON.stringify(payload, null, 2)}`,
    });

    const insight = await store.add('aiInsights', {
      quizId: quiz.id,
      teacherId: req.user.uid,
      stats,
      flagSummary,
      text: result.text,
      model: result.model,
      source: result.source,
      createdAt: new Date().toISOString(),
    });

    await writeAudit(req, {
      action: 'quiz.insight',
      targetType: 'quiz',
      targetId: quiz.id,
      targetId2: insight,
    });
    res.status(201).json({
      insight: {
        id: insight,
        text: result.text,
        source: result.source,
        model: result.model,
        stats,
        flagSummary,
        createdAt: new Date().toISOString(),
      },
      stats,
    });
  } catch (err) {
    next(err);
  }
});

// --- integrity flag review ---------------------------------------------------

export const integrityRouter = Router();
integrityRouter.use(authenticate);

integrityRouter.get('/flags', requireRole('teacher'), async (req, res, next) => {
  try {
    const where = req.query.quizId
      ? [['quizId', '==', String(req.query.quizId)]]
      : [];
    let flags = await store.all('integrityFlags', { where });
    // Teachers may only see flags on their own quizzes.
    const mine = [];
    for (const f of flags) {
      const quiz = await store.get('quizzes', f.quizId);
      if (quiz && (quiz.createdBy === req.user.uid || req.user.role === 'admin')) mine.push(f);
    }
    mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(mine);
  } catch (err) {
    next(err);
  }
});

integrityRouter.patch(
  '/flags/:id',
  requireRole('teacher'),
  validate({ body: flagReviewSchema }),
  async (req, res, next) => {
    try {
      const flag = await store.get('integrityFlags', req.params.id);
      if (!flag) throw new ApiError(404, 'Flag not found.');
      const quiz = await store.get('quizzes', flag.quizId);
      if (!quiz || (quiz.createdBy !== req.user.uid && req.user.role !== 'admin')) {
        throw new ApiError(403, 'You do not own this flag.');
      }
      const updated = await store.patch('integrityFlags', flag.id, {
        status: req.body.status,
        reviewedBy: req.user.uid,
        reviewedAt: new Date().toISOString(),
      });
      await writeAudit(req, {
        action: 'flag.review',
        targetType: 'integrityFlag',
        targetId: flag.id,
        before: { status: flag.status },
        after: { status: req.body.status },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);
