/**
 * Idempotent demo-data seeder — works in BOTH modes:
 *   - file mode (no Firebase): fixed demo UIDs used by the demo login screen
 *   - Firestore mode: creates real Auth users (password below) + profile docs
 *
 * Usage:  npm run seed   (also auto-runs on serverless cold start via api/index.js)
 */
import { pathToFileURL } from 'node:url';
import { auth, firebaseStatus } from '../config/firebase.js';
import { store } from '../store.js';
import { assembleVersion } from '../services/quiz.service.js';
import { submitAttempt } from '../services/attempt.service.js';
import { hashPassword } from '../utils/passwords.js';

const PASSWORD = 'Password123!';
const FILE_PASSWORD_HASH = hashPassword(PASSWORD);
const DEMO = '@integrity.demo';

const FILE_MODE_USERS = [
  { uid: 'demo-admin', email: `admin${DEMO}`, name: 'Admin Rivera', role: 'admin' },
  { uid: 'demo-teacher', email: `teacher${DEMO}`, name: 'Prof. Maria Santos', role: 'teacher' },
  { uid: 'demo-s1', email: `student1${DEMO}`, name: 'Juan Dela Cruz', role: 'student' },
  { uid: 'demo-s2', email: `student2${DEMO}`, name: 'Ana Reyes', role: 'student' },
  { uid: 'demo-s3', email: `student3${DEMO}`, name: 'Mark Villanueva', role: 'student' },
  { uid: 'demo-s4', email: `student4${DEMO}`, name: 'Sofia Garcia', role: 'student' },
];

const SUBJECTS = [
  { code: 'IT 301', name: 'Database Systems' },
  { code: 'IT 205', name: 'Data Structures & Algorithms' },
];

// --- demo quiz (published, ready to take) ----------------------------------

const DEMO_QUIZ_ID = 'demo-quiz-dbms-midterm';

const DEMO_POOL = [
  // easy ×5
  { type: 'mcq', difficulty: 'easy', topic: 'SQL Basics', objective: 'Apply basic SQL row filtering',
    prompt: 'Which SQL clause is used to filter rows in a query?',
    options: ['ORDER BY', 'WHERE', 'GROUP BY', 'HAVING'], answerIndex: 1,
    explanation: 'WHERE filters rows before grouping.' },
  { type: 'mcq', difficulty: 'easy', topic: 'SQL Basics', objective: 'Retrieve data with SELECT',
    prompt: 'Which statement is used to retrieve data from a database?',
    options: ['INSERT', 'UPDATE', 'SELECT', 'DELETE'], answerIndex: 2,
    explanation: 'SELECT reads data from one or more tables.' },
  { type: 'mcq', difficulty: 'easy', topic: 'Keys', objective: 'Identify primary keys',
    prompt: 'What is a primary key of a table?',
    options: ['A column that can contain duplicates', 'A column that uniquely identifies each row',
      'A column used only for sorting', 'A column that is always numeric'], answerIndex: 1,
    explanation: 'A primary key uniquely identifies each row and cannot be NULL.' },
  { type: 'mcq', difficulty: 'easy', topic: 'SQL Basics', objective: 'Sort query results',
    prompt: 'Which clause sorts the result set of a query?',
    options: ['WHERE', 'HAVING', 'DISTINCT', 'ORDER BY'], answerIndex: 3,
    explanation: 'ORDER BY sorts rows ascending or descending.' },
  { type: 'mcq', difficulty: 'easy', topic: 'ER Model', objective: 'Read ER diagram symbols',
    prompt: 'In an ER diagram, a rectangle represents:',
    options: ['A relationship', 'An attribute', 'A key constraint', 'An entity'], answerIndex: 3,
    explanation: 'Rectangles are entities, diamonds are relationships, ovals are attributes.' },
  // medium ×3
  { type: 'mcq', difficulty: 'medium', topic: 'Normalization', objective: 'Explain second normal form',
    prompt: 'A relation is in 2NF when it is in 1NF and:',
    options: ['It contains no repeating groups',
      'No non-key attribute depends on only part of a composite primary key',
      'All transitive dependencies are removed', 'Every foreign key references a primary key'],
    answerIndex: 1,
    explanation: '2NF removes partial dependencies on part of a composite key.' },
  { type: 'mcq', difficulty: 'medium', topic: 'Joins', objective: 'Choose the correct join type',
    prompt: 'Which JOIN returns only rows with matching values in both tables?',
    options: ['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN'], answerIndex: 2,
    explanation: 'INNER JOIN keeps only matching rows from both sides.' },
  { type: 'mcq', difficulty: 'medium', topic: 'Transactions', objective: 'Apply ACID properties',
    prompt: 'Which ACID property ensures a transaction is all-or-nothing?',
    options: ['Consistency', 'Isolation', 'Durability', 'Atomicity'], answerIndex: 3,
    explanation: 'Atomicity treats every transaction as a single indivisible unit.' },
  // hard ×2
  { type: 'mcq', difficulty: 'hard', topic: 'Normalization', objective: 'Compute candidate keys from FDs',
    prompt: 'Relation R(A,B,C,D) has functional dependencies A→B, B→C, A→D. What is a candidate key?',
    options: ['A and B', 'A only', 'B only', 'A, B and D'], answerIndex: 1,
    explanation: 'A determines all attributes (A→B, A→D, and B→C), so A alone is a key.' },
  { type: 'mcq', difficulty: 'hard', topic: 'Concurrency', objective: 'Analyze two-phase locking',
    prompt: 'Under two-phase locking, a deadlock can occur when:',
    options: ['A transaction reads uncommitted data', 'Locks are released before commit',
      'Two transactions each hold locks the other is waiting for', 'A transaction escalates row locks to table locks'],
    answerIndex: 2,
    explanation: 'Circular wait on held locks is the classic 2PL deadlock.' },
];

function posOf(version, qi, origIdx) {
  return version.optionOrders[qi].indexOf(origIdx);
}

async function seedAttempt(quiz, student, { answers, events = [] }) {
  const attemptId = `${quiz.id}_${student.uid}`;
  if (await store.get('attempts', attemptId)) return false;

  const now = Date.now();
  await store.set('attempts', attemptId, {
    id: attemptId,
    quizId: quiz.id,
    studentId: student.uid,
    studentName: student.name,
    status: 'in_progress',
    startedAt: new Date(now - 5 * 60000).toISOString(),
    endsAt: new Date(now + 10 * 60000).toISOString(),
    answers,
    events,
    score: null,
    perQuestion: [],
    submittedAt: null,
    autoSubmitted: false,
  });
  // Grade + flag through the real pipeline so demo data behaves exactly like
  // a live submission (same scoring, same integrity detectors).
  await submitAttempt(
    { uid: student.uid, name: student.name, role: 'student' },
    attemptId,
  );
  return true;
}

function buildAnswers(quiz, version, wrongQis, { right, wrong }) {
  const answers = {};
  version.questionIndexes.forEach((qi, i) => {
    const q = quiz.pool.questions[qi];
    if (wrongQis.has(qi)) {
      answers[qi] = { v: posOf(version, qi, (q.answerIndex + 1) % 4), t: wrong + i * 150 };
    } else {
      answers[qi] = { v: posOf(version, qi, q.answerIndex), t: right + i * 850 };
    }
  });
  return answers;
}

async function seedDemoQuizAndAttempts(teacher, students) {
  let quiz = await store.get('quizzes', DEMO_QUIZ_ID);
  if (!quiz) {
    quiz = {
      id: DEMO_QUIZ_ID,
      title: 'Midterm Quiz — SQL & Normalization',
      subject: 'IT 301',
      topic: 'SQL & Normalization',
      objectives: [
        'Write SQL queries using SELECT with WHERE and ORDER BY',
        'Explain normalization forms (1NF, 2NF, 3NF)',
        'Apply join and transaction concepts in relational databases',
      ],
      blueprint: {
        count: 6,
        difficulty: { easy: 3, medium: 2, hard: 1 },
        types: ['mcq'],
        timeLimitMin: 15,
      },
      pool: {
        questions: DEMO_POOL,
        byDifficulty: { easy: 5, medium: 3, hard: 2 },
        generatedAt: ts(),
        source: 'seed',
        model: null,
        latencyMs: 0,
      },
      status: 'published',
      createdBy: teacher.uid,
      createdByName: teacher.name,
      createdAt: ts(),
      opensAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      closesAt: new Date(Date.now() + 23 * 3600 * 1000).toISOString(),
    };
    await store.set('quizzes', DEMO_QUIZ_ID, quiz);
    console.log(`  + quiz "${quiz.title}" (published, ${DEMO_POOL.length}-question pool)`);
  }

  const [s1, s2, s3, s4] = ['demo-s1', 'demo-s2', 'demo-s3', 'demo-s4'].map((uid) =>
    students.find((s) => s.uid === uid),
  );
  if (!s1 || !s2 || !s3 || !s4) return;

  // Juan: 3 correct + 3 implausibly fast wrong answers + 4 tab switches
  //   → focus_loss + fast_answer flags, score 50%.
  if (await seedAttempt(quiz, s1, await buildJuan(quiz))) {
    console.log('  + attempt Juan (→ focus_loss + fast_answer flags)');
  }

  // Ana & Mark: identical WRONG answers on every question they share
  //   → similarity flag (agreement 1.0) when Mark submits.
  const shared = await buildPairAnswers(quiz, s2, s3);
  if (await seedAttempt(quiz, s2, { answers: shared.answers2 })) {
    console.log('  + attempt Ana');
  }
  if (await seedAttempt(quiz, s3, { answers: shared.answers3 })) {
    console.log('  + attempt Mark (→ similarity flag with Ana)');
  }

  // Sofia: clean submission, all correct → 100%.
  const v4 = await assembleVersion(quiz, s4.uid);
  const answers4 = buildAnswers(quiz, v4, new Set(), { right: 4200, wrong: 5200 });
  if (await seedAttempt(quiz, s4, { answers: answers4 })) {
    console.log('  + attempt Sofia (100%, no flags)');
  }

  const flags = await store.all('integrityFlags', {
    where: [['quizId', '==', DEMO_QUIZ_ID]],
  });
  const types = [...new Set(flags.map((f) => f.type))].sort();
  console.log(`  = integrity flags: ${flags.length} (${types.join(', ') || 'none'})`);

  async function buildJuan(q) {
    const version = await assembleVersion(q, s1.uid);
    const answers = {};
    version.questionIndexes.forEach((qi, i) => {
      const question = q.pool.questions[qi];
      if (i < 3) {
        answers[qi] = { v: posOf(version, qi, question.answerIndex), t: 5600 + i * 2400 };
      } else {
        // wrong choice, answered in 700ms → fast_answer detector
        answers[qi] = { v: posOf(version, qi, (question.answerIndex + 2) % 4), t: 700 };
      }
    });
    const events = [];
    const base = Date.now() - 4 * 60000;
    for (let i = 0; i < 4; i++) {
      events.push({ type: 'blur', at: new Date(base + i * 45000).toISOString() });
      events.push({ type: 'focus', at: new Date(base + i * 45000 + 8000).toISOString() });
    }
    return { answers, events };
  }

  async function buildPairAnswers(q, a2, a3) {
    const v2 = await assembleVersion(q, a2.uid);
    const v3 = await assembleVersion(q, a3.uid);
    const set3 = new Set(v3.questionIndexes);
    const sharedQis = new Set(v2.questionIndexes.filter((qi) => set3.has(qi)));
    return {
      answers2: buildAnswers(q, v2, sharedQis, { right: 6800, wrong: 5200 }),
      answers3: buildAnswers(q, v3, sharedQis, { right: 7200, wrong: 5400 }),
    };
  }
}

const ts = () => new Date().toISOString();

async function ensureFirestoreUser(uc) {
  let userRecord;
  try {
    userRecord = await auth().getUserByEmail(uc.email);
    console.log(`  = ${uc.email} (${uc.role}) exists`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    userRecord = await auth().createUser({
      email: uc.email,
      password: PASSWORD,
      displayName: uc.name,
    });
    console.log(`  + ${uc.email} (${uc.role}) created`);
  }
  await auth().setCustomUserClaims(userRecord.uid, {
    role: uc.role,
    teacherId: uc.role === 'teacher' ? userRecord.uid : null,
    studentId: uc.role === 'student' ? userRecord.uid : null,
  });
  await store.set('users', userRecord.uid, {
    role: uc.role,
    name: uc.name,
    email: uc.email,
    active: true,
    createdAt: ts(),
  });
  return { uid: userRecord.uid, ...uc };
}

async function ensureFileUser(uc) {
  const existing = await store.get('users', uc.uid);
  if (!existing) {
    await store.set('users', uc.uid, {
      role: uc.role,
      name: uc.name,
      email: uc.email,
      active: true,
      passwordHash: FILE_PASSWORD_HASH,
      createdAt: ts(),
    });
    console.log(`  + ${uc.email} (${uc.role}) created`);
  } else if (!existing.passwordHash) {
    await store.patch('users', uc.uid, { passwordHash: FILE_PASSWORD_HASH });
    console.log(`  = ${uc.email} (${uc.role}) exists (password set)`);
  } else {
    console.log(`  = ${uc.email} (${uc.role}) exists`);
  }
  return uc;
}

export async function seedDemo() {
  const firestoreMode = firebaseStatus().ready;
  if (!firestoreMode) {
    const { status, detail } = firebaseStatus();
    console.log(`Firebase not configured (${status}) → seeding the local JSON store.`);
    console.log(`  reason: ${detail}`);
    if (status === 'error' || process.env.FIREBASE_PROJECT_ID) {
      console.log(`
  To seed Firestore instead:
    1. Firebase Console -> Project settings -> Service accounts
       -> "Generate new private key" (downloads a .json file)
    2. Save it as:  server/serviceAccount.json
       (or set FIREBASE_SERVICE_ACCOUNT_B64 in server/.env)
    3. npm run seed
    4. restart npm run dev  -> GET /healthz should show "store": "firestore"`);
    }
    console.log('');
  }

  console.log('Seeding demo data…');
  const users = [];
  for (const uc of FILE_MODE_USERS) {
    users.push(firestoreMode ? await ensureFirestoreUser(uc) : await ensureFileUser(uc));
  }
  const teacher = users.find((u) => u.role === 'teacher');
  const students = users.filter((u) => u.role === 'student');

  // Subjects
  const subjects = [];
  for (const s of SUBJECTS) {
    const existing = (await store.all('subjects', { where: [['code', '==', s.code]] }))[0];
    if (existing) {
      subjects.push(existing);
    } else {
      const id = await store.add('subjects', { ...s, createdAt: ts() });
      subjects.push({ id, ...s });
      console.log(`  + subject ${s.code}`);
    }
  }

  // Teacher profile docs (id = uid for easy lookups)
  await store.set('teachers', teacher.uid, {
    uid: teacher.uid,
    name: teacher.name,
    email: teacher.email,
    createdAt: ts(),
  });
  for (const s of students) {
    await store.set('students', s.uid, {
      uid: s.uid,
      name: s.name,
      email: s.email,
      createdAt: ts(),
    });
  }

  // One class per subject
  for (const subject of subjects) {
    const existingClass = (
      await store.all('classes', {
        where: [
          ['subjectId', '==', subject.id],
          ['teacherId', '==', teacher.uid],
        ],
      })
    )[0];

    let classId;
    if (existingClass) {
      classId = existingClass.id;
    } else {
      classId = await store.add('classes', {
        name: `BSIT 3A — ${subject.code}`,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        teacherId: teacher.uid,
        teacherName: teacher.name,
        schoolYear: '2025-2026',
        createdAt: ts(),
      });
      console.log(`  + class ${subject.code}`);
    }

    for (const student of students) {
      const dup = (
        await store.all('enrollments', {
          where: [
            ['classId', '==', classId],
            ['studentId', '==', student.uid],
          ],
        })
      )[0];
      if (!dup) {
        await store.add('enrollments', {
          classId,
          studentId: student.uid,
          studentName: student.name,
          teacherId: teacher.uid,
          subjectId: subject.id,
          createdAt: ts(),
        });
      }
    }
  }

  // Demo quiz + graded attempts + integrity flags
  console.log('\nDemo quiz & attempts…');
  await seedDemoQuizAndAttempts(teacher, students);

  console.log(`\nDemo accounts (password for all: ${PASSWORD})${firestoreMode ? '' : ' — or use the demo role picker'}:`);
  for (const u of users) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  console.log(`\nStore: ${store.mode}. Seed complete.`);
}

// CLI runner (`npm run seed`) — skipped when imported by the serverless entry.
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  seedDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
