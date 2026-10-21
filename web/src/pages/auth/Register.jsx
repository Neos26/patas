import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card, FullScreenLoader } from '../../components/ui/index.jsx';
import toast from 'react-hot-toast';

const FIREBASE_ERRORS = {
  'auth/email-already-in-use': 'An account with that email already exists.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/operation-not-allowed': 'Email/password sign-in is disabled in Firebase Auth.',
};

const ROLE_OPTIONS = [
  {
    role: 'teacher',
    icon: '🛡️',
    title: 'I am a teacher',
    desc: 'Create AI quizzes, review results, inspect integrity flags.',
    color: 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50',
  },
  {
    role: 'student',
    icon: '🎓',
    title: 'I am a student',
    desc: 'Take fair, randomized quizzes under integrity monitoring.',
    color: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50',
  },
];

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export function Register() {
  const navigate = useNavigate();
  const { user, role, mode, loading, signInSession, retryRole, configured } = useAuth();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [selectedRole, setSelectedRole] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (loading || mode === null) return <FullScreenLoader label="Detecting server mode…" />;
  if (user && role) return <Navigate to="/" replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    if (!selectedRole) return 'Choose whether you are a teacher or a student.';
    if (form.name.trim().length < 2) return 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) return setError(problem);

    setSubmitting(true);
    try {
      const email = form.email.trim().toLowerCase();
      const name = form.name.trim();

      if (mode === 'firebase') {
        // 1) create the Auth account, 2) attach profile + role claims server-side.
        const cred = await createUserWithEmailAndPassword(auth, email, form.password);
        await api.post('/auth/register', { name, role: selectedRole });
        await retryRole();
        toast.success('Account created');
        navigate('/', { replace: true });
        return cred;
      }

      const res = await api.post('/auth/register', {
        name,
        email,
        password: form.password,
        role: selectedRole,
      });
      signInSession(res.user);
      toast.success(`Welcome, ${res.user.name}!`);
      navigate('/', { replace: true });
      return res;
    } catch (err) {
      if (mode === 'firebase' && err.code && FIREBASE_ERRORS[err.code]) {
        setError(FIREBASE_ERRORS[err.code]);
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 px-4 py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white">
            🛡️
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'firebase'
              ? 'Registered with Firebase Authentication.'
              : 'Stored locally on this demo server.'}
          </p>
        </div>

        {!configured && mode === 'firebase' ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
            The server requires Firebase but this web build is missing its
            VITE_FIREBASE_* configuration.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">I am a…</p>
              <div className="grid gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => setSelectedRole(r.role)}
                    className={`flex w-full items-start gap-3 rounded-xl border bg-white px-4 py-3 text-left transition ${
                      selectedRole === r.role
                        ? 'border-indigo-500 ring-2 ring-indigo-100'
                        : r.color
                    }`}
                  >
                    <span className="text-xl" aria-hidden="true">
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
              </div>
            </div>

            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
                Full name
              </label>
              <input
                id="name"
                type="text"
                required
                autoComplete="name"
                value={form.name}
                onChange={set('name')}
                placeholder="Juan Dela Cruz"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@school.edu"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="reg-password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set('password')}
                  placeholder="min. 8 chars"
                  className={inputCls}
                />
              </div>
              <div>
                <label
                  htmlFor="reg-confirm"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Confirm
                </label>
                <input
                  id="reg-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  placeholder="repeat password"
                  className={inputCls}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Button type="submit" loading={submitting} className="w-full" size="lg">
              Create account
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-[11px] text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
