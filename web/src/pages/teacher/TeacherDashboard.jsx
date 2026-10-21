import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonCard,
  StatCard,
} from '../../components/ui/index.jsx';

const TYPE_META = {
  focus_loss: ['amber', 'Focus loss'],
  fast_answer: ['sky', 'Fast answers'],
  similarity: ['rose', 'Possible collusion'],
  clipboard: ['indigo', 'Clipboard use'],
  devtools: ['rose', 'DevTools opened'],
  fullscreen_exit: ['amber', 'Left fullscreen'],
};

export function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(null);
  const [flags, setFlags] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      const [q, f] = await Promise.all([
        api.get('/quizzes?scope=teacher'),
        api.get('/integrity/flags'),
      ]);
      setQuizzes(q);
      setFlags(f);
    } catch (err) {
      setError(err.message);
      setQuizzes([]);
      setFlags([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (quizzes === null) {
    return (
      <div className="grid gap-4">
        <SkeletonCard rows={2} />
        <SkeletonCard rows={5} />
      </div>
    );
  }

  const openQuizzes = quizzes.filter((q) => q.status === 'published');
  const submissions = quizzes.reduce((s, q) => s + q.submissions, 0);
  const openFlags = (flags || []).filter((f) => f.status === 'open');
  const recent = quizzes.slice(0, 4);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name || 'Professor'}`}
        subtitle="Integrity signals and quiz performance at a glance."
        action={
          <Button onClick={() => navigate('/teacher/quizzes/new')}>
            + Create AI Quiz
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open quizzes" value={openQuizzes.length} accent="emerald" />
        <StatCard label="Total quizzes" value={quizzes.length} accent="indigo" />
        <StatCard label="Submissions" value={submissions} accent="sky" />
        <StatCard
          label="Open integrity flags"
          value={openFlags.length}
          accent={openFlags.length > 0 ? 'rose' : 'emerald'}
          hint={openFlags.length > 0 ? 'Needs your review' : 'All clear'}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Your quizzes"
            subtitle="Most recent first"
            action={
              <Link to="/teacher/quizzes" className="text-xs font-medium text-indigo-600 hover:underline">
                View all
              </Link>
            }
          />
          {recent.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="📝"
                title="Create your first AI quiz"
                description="Gemini builds the question pool; each student receives a different but equivalent paper."
                action={
                  <Button onClick={() => navigate('/teacher/quizzes/new')}>
                    Create AI Quiz
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recent.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() => navigate(`/teacher/quizzes/${q.id}`)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{q.title}</p>
                      <p className="text-xs text-slate-400">
                        {q.topic} · {q.submissions} submissions
                        {q.avgPercent !== null ? ` · avg ${q.avgPercent}%` : ''}
                      </p>
                    </div>
                    <Badge
                      color={
                        q.status === 'published'
                          ? 'emerald'
                          : q.status === 'closed'
                            ? 'amber'
                            : 'slate'
                      }
                    >
                      {q.status}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Integrity alerts"
            subtitle="Review before making any decision"
          />
          {openFlags.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="🛡️"
                title="No open flags"
                description="Blur events, fast wrong answers and identical wrong-answer patterns are monitored automatically during quizzes."
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {openFlags.slice(0, 5).map((f) => {
                const [color, label] = TYPE_META[f.type] || ['slate', f.type];
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => navigate(`/teacher/quizzes/${f.quizId}`)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {f.studentName}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {new Date(f.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge color={color}>{label}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
