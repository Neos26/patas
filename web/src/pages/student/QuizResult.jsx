import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Spinner,
} from '../../components/ui/index.jsx';

const TYPE_LABEL = {
  mcq: 'Multiple choice',
  true_false: 'True / False',
  identification: 'Identification',
  short_answer: 'Short answer',
};

export function QuizResult() {
  const { quizId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    api
      .get(`/attempts/${quizId}_${user.uid}/result`)
      .then((d) => {
        if (!alive) return;
        if (!d.submitted) {
          navigate(`/student/quiz/${quizId}`, { replace: true });
          return;
        }
        setData(d);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [quizId, user, navigate]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  const { attempt, quiz, questions } = data;
  const correct = attempt.score.correct;
  const total = attempt.score.total;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={quiz?.title || 'Result'}
        subtitle={quiz?.topic}
        action={
          <Link to="/student" className="text-sm text-indigo-600 hover:underline">
            Dashboard →
          </Link>
        }
      />

      {/* Score card */}
      <Card className="mb-6 p-6 text-center">
        <div
          className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full border-8 ${
            attempt.score.passed
              ? 'border-emerald-100 bg-emerald-50'
              : 'border-rose-100 bg-rose-50'
          }`}
        >
          <div>
            <p
              className={`text-3xl font-black ${
                attempt.score.passed ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {attempt.score.percent}%
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-500">
          {correct} of {total} correct
        </p>
        <div className="mt-2 flex justify-center gap-2">
          <Badge color={attempt.score.passed ? 'emerald' : 'rose'}>
            {attempt.score.passed ? 'PASSED' : 'NEEDS REVIEW'}
          </Badge>
          {attempt.autoSubmitted && <Badge color="amber">auto-submitted (time expired)</Badge>}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : ''}
        </p>
      </Card>

      {/* Review */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Question review
      </h2>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <Card key={q.qi} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={q.correct ? 'emerald' : 'rose'}>
                {q.correct ? '✓ Correct' : '✗ Incorrect'}
              </Badge>
              <Badge color="slate">{q.difficulty}</Badge>
              <Badge color="sky">{TYPE_LABEL[q.type]}</Badge>
              <span className="ml-auto text-xs text-slate-400">
                {(q.timeMs / 1000).toFixed(1)}s
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {i + 1}. {q.prompt}
            </p>
            <div className="mt-2 space-y-1 text-sm">
              <p className={q.correct ? 'text-emerald-700' : 'text-rose-700'}>
                Your answer:{' '}
                <strong>
                  {q.studentAnswer === null || q.studentAnswer === '' || q.studentAnswer === undefined
                    ? '(not answered)'
                    : String(q.studentAnswer)}
                </strong>
              </p>
              {!q.correct && (
                <p className="text-slate-600">
                  Correct answer: <strong>{q.correctAnswer}</strong>
                </p>
              )}
              {q.explanation && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  💡 {q.explanation}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <Button variant="secondary" onClick={() => navigate('/student/history')}>
          View history
        </Button>
        <Button onClick={() => navigate('/student')}>Back to dashboard</Button>
      </div>
    </div>
  );
}
