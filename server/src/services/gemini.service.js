/**
 * Gemini integration — the ONLY place the API key is read.
 * Live mode: JSON-mode generateContent with timeout + retries.
 * Mock mode: deterministic fixture pools (no key / quota / network needed).
 */
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

let client = null;

function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  return client;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini timed out after ${ms}ms`)), ms),
    ),
  ]);
}

function extractJson(text) {
  if (!text) throw new Error('Gemini returned an empty response.');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response.');
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * Generates a question pool.
 * @param {object} spec  { topic, objectives, material, poolSize, difficulty, types, subject }
 * @returns {Promise<{ questions: Array, source: 'gemini'|'mock', model: string }>}
 */
export async function generateQuestionPool(spec) {
  if (env.gemini.mockMode) {
    return { questions: mockPool(spec), source: 'mock', model: 'mock-deterministic' };
  }

  const system = `You are an expert educational assessment writer creating exam items for higher-education courses.
Output ONLY a raw JSON object, no markdown, no commentary, matching exactly:
{"questions":[{"type":"mcq|true_false|identification|short_answer","difficulty":"easy|medium|hard","topic":"<topic>","objective":"<one learning objective this item assesses>","prompt":"<question text>","options":["<4 options for mcq only>","...","...","..."],"answer":"<correct option text for mcq; True/False; or expected answer>","explanation":"<1-2 sentence explanation>"}]}
Rules:
- mcq: exactly 4 plausible options; "answer" must equal one option verbatim.
- true_false: no options array; answer is "True" or "False".
- identification: short precise answer (a term or value). short_answer: a concise model answer.
- Produce EXACTLY the requested number of questions per difficulty, mixing the requested types.
- Cover every learning objective; vary stems and cognitive level (recall, apply, analyze).
- No markdown, no numbering outside prompt text, no HTML.`;

  const user = `Course subject: ${spec.subject || 'General'}
Topic: ${spec.topic}
Learning objectives:
${spec.objectives.map((o) => `- ${o}`).join('\n')}
${spec.material ? `Source material (excerpt):\n"""\n${spec.material.slice(0, 6000)}\n"""` : 'No source material provided — write items from standard curriculum knowledge for this topic.'}

Required totals:
- easy: ${spec.difficulty.easy}, medium: ${spec.difficulty.medium}, hard: ${spec.difficulty.hard}
- Question types and share of the pool: ${spec.types.join(', ')} (distribute roughly evenly across these types)
Total questions: ${spec.poolSize}. Return the full array under "questions".`;

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withTimeout(
        getClient().models.generateContent({
          model: env.gemini.model,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            temperature: 0.8,
          },
        }),
        60000,
      );
      const data = extractJson(response.text);
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('Gemini returned no questions array.');
      }
      return { questions: data.questions, source: 'gemini', model: env.gemini.model };
    } catch (err) {
      lastError = err;
      console.error(`[gemini] attempt ${attempt} failed: ${err.message}`);
    }
  }
  throw lastError;
}

/** One-shot text generation used for integrity narratives. */
export async function generateText({ system, prompt, maxOutputTokens = 1024 }) {
  if (env.gemini.mockMode) {
    return { text: mockNarrative(prompt), source: 'mock', model: 'mock-deterministic' };
  }
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withTimeout(
        getClient().models.generateContent({
          model: env.gemini.model,
          contents: prompt,
          config: {
            systemInstruction: system,
            temperature: 0.4,
            maxOutputTokens,
          },
        }),
        45000,
      );
      const text = response.text;
      if (!text) throw new Error('Empty response.');
      return { text, source: 'gemini', model: env.gemini.model };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Deterministic mock data
// ---------------------------------------------------------------------------

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISTRACTORS = [
  'It is unrelated to the topic.',
  'It applies only in exceptional cases.',
  'It is the opposite of the standard definition.',
  'It was true in earlier versions of the theory.',
];

function mockPool(spec) {
  const rand = mulberry32(hash(JSON.stringify([spec.topic, spec.difficulty, spec.types, spec.poolSize])));
  const objectives = spec.objectives.length ? spec.objectives : [spec.topic];
  const types = spec.types;
  const buckets = [];
  for (const d of ['easy', 'medium', 'hard']) {
    for (let i = 0; i < spec.difficulty[d]; i++) buckets.push(d);
  }

  return buckets.map((difficulty, idx) => {
    const objective = objectives[idx % objectives.length];
    const type = types[Math.floor(rand() * types.length)];
    const n = idx + 1;

    if (type === 'mcq') {
      const correct = `Correct understanding of ${objective} (item ${n})`;
      const options = [correct, ...DISTRACTORS.slice(0, 3).map((d) => `${d} — distractor for ${objective}`)];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      return {
        type: 'mcq', difficulty, topic: spec.topic, objective,
        prompt: `Which statement best reflects: "${objective}"? (mock item ${n})`,
        options, answer: options.find((o) => o.startsWith('Correct')), 
        explanation: `Mock item demonstrating the pool structure for "${objective}".`,
      };
    }
    if (type === 'true_false') {
      const isTrue = rand() > 0.5;
      return {
        type: 'true_false', difficulty, topic: spec.topic, objective,
        prompt: `True or False: "${objective}" is a core concept of ${spec.topic}. (mock item ${n})`,
        answer: isTrue ? 'True' : 'False',
        explanation: `Mock item covering "${objective}".`,
      };
    }
    if (type === 'identification') {
      return {
        type: 'identification', difficulty, topic: spec.topic, objective,
        prompt: `Identify the key idea associated with: "${objective}" in ${spec.topic}. (mock item ${n})`,
        answer: objective,
        explanation: `Mock item covering "${objective}".`,
      };
    }
    return {
      type: 'short_answer', difficulty, topic: spec.topic, objective,
      prompt: `Briefly explain how "${objective}" relates to ${spec.topic}. (mock item ${n})`,
      answer: objective,
      explanation: `Mock item covering "${objective}".`,
    };
  });
}

function mockNarrative(prompt) {
  const weak = prompt.match(/"topic":"([^"]+)"/)?.[1] || 'the highlighted topic';
  return [
    `AI INSIGHT (mock mode — set GEMINI_API_KEY for real analysis)`,
    ``,
    `Students showed solid performance overall but noticeably weaker results on ${weak}.`,
    `Recommendation: revisit the foundational concepts of ${weak} with a short worked example before the next lesson.`,
    `Recommendation: consider a brief remedial exercise targeting the lowest-accuracy questions before advancing.`,
    ``,
    `Note: these are suggestions only — instructional decisions remain with the teacher.`,
  ].join('\n');
}
