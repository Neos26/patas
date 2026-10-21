/**
 * End-to-end smoke test (no Firebase / no Gemini key required).
 * Spawns the API on :8099 and walks the whole flow:
 *   generate → publish → 2 students take it → grading → integrity flags →
 *   teacher results → AI insight → flag review → negative/authorization checks.
 *
 * Usage:  npm run smoke
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:8099/api';

const TEACHER = { uid: 'demo-teacher', role: 'teacher', name: 'Prof. Maria Santos', email: 'teacher@integrity.demo' };
const S1 = { uid: 'demo-s1', role: 'student', name: 'Juan Dela Cruz', email: 'student1@integrity.demo' };
const S2 = { uid: 'demo-s2', role: 'student', name: 'Ana Reyes', email: 'student2@integrity.demo' };

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function call(method, urlPath, { user, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers['x-dev-user'] = JSON.stringify(user);
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch { /* empty body */ }
  return { status: res.status, data };
}

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('http://localhost:8099/healthz');
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  const storeFile = path.join(ROOT, 'data', `smoke-${Date.now()}.json`);
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: '8099',
      NODE_ENV: 'test',
      STORE_FILE: storeFile,
      MOCK_MODE: 'true',
      // Hermetic: never touch real Firebase (even once serviceAccount.json exists).
      GOOGLE_APPLICATION_CREDENTIALS: '',
      FIREBASE_SERVICE_ACCOUNT_B64: '',
      FIREBASE_PROJECT_ID: '',
      GCLOUD_PROJECT: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(d));

  try {
    if (!(await waitForHealth())) throw new Error('Server did not start');
    console.log('\n— Health & mode —');
    const health = (await call('GET', '/healthz')).data;
    check('health ok', health?.ok === true);
    check('file store active', health?.store === 'file', health?.store);
    check('demo auth active', health?.auth === 'demo', health?.auth);
    check('mock gemini active', health?.gemini?.mockMode === true);

    console.log('\n— Authorization —');
    check('unauthenticated request → 401', (await call('GET', '/quizzes')).status === 401);
    check(
      'student cannot generate a quiz → 403',
      (await call('POST', '/quizzes/generate', { user: S1, body: {} })).status === 403,
    );
    check(
      'teacher cannot start an attempt → 403',
      (await call('POST', '/attempts/start', { user: TEACHER, body: { quizId: 'x' } })).status === 403,
    );

    console.log('\n— Quiz A: identification-only (integrity test) —');
    const genA = await call('POST', '/quizzes/generate', {
      user: TEACHER,
      body: {
        title: 'Integrity Demo Quiz',
        topic: 'Database Normalization',
        subject: 'IT 301',
        objectives: ['Explain 1NF', 'Explain 2NF', 'Explain 3NF'],
        count: 6,
        difficulty: { easy: 2, medium: 2, hard: 2 },
        types: ['identification'],
        timeLimitMin: 20,
      },
    });
    check('pool generated → 201', genA.status === 201, JSON.stringify(genA.data).slice(0, 200));
    const quizA = genA.data;
    check('pool has 9 questions (6 × 1.5)', quizA?.pool?.questions?.length === 9, String(quizA?.pool?.questions?.length));
    check('blueprint difficulty = 2/2/2', JSON.stringify(quizA?.blueprint?.difficulty) === '{"easy":2,"medium":2,"hard":2}');
    check('quiz starts as draft', quizA?.status === 'draft');

    check(
      'difficulty split mismatch → 400',
      (
        await call('POST', '/quizzes/generate', {
          user: TEACHER,
          body: {
            title: 'Bad quiz', topic: 'x', objectives: ['objective one'], count: 6,
            difficulty: { easy: 1, medium: 1, hard: 1 }, types: ['mcq'], timeLimitMin: 10,
          },
        })
      ).status === 400,
    );

    check('publish → 200', (await call('POST', `/quizzes/${quizA.id}/publish`, { user: TEACHER, body: { hours: 24 } })).status === 200);
    check('republish rejected → 400', (await call('POST', `/quizzes/${quizA.id}/publish`, { user: TEACHER, body: {} })).status === 400);

    const studentList = (await call('GET', '/quizzes?scope=student', { user: S1 })).data;
    check('student sees published quiz', studentList?.some((q) => q.id === quizA.id));

    // Both students answer every question identically & wrongly, fast, with tab switching.
    for (const [student, blurs] of [[S1, 4], [S2, 0]]) {
      const start = await call('POST', '/attempts/start', { user: student, body: { quizId: quizA.id } });
      check(`${student.uid} attempt starts → 201`, start.status === 201, JSON.stringify(start.data).slice(0, 160));
      const attemptId = start.data.attemptId;
      check(`${student.uid} paper has 6 questions`, start.data.questions?.length === 6);
      check(`${student.uid} answers are stripped`, start.data.questions.every((q) => q.answer === undefined && q.explanation === undefined));
      check(`${student.uid} questions are identification`, start.data.questions.every((q) => q.type === 'identification'));

      for (const q of start.data.questions) {
        const r = await call('PUT', `/attempts/${attemptId}/answer`, {
          user: student, body: { qi: q.qi, v: 'wrongxyz', t: 400 },
        });
        if (r.status !== 200) check(`${student.uid} answer saved`, false, JSON.stringify(r.data));
      }
      check(`${student.uid} all answers saved`, true);

      for (let i = 0; i < blurs; i++) {
        await call('POST', `/attempts/${attemptId}/event`, { user: student, body: { type: 'blur' } });
      }
      if (student.uid === 'demo-s1') {
        // Extra cheating signals for the new detectors.
        for (const type of ['paste', 'paste', 'devtools', 'fullscreen_exit', 'fullscreen_exit', 'copy']) {
          await call('POST', `/attempts/${attemptId}/event`, { user: student, body: { type } });
        }
      }

      const submit = await call('POST', `/attempts/${attemptId}/submit`, { user: student, body: { auto: false } });
      check(`${student.uid} submit → score 0%`, submit.status === 200 && submit.data.score?.percent === 0, JSON.stringify(submit.data?.score));
      check(`${student.uid} double submit → 409`, (await call('POST', `/attempts/${attemptId}/submit`, { user: student, body: {} })).status === 409);
    }

    console.log('\n— Integrity flags —');
    const flags = (await call('GET', `/integrity/flags?quizId=${quizA.id}`, { user: TEACHER })).data;
    const types = new Set(flags.map((f) => f.type));
    check('similarity flag raised', types.has('similarity'), [...types].join(','));
    check('focus_loss flag raised for S1', [...flags].some((f) => f.type === 'focus_loss' && f.studentId === 'demo-s1'));
    check('fast_answer flag raised', types.has('fast_answer'));
    check('clipboard flag raised (paste attempts)', types.has('clipboard'), [...types].join(','));
    check('devtools flag raised', types.has('devtools'), [...types].join(','));
    check('fullscreen_exit flag raised', types.has('fullscreen_exit'), [...types].join(','));
    const clip = flags.find((f) => f.type === 'clipboard');
    check('clipboard evidence counts 2 pastes + 1 copy',
      clip?.evidence?.pasteAttempts === 2 && clip?.evidence?.copyEvents === 1,
      JSON.stringify(clip?.evidence));
    const devFlag = flags.find((f) => f.type === 'devtools');
    check('devtools evidence = 1 press', devFlag?.evidence?.count === 1, JSON.stringify(devFlag?.evidence));
    const fsFlag = flags.find((f) => f.type === 'fullscreen_exit');
    check('fullscreen evidence = 2 exits, medium severity',
      fsFlag?.evidence?.exits === 2 && fsFlag?.severity === 'medium',
      JSON.stringify(fsFlag?.evidence) + '/' + fsFlag?.severity);
    check('S2 raised no behavioral flags',
      !flags.some((f) => f.studentId === 'demo-s2' && ['focus_loss', 'clipboard', 'devtools', 'fullscreen_exit'].includes(f.type)));
    const sim = flags.find((f) => f.type === 'similarity');
    check('similarity agreement = 1', sim?.evidence?.agreement === 1, String(sim?.evidence?.agreement));
    check(
      'similarity covers ≥3 shared wrong questions',
      (sim?.evidence?.sharedWrongQuestions?.length || 0) >= 3,
      String(sim?.evidence?.sharedWrongQuestions?.length),
    );
    check('flag is open', flags.every((f) => f.status === 'open'));

    const dismiss = await call('PATCH', `/integrity/flags/${sim.id}`, { user: TEACHER, body: { status: 'dismissed' } });
    check('teacher can dismiss flag', dismiss.status === 200 && dismiss.data.status === 'dismissed');
    check(
      'student cannot review flags → 403',
      (await call('PATCH', `/integrity/flags/${sim.id}`, { user: S1, body: { status: 'open' } })).status === 403,
    );

    console.log('\n— Results & AI insight —');
    const results = (await call('GET', `/quizzes/${quizA.id}/results`, { user: TEACHER })).data;
    check('two submissions listed', results?.results?.length === 2);
    check('stats: submissions=2', results?.stats?.submissions === 2);
    check('stats: avgPercent=0', results?.stats?.avgPercent === 0);
    check('stats: all failed', results?.stats?.failed === 2);
    check('weakest topic present', Boolean(results?.stats?.weakestTopic));
    check('flags embedded', results?.flags?.length === 7, String(results?.flags?.length));

    check(
      'other student cannot read result → 403',
      (await call('GET', `/attempts/${quizA.id}_demo-s1/result`, { user: S2 })).status === 403,
    );
    check(
      'own result readable by owner',
      (await call('GET', `/attempts/${quizA.id}_demo-s1/result`, { user: S1 })).status === 200,
    );

    const insight = await call('POST', `/quizzes/${quizA.id}/insight`, { user: TEACHER, body: {} });
    check('insight generated → 201', insight.status === 201, JSON.stringify(insight.data).slice(0, 200));
    check('insight has text', typeof insight.data?.insight?.text === 'string' && insight.data.insight.text.length > 40);
    check('insight is mock (no key)', insight.data?.insight?.source === 'mock');

    const version = (await call('GET', `/quizzes/${quizA.id}/version/demo-s1`, { user: TEACHER })).data;
    check('teacher sees exact paper', version?.questions?.length === 6);
    check('version questions include answers', version?.questions.every((q) => q.answer));

    console.log('\n— Quiz B: mcq grading with shuffled options —');
    const genB = await call('POST', '/quizzes/generate', {
      user: TEACHER,
      body: {
        title: 'MCQ Grading Test', topic: 'Primary Keys', subject: 'IT 301',
        objectives: ['Define primary keys'], count: 4,
        difficulty: { easy: 2, medium: 1, hard: 1 }, types: ['mcq'], timeLimitMin: 15,
      },
    });
    check('mcq quiz generated', genB.status === 201, JSON.stringify(genB.data).slice(0, 160));
    await call('POST', `/quizzes/${genB.data.id}/publish`, { user: TEACHER, body: { hours: 1 } });

    const startB1 = await call('POST', '/attempts/start', { user: S1, body: { quizId: genB.data.id } });
    const paper = startB1.data.questions;
    check('mcq paper exposes shuffled options', paper.every((q) => Array.isArray(q.options) && q.options.length === 4));

    // Pick the CORRECT displayed position using the teacher's answer key.
    const keyB = (await call('GET', `/quizzes/${genB.data.id}/version/demo-s1`, { user: TEACHER })).data;
    const keyByQI = Object.fromEntries(keyB.questions.map((q) => [q.qi, q.answer]));
    let perfect = true;
    for (const q of paper) {
      const pos = q.options.indexOf(keyByQI[q.qi]);
      if (pos === -1) perfect = false;
      await call('PUT', `/attempts/${startB1.data.attemptId}/answer`, {
        user: S1, body: { qi: q.qi, v: pos, t: 8000 },
      });
    }
    check('correct displayed positions found', perfect);
    const subB1 = await call('POST', `/attempts/${startB1.data.attemptId}/submit`, { user: S1, body: {} });
    check('perfect mcq score = 100%', subB1.data?.score?.percent === 100, JSON.stringify(subB1.data?.score));

    // S2 answers everything at position 0 — must grade against shuffled order.
    const startB2 = await call('POST', '/attempts/start', { user: S2, body: { quizId: genB.data.id } });
    for (const q of startB2.data.questions) {
      await call('PUT', `/attempts/${startB2.data.attemptId}/answer`, { user: S2, body: { qi: q.qi, v: 0, t: 9000 } });
    }
    const subB2 = await call('POST', `/attempts/${startB2.data.attemptId}/submit`, { user: S2, body: {} });
    const p2 = subB2.data?.score?.percent;
    check('blind mcq score is valid & ≤100', typeof p2 === 'number' && p2 >= 0 && p2 <= 100, String(p2));

    const hist = (await call('GET', '/attempts?scope=student', { user: S1 })).data;
    check('student history has 2 attempts', hist?.length === 2, String(hist?.length));

    const stats = (await call('GET', '/system/stats', { user: { uid: 'demo-admin', role: 'admin' } })).data;
    check('admin stats returned', typeof stats?.quizzes === 'number' && stats.quizzes >= 2, JSON.stringify(stats));
    check('student blocked from admin stats → 403', (await call('GET', '/system/stats', { user: S1 })).status === 403);

    console.log('\n— Material upload —');
    async function upload(fileName, content, user) {
      const fd = new FormData();
      fd.append('material', new Blob([content]), fileName);
      const headers = user ? { 'x-dev-user': JSON.stringify(user) } : {};
      const res = await fetch(`${BASE}/quizzes/upload-material`, {
        method: 'POST',
        headers,
        body: fd,
      });
      let data = null;
      try { data = await res.json(); } catch { /* empty */ }
      return { status: res.status, data };
    }

    const upTxt = await upload('notes.txt', 'ER models use entities and relationships. Keys uniquely identify rows.', TEACHER);
    check('txt material upload → 200 with extracted text',
      upTxt.status === 200 && upTxt.data?.text?.includes('Keys uniquely identify'), JSON.stringify(upTxt.data));
    check('upload reports file size/chars',
      typeof upTxt.data?.fileSize === 'number' && typeof upTxt.data?.chars === 'number');
    const upBad = await upload('program.exe', 'MZ binary', TEACHER);
    check('unsupported extension → 400', upBad.status === 400, JSON.stringify(upBad.data));
    const upNoAuth = await upload('notes.txt', 'hello', null);
    check('upload without auth → 401', upNoAuth.status === 401);
    const upStudent = await upload('notes.txt', 'hello', S1);
    check('student upload → 403', upStudent.status === 403, JSON.stringify(upStudent.data));
  } finally {
    server.kill();
    await fs.rm(storeFile, { force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('SMOKE CRASHED:', err);
  process.exit(1);
});
