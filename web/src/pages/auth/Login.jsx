import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card, ErrorState, FullScreenLoader } from '../../components/ui/index.jsx';
import toast from 'react-hot-toast';

const FIREBASE_ERRORS = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found for that email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/user-disabled': 'This account has been disabled.',
};

const DEMO_ROLES = [
  {
    role: 'teacher',
    icon: '🛡️',
    title: 'Teacher',
    desc: 'Create AI quizzes, review results, inspect integrity flags.',
    color: 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50',
  },
  {
    role: 'student',
    icon: '🎓',
    title: 'Student',
    desc: 'Take a fair, randomized quiz under integrity monitoring.',
    color: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50',
  },
  {
    role: 'admin',
    icon: '⚙️',
    title: 'Administrator',
    desc: 'View system statistics and manage the platform.',
    color: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50',
  },
];

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, signInDemo, signInSession, isDemo, configured, mode, roleError } =
    useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (loading || mode === null) return <FullScreenLoader label="Detecting server mode…" />;

  // Never auto-return to an active quiz player URL: after a sign-out the next
  // account may be different, and it must start from its own dashboard.
  const fromPath = location.state?.from?.pathname;
  const safeFrom = fromPath && !fromPath.startsWith('/student/quiz/') ? fromPath : '/';

  if (!loading && user) {
    return <Navigate to={safeFrom} replace />;
  }

  function handleDemo(role) {
    signInDemo(role);
    toast.success(`Signed in as ${role}`);
    navigate('/', { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isDemo) {
        const res = await api.post('/auth/login', {
          email: email.trim().toLowerCase(),
          password,
        });
        signInSession(res.user);
        toast.success(`Signed in as ${res.user.name}`);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success('Signed in');
      }
      navigate(safeFrom, { replace: true });
    } catch (err) {
      if (isDemo) setError(err.message || 'Sign-in failed. Please try again.');
      else setError(FIREBASE_ERRORS[err.code] || 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const credentialForm = (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teacher@integrity.demo"
          className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}
      <Button type="submit" loading={submitting} className="w-full" size="lg">
        Sign in
      </Button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 px-4 py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white">
            🛡️
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Sign in to Patas</h1>
        </div>

        {!isDemo && !configured ? (
          <div className="mt-7">
            <ErrorState
              title="Server needs Firebase sign-in"
              message={
                roleError ||
                'The API is running in Firebase mode but this web build has no VITE_FIREBASE_* configuration. Add it to web/.env and rebuild.'
              }
            />
          </div>
        ) : isDemo ? (
          <div className="mt-7 space-y-3">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-400">
              Quick demo — pick a role
            </p>
            {DEMO_ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => handleDemo(r.role)}
                className={`flex w-full items-start gap-3 rounded-xl border bg-white px-4 py-3.5 text-left transition ${r.color}`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {r.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    {r.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{r.desc}</span>
                </span>
              </button>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] uppercase tracking-wide text-slate-400">
                or sign in with email
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            {credentialForm}
          </div>
        ) : (
          <div className="mt-8">{credentialForm}</div>
        )}

        {(isDemo || configured) && (
          <p className="mt-5 text-center text-[11px] text-slate-500">
            New here?{' '}
            <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Create an account
            </Link>
          </p>
        )}

        {isDemo && (
          <p className="mt-3 text-center text-[11px] text-slate-400">
            Demo data: server &rarr; <span className="font-mono">npm run seed</span>
          </p>
        )}
      </Card>
      <Link
        to="/"
        className="mt-5 text-center text-xs font-medium text-indigo-100 transition hover:text-white"
      >
        &larr; Back to home
      </Link>
    </div>
  );
}
