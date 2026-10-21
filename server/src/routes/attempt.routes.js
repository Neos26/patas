import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { ApiError } from '../utils/errors.js';
import { store } from '../store.js';
import {
  answerSchema,
  eventSchema,
  submitSchema,
} from '../validators/schemas.js';
import {
  startAttempt,
  saveAnswer,
  recordEvent,
  submitAttempt,
} from '../services/attempt.service.js';
import { sanitizeForStudent } from '../services/quiz.service.js';

export const attemptsRouter = Router();
attemptsRouter.use(authenticate);

attemptsRouter.post(
  '/start',
  requireRole('student'),
  validate({ body: z.object({ quizId: z.string().min(1) }) }),
  async (req, res, next) => {
    try {
      res.status(201).json(await startAttempt(req.user, req.body.quizId));
    } catch (err) {
      next(err);
    }
  },
);

attemptsRouter.put(
  '/:id/answer',
  requireRole('student'),
  validate({ body: answerSchema }),
  async (req, res, next) => {
    try {
      res.json(await saveAnswer(req.user, req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  },
);

attemptsRouter.post(
  '/:id/event',
  requireRole('student'),
  validate({ body: eventSchema }),
  async (req, res, next) => {
    try {
      res.json(await recordEvent(req.user, req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  },
);

attemptsRouter.post(
  '/:id/submit',
  requireRole('student'),
  validate({ body: submitSchema }),
  async (req, res, next) => {
    try {
      res.json(await submitAttempt(req.user, req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  },
);

/** Result view for the student who took it (or the quiz's teacher). */
attemptsRouter.get('/:id/result', async (req, res, next) => {
  try {
    const attempt = await store.get('attempts', req.params.id);
    if (!attempt) throw new ApiError(404, 'Attempt not found.');
    const quiz = await store.get('quizzes', attempt.quizId);
    const isOwner = attempt.studentId === req.user.uid;
    const isTeacher = quiz && quiz.createdBy === req.user.uid;
    if (!isOwner && !isTeacher && req.user.role !== 'admin') {
      throw new ApiError(403, 'You cannot view this result.');
    }

    const version = await store.get('quizVersions', attempt.id);
    const pool = quiz?.pool?.questions || [];

    if (attempt.status !== 'submitted') {
      // Live attempt → refresh data without any answers.
      return res.json({
        attempt: {
          id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          endsAt: attempt.endsAt,
        },
        quiz: quiz ? { id: quiz.id, title: quiz.title, topic: quiz.topic } : null,
        questions: version ? sanitizeForStudent(quiz, version) : [],
        submitted: false,
      });
    }

    const answerByQI = Object.fromEntries(
      (attempt.perQuestion || []).map((p) => [p.qi, p]),
    );
    const questions = version.questionIndexes.map((qi) => {
      const q = pool[qi];
      const p = answerByQI[qi] || {};
      const item = {
        qi,
        type: q.type,
        prompt: q.prompt,
        topic: q.topic,
        difficulty: q.difficulty,
        correct: Boolean(p.correct),
        studentAnswer: p.studentAnswer,
        correctAnswer: p.correctAnswer,
        timeMs: p.timeMs || 0,
        explanation: q.explanation,
      };
      if (q.type === 'mcq') {
        item.options = version.optionOrders[qi].map((orig) => q.options[orig]);
      }
      return item;
    });

    return res.json({
      submitted: true,
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        autoSubmitted: attempt.autoSubmitted,
        score: attempt.score,
      },
      quiz: quiz ? { id: quiz.id, title: quiz.title, topic: quiz.topic } : null,
      questions,
    });
  } catch (err) {
    return next(err);
  }
});

/** Current student's history. */
attemptsRouter.get('/', requireRole('student'), async (req, res, next) => {
  try {
    const attempts = await store.all('attempts', {
      where: [['studentId', '==', req.user.uid]],
    });
    const out = [];
    for (const a of attempts) {
      const quiz = await store.get('quizzes', a.quizId);
      out.push({
        id: a.id,
        quizId: a.quizId,
        title: quiz?.title || 'Unknown quiz',
        status: a.status,
        score: a.score,
        submittedAt: a.submittedAt,
        autoSubmitted: a.autoSubmitted,
      });
    }
    out.sort((a, b) => new Date(b.submittedAt || b.id) - new Date(a.submittedAt || a.id));
    res.json(out);
  } catch (err) {
    next(err);
  }
});
