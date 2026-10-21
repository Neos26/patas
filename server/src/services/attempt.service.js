/**
 * Attempt lifecycle: start → autosave → submit → grade → integrity flags.
 * All math is done in code; AI is only used later for narrative summaries.
 */
import { store } from '../store.js';
import { ApiError } from '../utils/errors.js';
import { assembleVersion, sanitizeForStudent, PASS_PERCENT } from './quiz.service.js';

const FAST_ANSWER_MS = 1500;
const MIN_SHARED_WRONG = 2;
const AGREEMENT_THRESHOLD = 0.6;
const BLUR_FLAG_MIN = 3; // tab switches / window blurs
const COPY_FLAG_MIN = 2; // copy actions (paste attempts flag at 1)

function normAnswer(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isExpired(attempt) {
  return Date.now() > new Date(attempt.endsAt).getTime() + 30000;
}

export async function startAttempt(user, quizId) {
  const quiz = await store.get('quizzes', quizId);
  if (!quiz) throw new ApiError(404, 'Quiz not found.');
  if (!['published', 'closed'].includes(quiz.status)) {
    throw new ApiError(400, 'This quiz is not open yet.');
  }
  if (quiz.status === 'published') {
    const now = Date.now();
    if (now < new Date(quiz.opensAt).getTime()) throw new ApiError(400, 'Quiz has not started.');
    if (now > new Date(quiz.closesAt).getTime()) throw new ApiError(400, 'Quiz window has closed.');
  }

  const attemptId = `${quizId}_${user.uid}`;
  const existing = await store.get('attempts', attemptId);
  if (existing?.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this quiz.', {
      attemptId,
      submitted: true,
    });
  }

  const version = await assembleVersion(quiz, user.uid);
  const now = Date.now();

  let attempt = existing;
  if (!attempt) {
    attempt = {
      id: attemptId,
      quizId,
      studentId: user.uid,
      studentName: user.name || user.email || user.uid,
      status: 'in_progress',
      startedAt: new Date(now).toISOString(),
      endsAt: new Date(now + quiz.blueprint.timeLimitMin * 60000).toISOString(),
      answers: {},
      events: [],
      score: null,
      perQuestion: [],
      submittedAt: null,
      autoSubmitted: false,
    };
    await store.set('attempts', attempt.id, attempt);
  }

  return {
    attemptId: attempt.id,
    quizId,
    title: quiz.title,
    topic: quiz.topic,
    timeLimitMin: quiz.blueprint.timeLimitMin,
    startedAt: attempt.startedAt,
    endsAt: attempt.endsAt,
    status: attempt.status,
    answers: attempt.answers,
    questions: sanitizeForStudent(quiz, version),
  };
}

export async function saveAnswer(user, attemptId, { qi, v, t }) {
  const attempt = await getOwnedAttempt(user, attemptId);
  if (attempt.status !== 'in_progress') throw new ApiError(400, 'Attempt is already submitted.');
  if (isExpired(attempt)) throw new ApiError(400, 'Time is up for this attempt.');
  if (attempt.answers[qi]) {
    // keep the total dwell time, update the value
    t = Math.max(t, attempt.answers[qi].t || 0);
  }
  await store.patch('attempts', attemptId, {
    answers: { ...attempt.answers, [qi]: { v, t: t || 0 } },
  });
  return { ok: true };
}

export async function recordEvent(user, attemptId, { type }) {
  const attempt = await getOwnedAttempt(user, attemptId);
  if (attempt.status !== 'in_progress') return { ok: true };
  const events = [...(attempt.events || []), { type, at: new Date().toISOString() }];
  await store.patch('attempts', attemptId, { events: events.slice(-200) });
  return { ok: true };
}

async function getOwnedAttempt(user, attemptId) {
  const attempt = await store.get('attempts', attemptId);
  if (!attempt) throw new ApiError(404, 'Attempt not found.');
  if (attempt.studentId !== user.uid && user.role !== 'admin') {
    throw new ApiError(403, 'This attempt does not belong to you.');
  }
  return attempt;
}

// --- grading ---------------------------------------------------------------

export async function submitAttempt(user, attemptId, { auto = false } = {}) {
  const attempt = await getOwnedAttempt(user, attemptId);
  if (attempt.status === 'submitted') {
    throw new ApiError(409, 'Already submitted.', { attemptId });
  }

  const quiz = await store.get('quizzes', attempt.quizId);
  const version = await store.get('quizVersions', `${attempt.quizId}_${user.uid}`);
  if (!quiz || !version) throw new ApiError(500, 'Quiz data missing for this attempt.');

  const pool = quiz.pool.questions;
  const perQuestion = [];
  let correctCount = 0;
  const fastWrong = [];

  for (const qi of version.questionIndexes) {
    const q = pool[qi];
    const entry = attempt.answers[qi];
    let correct = false;
    let studentAnswer = null;

    if (entry !== undefined) {
      if (q.type === 'mcq') {
        const pos = Number(entry.v);
        const origIdx = version.optionOrders[qi]?.[pos];
        correct = origIdx === q.answerIndex;
        studentAnswer = Number.isInteger(origIdx) && q.options[origIdx] !== undefined
          ? q.options[origIdx]
          : String(entry.v);
      } else if (q.type === 'true_false') {
        studentAnswer = String(entry.v);
        correct = normAnswer(entry.v) === normAnswer(q.answer);
      } else {
        studentAnswer = String(entry.v);
        correct = normAnswer(entry.v) === normAnswer(q.answer);
      }
      if (!correct && (entry.t || 0) < FAST_ANSWER_MS) fastWrong.push(qi);
    }

    if (correct) correctCount += 1;
    perQuestion.push({
      qi,
      correct,
      studentAnswer,
      correctAnswer: q.type === 'mcq' ? q.options[q.answerIndex] : q.answer,
      timeMs: entry?.t || 0,
    });
  }

  const total = version.questionIndexes.length;
  const percent = Math.round((correctCount / total) * 1000) / 10;
  const now = new Date().toISOString();

  const score = {
    correct: correctCount,
    total,
    percent,
    passed: percent >= PASS_PERCENT,
  };

  await store.patch('attempts', attemptId, {
    status: 'submitted',
    submittedAt: now,
    autoSubmitted: auto || isExpired(attempt),
    score,
    perQuestion,
  });

  const graded = { ...attempt, status: 'submitted', score, perQuestion, submittedAt: now };

  const flagIds = await detectIntegrityFlags(quiz, graded, { fastWrong });
  return { attemptId, score, perQuestion, flagIds };
}

// --- integrity detection (code, never AI) ----------------------------------

export async function detectIntegrityFlags(quiz, attempt, { fastWrong = [] } = {}) {
  const created = [];

  // 1) Focus loss (tab switches + alt-tab/window blurs while the quiz is open)
  const blurCount = (attempt.events || []).filter((e) => e.type === 'blur').length;
  if (blurCount >= BLUR_FLAG_MIN) {
    const id = `${attempt.id}_focus`;
    if (!(await store.get('integrityFlags', id))) {
      await store.set('integrityFlags', id, {
        id,
        quizId: quiz.id,
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        type: 'focus_loss',
        severity: blurCount >= 8 ? 'high' : 'medium',
        evidence: { blurEvents: blurCount, events: (attempt.events || []).slice(-20) },
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      created.push(id);
    }
  }

  // 2) Implausibly fast + wrong answers
  if (fastWrong.length >= 3) {
    const id = `${attempt.id}_fast`;
    if (!(await store.get('integrityFlags', id))) {
      await store.set('integrityFlags', id, {
        id,
        quizId: quiz.id,
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        type: 'fast_answer',
        severity: 'medium',
        evidence: { questionIndexes: fastWrong, thresholdMs: FAST_ANSWER_MS },
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      created.push(id);
    }
  }

  // 2b) Clipboard use — paste attempts (blocked by the player but recorded)
  //     or repeated copy actions while the quiz is open.
  const events = attempt.events || [];
  const pasteAttempts = events.filter((e) => e.type === 'paste').length;
  const copyEvents = events.filter((e) => e.type === 'copy').length;
  if (pasteAttempts >= 1 || copyEvents >= COPY_FLAG_MIN) {
    const id = `${attempt.id}_clip`;
    if (!(await store.get('integrityFlags', id))) {
      await store.set('integrityFlags', id, {
        id,
        quizId: quiz.id,
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        type: 'clipboard',
        severity: pasteAttempts >= 3 || copyEvents >= 5 ? 'high' : 'medium',
        evidence: { pasteAttempts, copyEvents },
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      created.push(id);
    }
  }

  // 2c) DevTools / view-source shortcuts pressed during the attempt.
  const devtoolsCount = events.filter((e) => e.type === 'devtools').length;
  if (devtoolsCount >= 1) {
    const id = `${attempt.id}_devtools`;
    if (!(await store.get('integrityFlags', id))) {
      await store.set('integrityFlags', id, {
        id,
        quizId: quiz.id,
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        type: 'devtools',
        severity: devtoolsCount >= 3 ? 'high' : 'medium',
        evidence: { count: devtoolsCount, events: events.filter((e) => e.type === 'devtools').slice(-10) },
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      created.push(id);
    }
  }

  // 2d) Left fullscreen (locked) mode — the player auto-enters fullscreen on
  //     the first interaction, so any exit is worth reviewing.
  const fsExits = events.filter((e) => e.type === 'fullscreen_exit').length;
  if (fsExits >= 1) {
    const id = `${attempt.id}_fs`;
    if (!(await store.get('integrityFlags', id))) {
      await store.set('integrityFlags', id, {
        id,
        quizId: quiz.id,
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        type: 'fullscreen_exit',
        severity: fsExits >= 5 ? 'high' : fsExits >= 2 ? 'medium' : 'low',
        evidence: { exits: fsExits, events: events.filter((e) => e.type === 'fullscreen_exit').slice(-10) },
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      created.push(id);
    }
  }

  // 3) Identical wrong answers on the questions both students had in common
  //    (papers differ, so we compare only the shared subset).
  const myP = Object.fromEntries((attempt.perQuestion || []).map((p) => [p.qi, p]));
  if (Object.keys(myP).length >= MIN_SHARED_WRONG) {
    const others = await store.all('attempts', {
      where: [
        ['quizId', '==', quiz.id],
        ['status', '==', 'submitted'],
      ],
    });
    for (const other of others) {
      if (other.id === attempt.id || other.studentId === attempt.studentId) continue;
      const otherP = Object.fromEntries((other.perQuestion || []).map((p) => [p.qi, p]));
      const shared = Object.keys(myP)
        .map(Number)
        .filter((qi) => otherP[qi]);
      const identicalWrong = shared.filter(
        (qi) =>
          !myP[qi].correct &&
          !otherP[qi].correct &&
          normAnswer(myP[qi].studentAnswer) === normAnswer(otherP[qi].studentAnswer),
      );
      const agreement = shared.length ? identicalWrong.length / shared.length : 0;
      if (identicalWrong.length >= MIN_SHARED_WRONG && agreement >= AGREEMENT_THRESHOLD) {
        const pair = [attempt.studentId, other.studentId].sort();
        const id = `${quiz.id}_${pair.join('_')}_similarity`;
        if (!(await store.get('integrityFlags', id))) {
          await store.set('integrityFlags', id, {
            id,
            quizId: quiz.id,
            attemptId: attempt.id,
            studentId: attempt.studentId,
            studentName: attempt.studentName,
            relatedAttemptId: other.id,
            relatedStudentName: other.studentName,
            type: 'similarity',
            severity: agreement >= 0.9 || identicalWrong.length >= 4 ? 'high' : 'medium',
            evidence: {
              sharedWrongQuestions: identicalWrong,
              sharedQuestionCount: shared.length,
              agreement: Math.round(agreement * 100) / 100,
            },
            status: 'open',
            createdAt: new Date().toISOString(),
          });
          created.push(id);
        }
      }
    }
  }

  return created;
}

// --- results / stats -------------------------------------------------------

export function computeStats(quiz, attempts) {
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const percents = submitted.map((a) => a.score.percent);
  const topic = {};
  const difficulty = {};
  const questions = {};

  for (const a of submitted) {
    for (const p of a.perQuestion) {
      const q = quiz.pool.questions[p.qi];
      if (!q) continue;
      for (const [map, key] of [[topic, q.topic], [difficulty, q.difficulty]]) {
        if (!map[key]) map[key] = { correct: 0, total: 0 };
        map[key].total += 1;
        if (p.correct) map[key].correct += 1;
      }
      if (!questions[p.qi]) questions[p.qi] = { qi: p.qi, correct: 0, total: 0, prompt: q.prompt, topic: q.topic };
      questions[p.qi].total += 1;
      if (p.correct) questions[p.qi].correct += 1;
    }
  }

  const pct = (m) => ({
    ...m,
    accuracy: m.total ? Math.round((m.correct / m.total) * 100) : 0,
  });

  const weakestTopic = Object.entries(topic)
    .map(([k, v]) => ({ topic: k, ...pct(v) }))
    .sort((a, b) => a.accuracy - b.accuracy)[0] || null;

  return {
    submissions: submitted.length,
    avgPercent: percents.length
      ? Math.round((percents.reduce((s, p) => s + p, 0) / percents.length) * 10) / 10
      : 0,
    highest: percents.length ? Math.max(...percents) : 0,
    lowest: percents.length ? Math.min(...percents) : 0,
    passed: submitted.filter((a) => a.score.passed).length,
    failed: submitted.filter((a) => !a.score.passed).length,
    topicAccuracy: Object.fromEntries(Object.entries(topic).map(([k, v]) => [k, pct(v)])),
    difficultyAccuracy: Object.fromEntries(Object.entries(difficulty).map(([k, v]) => [k, pct(v)])),
    weakestTopic,
    weakestQuestions: Object.values(questions)
      .map(pct)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5),
  };
}
