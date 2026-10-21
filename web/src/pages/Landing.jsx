import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, FullScreenLoader } from '../components/ui/index.jsx';

const HOME = { admin: '/admin', teacher: '/teacher', student: '/student' };

const FEATURES = [
  {
    icon: '📝',
    title: 'Question pools on demand',
    desc: 'Teachers describe a topic and get a publish-ready pool of multiple-choice and short-answer questions.',
  },
  {
    icon: '🔀',
    title: 'Fair randomization',
    desc: 'Every student receives their own seeded shuffle of questions, options, and answers — same pool, different paper.',
  },
  {
    icon: '🛡️',
    title: 'Proctored quiz player',
    desc: 'Fullscreen enforcement, focus-loss tracking, clipboard and devtools monitoring, timed auto-submit.',
  },
  {
    icon: '🚩',
    title: 'Integrity flags, human decisions',
    desc: 'Deterministic detectors raise flags with evidence — the teacher always decides what they mean.',
  },
  {
    icon: '📊',
    title: 'Results with narrative',
    desc: 'Scores, per-question analytics, and an AI-written summary of integrity and performance trends.',
  },
  {
    icon: '👥',
    title: 'Three roles out of the box',
    desc: 'Teachers author and review, students take quizzes, admins watch platform stats — sign in and explore.',
  },
];

const STEPS = [
  { n: '1', title: 'Create', desc: 'Generate a question pool, review it, and publish it with a closing time.' },
  { n: '2', title: 'Take', desc: 'Students open a randomized, fullscreen-monitored attempt on their own device.' },
  { n: '3', title: 'Review', desc: 'Inspect scores, integrity flags, and the AI narrative — then decide.' },
];

export function Landing() {
  const { user, role, loading } = useAuth();

  if (loading) return <FullScreenLoader label="Loading…" />;
  if (user) return <Navigate to={HOME[role] || '/login'} replace />;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg text-white">
              🛡️
            </span>
            <span className="text-lg font-bold tracking-tight">Patas</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Sign in
            </Link>
            <Link to="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-indigo-100">
            RAITE 2026 · live hackathon demo
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Fair assessments, verified integrity.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-indigo-100 sm:text-lg">
            Patas is an AI-powered academic integrity &amp; fair assessment
            platform: generate quizzes, randomize them fairly for every student,
            run them under proctoring, and review integrity flags with an
            AI-written report.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register">
              <Button
                size="lg"
                className="bg-white !text-indigo-700 hover:bg-indigo-50"
              >
                Create an account
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="ghost"
                className="border border-white/30 !text-white hover:!bg-white/10"
              >
                Sign in to the demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Everything you need for fair assessment
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-300 hover:shadow-sm"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-2xl">
                {f.icon}
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-base font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Explore the demo in ten seconds
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Pick a teacher, student, or admin role and walk through a seeded
          classroom — no setup required.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/login">
            <Button size="lg">Open the demo</Button>
          </Link>
          <Link to="/register">
            <Button size="lg" variant="secondary">
              Create an account
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <span className="flex items-center gap-2">
            <span className="text-base">🛡️</span> Patas — AI Smart Assessment
          </span>
          <span>Built for RAITE 2026</span>
        </div>
      </footer>
    </div>
  );
}
