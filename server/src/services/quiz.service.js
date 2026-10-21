/**
 * Quiz domain logic: pool generation, publishing, and fair per-student
 * paper assembly (seeded, reproducible, blueprint-identical).
 */
import { store } from '../store.js';
import { generateQuestionPool } from './gemini.service.js';
import { ApiError } from '../utils/errors.js';

export const DIFFS = ['easy', 'medium', 'hard'];
export const TYPES = ['mcq', 'true_false', 'identification', 'short_answer'];
export const POOL_FACTOR = 1.5;
export const PASS_PERCENT = 60;

// --- deterministic PRNG -----------------------------------------------------

export function fnvHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let s = seed;
  return function rand() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- question normalization -------------------------------------------------

function normText(s) {
  return String(s ?? '').trim();
}

function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = TYPES.includes(raw.type) ? raw.type : null;
  const difficulty = DIFFS.includes(raw.difficulty) ? raw.difficulty : null;
  const prompt = normText(raw.prompt);
  if (!type || !difficulty || prompt.length < 5) return null;

  const base = {
    type,
    difficulty,
    topic: normText(raw.topic) || 'General',
    objective: normText(raw.objective) || normText(raw.topic) || 'General',
    prompt,
    explanation: normText(raw.explanation) || null,
  };

  if (type === 'mcq') {
    const options = Array.isArray(raw.options)
      ? raw.options.map(normText).filter((o) => o.length > 0)
      : [];
    if (new Set(options).size < 2) return null;
    const answerIdx = options.findIndex(
      (o) => o.toLowerCase() === normText(raw.answer).toLowerCase(),
    );
    if (answerIdx === -1) return null;
    return { ...base, options, answerIndex: answerIdx };
  }

  if (type === 'true_false') {
    const a = normText(raw.answer).toLowerCase();
    if (a !== 'true' && a !== 'false') return null;
    return { ...base, answer: a === 'true' ? 'True' : 'False' };
  }

  const answer = normText(raw.answer);
  if (!answer) return null;
  return { ...base, answer };
}

export function displayAnswer(q) {
  if (q.type === 'mcq') return q.options[q.answerIndex];
  return q.answer;
}

// --- generate ---------------------------------------------------------------

export async function generateQuiz(user, input) {
  const poolBucket = {};
  let poolSize = 0;
  for (const d of DIFFS) {
    poolBucket[d] = input.difficulty[d] > 0 ? Math.ceil(input.difficulty[d] * POOL_FACTOR) : 0;
    poolSize += poolBucket[d];
  }

  const started = Date.now();
  const result = await generateQuestionPool({
    topic: input.topic,
    subject: input.subject,
    objectives: input.objectives,
    material: input.material,
    difficulty: poolBucket,
    types: input.types,
    poolSize,
  });

  const questions = result.questions
    .map(normalizeQuestion)
    .filter(Boolean);

  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  for (const q of questions) byDifficulty[q.difficulty] += 1;

  // The pool must be able to satisfy every student's blueprint exactly.
  for (const d of DIFFS) {
    if (byDifficulty[d] < input.difficulty[d]) {
      throw new ApiError(
        422,
        `The generated pool has only ${byDifficulty[d]} "${d}" question(s) but each quiz needs ${input.difficulty[d]}. Please regenerate.`,
        { pool: byDifficulty, requested: input.difficulty },
      );
    }
  }

  const quizId = await store.add('quizzes', {
    title: input.title,
    subject: input.subject || null,
    topic: input.topic,
    objectives: input.objectives,
    blueprint: {
      count: input.count,
      difficulty: input.difficulty,
      types: input.types,
      timeLimitMin: input.timeLimitMin,
    },
    pool: {
      questions,
      byDifficulty,
      generatedAt: new Date().toISOString(),
      source: result.source,
      model: result.model,
      latencyMs: Date.now() - started,
    },
    status: 'draft',
    createdBy: user.uid,
    createdByName: user.name || user.email || 'Teacher',
    createdAt: new Date().toISOString(),
    opensAt: null,
    closesAt: null,
  });

  return getQuizForTeacher(quizId, user);
}

export async function getQuizForTeacher(quizId, user) {
  const quiz = await store.get('quizzes', quizId);
  if (!quiz) throw new ApiError(404, 'Quiz not found.');
  if (quiz.createdBy !== user.uid && user.role !== 'admin') {
    throw new ApiError(403, 'You do not own this quiz.');
  }
  return quiz;
}

export async function publishQuiz(user, quizId, { hours = 24 } = {}) {
  const quiz = await getQuizForTeacher(quizId, user);
  if (quiz.status !== 'draft') throw new ApiError(400, 'Quiz is already published.');
  const now = Date.now();
  return store.patch('quizzes', quizId, {
    status: 'published',
    opensAt: new Date(now).toISOString(),
    closesAt: new Date(now + hours * 3600 * 1000).toISOString(),
  });
}

export async function closeQuiz(user, quizId) {
  const quiz = await getQuizForTeacher(quizId, user);
  if (quiz.status !== 'published') throw new ApiError(400, 'Quiz is not open.');
  return store.patch('quizzes', quizId, {
    status: 'closed',
    closesAt: new Date().toISOString(),
  });
}

// --- fair per-student assembly ---------------------------------------------

export async function assembleVersion(quiz, studentId) {
  const existing = await store.get('quizVersions', `${quiz.id}_${studentId}`);
  if (existing) return existing;

  const rand = mulberry32(fnvHash(`${quiz.id}:${studentId}`));
  const pool = quiz.pool.questions;
  const selected = [];

  for (const d of DIFFS) {
    const need = quiz.blueprint.difficulty[d];
    if (need <= 0) continue;
    const candidates = seededShuffle(
      pool.map((q, idx) => idx).filter((idx) => pool[idx].difficulty === d),
      rand,
    );
    for (const idx of candidates.slice(0, need)) selected.push(idx);
  }

  const questionIndexes = seededShuffle(selected, rand);
  const optionOrders = {};
  for (const qi of questionIndexes) {
    const q = pool[qi];
    if (q.type === 'mcq') {
      optionOrders[qi] = seededShuffle(q.options.map((_, i) => i), rand);
    }
  }

  const version = {
    id: `${quiz.id}_${studentId}`,
    quizId: quiz.id,
    studentId,
    questionIndexes,
    optionOrders,
    seed: fnvHash(`${quiz.id}:${studentId}`),
    createdAt: new Date().toISOString(),
  };
  await store.set('quizVersions', version.id, version);
  return version;
}

/** Strip answers/explanations for the live quiz player. */
export function sanitizeForStudent(quiz, version) {
  const pool = quiz.pool.questions;
  return version.questionIndexes.map((qi) => {
    const q = pool[qi];
    const item = {
      qi,
      type: q.type,
      prompt: q.prompt,
      topic: q.topic,
      difficulty: q.difficulty,
    };
    if (q.type === 'mcq') {
      item.options = version.optionOrders[qi].map((orig) => q.options[orig]);
    }
    return item;
  });
}
