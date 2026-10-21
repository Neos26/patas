import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export function HistoryPage() {
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      setAttempts(await api.get('/attempts'));
    } catch (err) {
      setError(err.message);
      setAttempts([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader title="Quiz history" subtitle="Your past attempts and scores." />

      {attempts === null && !error && <SkeletonCard rows={5} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {attempts && attempts.length === 0 && (
        <EmptyState
          icon="📚"
          title="No attempts yet"
          description="Quizzes assigned to you will appear on your dashboard."
          action={<Button onClick={() => navigate('/student')}>Go to dashboard</Button>}
        />
      )}

      {attempts && attempts.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Quiz</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3">Submitted</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {attempts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-800">{a.title}</td>
                    <td className="px-5 py-3">
                      <Badge color={a.status === 'submitted' ? 'emerald' : 'amber'}>
                        {a.status === 'submitted' ? 'Submitted' : 'In progress'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {a.score ? (
                        <span
                          className={`font-bold ${
                            a.score.passed ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {a.score.percent}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {a.status === 'submitted' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/student/quiz/${a.quizId}/result`)}
                        >
                          View
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/student/quiz/${a.quizId}`)}
                        >
                          Resume
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
