import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonCard,
  StatCard,
} from '../../components/ui/index.jsx';

export function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      const [q, h] = await Promise.all([
        api.get('/quizzes?scope=student'),
        api.get('/attempts'),
      ]);
      setQuizzes(q);
      setHistory(h);
    } catch (err) {
      setError(err.message);
      setQuizzes([]);
      setHistory([]);
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
        <SkeletonCard rows={4} />
      </div>
    );
  }

  const available = quizzes.filter(
    (q) => q.status === 'published' && !q.myAttempt,
  );
  const submitted = history.filter((a) => a.status === 'submitted');
  const avg =
    submitted.length > 0
      ? Math.round(
          (submitted.reduce((s, a) => s + (a.score?.percent || 0), 0) /
            submitted.length) * 10,
        ) / 10
      : null;

  return (
    <div>
      <PageHeader
        title={`Hi, ${(user?.name || 'Student').split(' ')[0]}`}
        subtitle="Every quiz is different — but graded against the same standard."
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Available now"
          value={available.length}
          accent={available.length > 0 ? 'indigo' : 'slate'}
        />
        <StatCard label="Completed" value={submitted.length} accent="emerald" />
        <StatCard
          label="Average score"
          value={avg === null ? '—' : `${avg}%`}
          accent="sky"
        />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Quizzes
      </h2>

      {quizzes.length === 0 ? (
        <EmptyState
          icon="📭"
          title="No quizzes yet"
          description="When your professor publishes a quiz, it will appear here."
        />
      ) : (
        <div className="grid gap-3">
          {quizzes.map((q) => {
            const attempted = q.myAttempt?.status === 'submitted';
            const inProgress = q.myAttempt?.status === 'in_progress';
            return (
              <Card key={q.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{q.title}</h3>
                      <Badge color={q.status === 'published' ? 'emerald' : 'amber'}>
                        {q.status === 'published' ? 'Open' : 'Closed'}
                      </Badge>
                      {attempted && q.myAttempt.score && (
                        <Badge
                          color={q.myAttempt.score.passed ? 'emerald' : 'rose'}
                        >
                          {q.myAttempt.score.percent}%
                        </Badge>
                      )}
                      {inProgress && <Badge color="amber">In progress</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {q.subject ? `${q.subject} · ` : ''}
                      {q.topic} · {q.questionCount} questions · {q.timeLimitMin} min
                      {q.closesAt &&
                        ` · closes ${new Date(q.closesAt).toLocaleString()}`}
                    </p>
                  </div>
                  <div>
                    {attempted ? (
                      <Button
                        variant="secondary"
                        onClick={() => navigate(`/student/quiz/${q.id}/result`)}
                      >
                        View result
                      </Button>
                    ) : (
                      <Button
                        onClick={() => navigate(`/student/quiz/${q.id}`)}
                        disabled={q.status !== 'published'}
                      >
                        {inProgress ? 'Resume quiz' : 'Start quiz'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {submitted.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recent results
          </h2>
          <Card>
            <ul className="divide-y divide-slate-50">
              {submitted.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => navigate(`/student/quiz/${a.quizId}/result`)}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{a.title}</span>
                    <span
                      className={`text-sm font-bold ${
                        a.score?.passed ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {a.score?.percent}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
