import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonCard,
} from '../../components/ui/index.jsx';

const STATUS_BADGE = {
  draft: ['slate', 'Draft'],
  published: ['emerald', 'Open'],
  closed: ['amber', 'Closed'],
};

export function QuizzesPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      setQuizzes(await api.get('/quizzes?scope=teacher'));
    } catch (err) {
      setError(err.message);
      setQuizzes([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="AI Quizzes"
        subtitle="Generate a question pool with Gemini, publish, and monitor integrity."
        action={
          <Button onClick={() => navigate('/teacher/quizzes/new')}>
            + Create AI Quiz
          </Button>
        }
      />

      {quizzes === null && !error && (
        <div className="grid gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {quizzes && !error && quizzes.length === 0 && (
        <EmptyState
          icon="📝"
          title="No quizzes yet"
          description="Create your first AI-generated quiz. Each student receives a different but academically equivalent paper."
          action={
            <Button onClick={() => navigate('/teacher/quizzes/new')}>
              Create AI Quiz
            </Button>
          }
        />
      )}

      {quizzes && quizzes.length > 0 && (
        <div className="grid gap-3">
          {quizzes.map((q) => {
            const [color, label] = STATUS_BADGE[q.status] || ['slate', q.status];
            return (
              <Card
                key={q.id}
                className="cursor-pointer p-5 transition hover:border-indigo-300 hover:shadow"
                onClick={() => navigate(`/teacher/quizzes/${q.id}`)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-slate-900">{q.title}</h3>
                      <Badge color={color}>{label}</Badge>
                      {q.poolSource === 'mock' && <Badge color="amber">mock AI</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {q.topic}
                      {q.subject ? ` · ${q.subject}` : ''} · {q.questionCount} questions
                      · pool {q.poolSize}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-center">
                    <div>
                      <p className="text-lg font-bold text-slate-900">
                        {q.submissions}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        submissions
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-indigo-600">
                        {q.avgPercent === null ? '—' : `${q.avgPercent}%`}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        average
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link to="/teacher" className="text-sm text-indigo-600 hover:underline">
          &larr; Back to dashboard
        </Link>
      </div>
    </div>
  );
}
