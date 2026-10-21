import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonCard,
  Spinner,
} from '../../components/ui/index.jsx';

const TABS = [
  ['results', 'Results'],
  ['flags', 'Integrity flags'],
  ['insight', 'AI insight'],
  ['overview', 'Overview'],
];

const TYPE_META = {
  focus_loss: ['amber', 'Focus loss'],
  fast_answer: ['sky', 'Fast answers'],
  similarity: ['rose', 'Possible collusion'],
  clipboard: ['indigo', 'Clipboard use'],
  devtools: ['rose', 'DevTools opened'],
  fullscreen_exit: ['amber', 'Left fullscreen'],
};

const SEVERITY = {
  low: 'slate',
  medium: 'amber',
  high: 'rose',
};

function flagDescription(f) {
  const e = f.evidence || {};
  if (f.type === 'focus_loss') {
    return `${e.blurEvents || 0} tab/window switch(es) (including alt-tab) were recorded while the quiz was open.`;
  }
  if (f.type === 'fast_answer') {
    return `${(e.questionIndexes || []).length} answer(s) were submitted in under ${
      (e.thresholdMs || 1500) / 1000
    }s — and were wrong.`;
  }
  if (f.type === 'similarity') {
    return `Identical wrong answers on ${e.sharedWrongQuestions?.length || 0} of ${
      e.sharedQuestionCount || 0
    } shared questions (${Math.round((e.agreement || 0) * 100)}% agreement) with ${
      f.relatedStudentName || 'another student'
    }.`;
  }
  if (f.type === 'clipboard') {
    const parts = [];
    if (e.pasteAttempts) parts.push(`${e.pasteAttempts} paste attempt(s) (blocked)`);
    if (e.copyEvents) parts.push(`${e.copyEvents} copy action(s)`);
    return `${parts.join(' and ') || 'Clipboard activity'} recorded during the quiz.`;
  }
  if (f.type === 'devtools') {
    return `Developer-tools / view-source shortcut(s) pressed ${e.count || 0} time(s) while the quiz was open.`;
  }
  if (f.type === 'fullscreen_exit') {
    return `The student left fullscreen (locked) mode ${e.exits || 0} time(s) during the attempt.`;
  }
  return 'Flagged by the integrity engine.';
}

export function QuizDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('results');
  const [busy, setBusy] = useState(false);
  const [paperModal, setPaperModal] = useState(null);
  const [paper, setPaper] = useState(null);
  const [paperLoading, setPaperLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get(`/quizzes/${id}/results`));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function publish() {
    setBusy(true);
    try {
      await api.post(`/quizzes/${id}/publish`, { hours: 24 });
      toast.success('Quiz published');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeQuiz() {
    setBusy(true);
    try {
      await api.post(`/quizzes/${id}/close`, {});
      toast.success('Quiz closed');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewFlag(flagId, status) {
    try {
      await api.patch(`/integrity/flags/${flagId}`, { status });
      toast.success(status === 'dismissed' ? 'Flag dismissed' : 'Flag confirmed');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function generateInsight() {
    setBusy(true);
    try {
      const res = await api.post(`/quizzes/${id}/insight`, {});
      toast.success('AI insight generated');
      setData((d) => ({ ...d, insight: { ...res.insight, ...res } }));
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openPaper(studentId, studentName) {
    setPaperModal({ studentId, studentName });
    setPaper(null);
    setPaperLoading(true);
    try {
      setPaper(await api.get(`/quizzes/${id}/version/${studentId}`));
    } catch (err) {
      toast.error(err.message);
      setPaperModal(null);
    } finally {
      setPaperLoading(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="grid gap-4">
        <SkeletonCard rows={4} />
        <SkeletonCard rows={6} />
      </div>
    );
  }

  const { quiz, results, inProgress, flags, stats, insight } = data;
  const openFlags = flags.filter((f) => f.status === 'open');

  return (
    <div>
      <PageHeader
        title={quiz.title}
        subtitle={`${quiz.topic}${quiz.subject ? ` · ${quiz.subject}` : ''} · ${
          quiz.blueprint.count
        } questions · ${quiz.blueprint.timeLimitMin} min`}
        action={
          <div className="flex gap-2">
            {quiz.status === 'draft' && (
              <Button onClick={publish} loading={busy}>
                Publish
              </Button>
            )}
            {quiz.status === 'published' && (
              <Button variant="secondary" onClick={closeQuiz} loading={busy}>
                Close now
              </Button>
            )}
            <Badge
              color={
                quiz.status === 'published'
                  ? 'emerald'
                  : quiz.status === 'closed'
                    ? 'amber'
                    : 'slate'
              }
            >
              {quiz.status}
            </Badge>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {key === 'flags' && openFlags.length > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {openFlags.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ---------------- Results ---------------- */}
      {tab === 'results' && (
        <div>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ['Submissions', stats.submissions, 'indigo'],
              ['Average', `${stats.avgPercent}%`, 'sky'],
              ['Highest', `${stats.highest}%`, 'emerald'],
              ['Passed', stats.passed, 'emerald'],
              ['Failed', stats.failed, 'rose'],
            ].map(([label, value, accent]) => (
              <Card key={label} className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
              </Card>
            ))}
          </div>

          {results.length === 0 ? (
            <EmptyState
              icon="⏳"
              title="No submissions yet"
              description={
                quiz.status === 'draft'
                  ? 'Publish the quiz so students can take it.'
                  : 'Results will appear here as students submit.'
              }
            />
          ) : (
            <Card>
              <CardHeader title="Student results" subtitle="Sorted by score" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3">Student</th>
                      <th className="px-5 py-3">Score</th>
                      <th className="px-5 py-3">Result</th>
                      <th className="px-5 py-3">Blur events</th>
                      <th className="px-5 py-3">Flags</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {results.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 font-medium text-slate-800">
                          {r.studentName}
                          {r.autoSubmitted && (
                            <Badge color="amber" className="ml-2">
                              auto
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`font-bold ${
                              r.score.percent >= 60 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {r.score.percent}%
                          </span>
                          <span className="ml-1 text-xs text-slate-400">
                            {r.score.correct}/{r.score.total}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <Badge color={r.score.passed ? 'emerald' : 'rose'}>
                            {r.score.passed ? 'Passed' : 'Failed'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{r.blurEvents}</td>
                        <td className="px-5 py-3">
                          {r.flagCount > 0 ? (
                            <Badge color="rose">{r.flagCount}</Badge>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openPaper(r.studentId, r.studentName)}
                          >
                            View paper
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {inProgress.length > 0 && (
            <Card className="mt-4">
              <CardHeader
                title="In progress"
                subtitle={`${inProgress.length} student(s) currently taking the quiz`}
              />
              <ul className="divide-y divide-slate-50 px-5 py-1">
                {inProgress.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-slate-700">{a.studentName}</span>
                    <span className="text-xs text-slate-400">
                      ends {new Date(a.endsAt).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- Flags ---------------- */}
      {tab === 'flags' && (
        <div>
          {flags.length === 0 ? (
            <EmptyState
              icon="🛡️"
              title="No integrity flags"
              description="Focus changes, implausibly fast wrong answers, and identical wrong-answer patterns are monitored automatically."
            />
          ) : (
            <div className="grid gap-3">
              {flags.map((f) => {
                const [color, label] = TYPE_META[f.type] || ['slate', f.type];
                return (
                  <Card key={f.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color={color}>{label}</Badge>
                          <Badge color={SEVERITY[f.severity] || 'slate'}>
                            {f.severity} severity
                          </Badge>
                          <Badge
                            color={
                              f.status === 'dismissed'
                                ? 'slate'
                                : f.status === 'confirmed'
                                  ? 'rose'
                                  : 'amber'
                            }
                          >
                            {f.status}
                          </Badge>
                        </div>
                        <p className="mt-2 font-medium text-slate-800">{f.studentName}</p>
                        <p className="mt-1 text-sm text-slate-500">{flagDescription(f)}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Raised {new Date(f.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {f.status === 'open' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => reviewFlag(f.id, 'dismissed')}
                          >
                            Dismiss
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => reviewFlag(f.id, 'confirmed')}>
                            Confirm
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">
            Flags are advisory signals computed by the system — the teacher reviews
            and decides. AI is never used to assign penalties.
          </p>
        </div>
      )}

      {/* ---------------- AI insight ---------------- */}
      {tab === 'insight' && (
        <div>
          {stats.submissions === 0 ? (
            <EmptyState
              icon="📋"
              title="No data to analyze yet"
              description="Once students submit, Gemini can turn the statistics into a teacher-friendly report."
            />
          ) : (
            <>
              <div className="mb-4 flex justify-end">
                <Button onClick={generateInsight} loading={busy}>
                  {insight ? '↻ Regenerate AI insight' : 'Generate AI insight'}
                </Button>
              </div>
              {insight ? (
                <Card className="p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Badge color="indigo">AI-generated</Badge>
                    <Badge color={insight.source === 'mock' ? 'amber' : 'emerald'}>
                      {insight.source === 'mock' ? 'mock mode' : insight.model}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {new Date(insight.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {insight.text}
                  </p>
                  <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
                    Recommendations only — grading and disciplinary decisions remain
                    with the teacher.
                  </p>
                </Card>
              ) : (
                <EmptyState
                  icon="📊"
                  title="Generate your integrity & performance report"
                  description="Statistics are computed in code; Gemini only writes the narrative from anonymized data (no student names)."
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ---------------- Overview ---------------- */}
      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Blueprint" subtitle="Identical for every student" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              {[
                ['Questions per student', quiz.blueprint.count],
                ['Difficulty', `E ${quiz.blueprint.difficulty.easy} · M ${quiz.blueprint.difficulty.medium} · H ${quiz.blueprint.difficulty.hard}`],
                ['Types', quiz.blueprint.types.join(', ')],
                ['Time limit', `${quiz.blueprint.timeLimitMin} minutes`],
                ['Pool size', `${quiz.pool.questions.length} questions (${quiz.pool.source})`],
                ['Status', quiz.status],
                ['Window', quiz.opensAt ? `${new Date(quiz.opensAt).toLocaleString()} → ${new Date(quiz.closesAt).toLocaleString()}` : 'not published'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Learning objectives" />
            <ul className="space-y-2 px-5 py-4 text-sm text-slate-700">
              {quiz.objectives.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-indigo-500">•</span>
                  {o}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ---------------- Paper modal ---------------- */}
      {paperModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {paperModal.studentName}&rsquo;s paper
                </h3>
                <p className="text-xs text-slate-400">
                  Exactly what this student saw (with answer key)
                </p>
              </div>
              <button
                onClick={() => setPaperModal(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {paperLoading && (
              <div className="flex justify-center py-10">
                <Spinner className="h-8 w-8 text-indigo-600" />
              </div>
            )}

            {paper && (
              <ol className="space-y-4">
                {paper.questions.map((q, i) => (
                  <li key={q.qi} className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Badge color="indigo">Q{i + 1}</Badge>
                      <Badge color="slate">{q.difficulty}</Badge>
                      <Badge color="sky">{q.type}</Badge>
                    </div>
                    <p className="text-sm text-slate-800">{q.prompt}</p>
                    {q.options && (
                      <ul className="mt-2 space-y-1">
                        {q.options.map((o, oi) => (
                          <li
                            key={oi}
                            className={`rounded px-2 py-1 text-xs ${
                              o === q.answer
                                ? 'bg-emerald-50 font-medium text-emerald-700'
                                : 'bg-slate-50 text-slate-500'
                            }`}
                          >
                            {String.fromCharCode(65 + oi)}. {o}
                            {o === q.answer && ' ✓'}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!q.options && (
                      <p className="mt-2 text-xs text-emerald-700">
                        Answer: <strong>{q.answer}</strong>
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link to="/teacher/quizzes" className="text-sm text-indigo-600 hover:underline">
          &larr; All quizzes
        </Link>
      </div>
    </div>
  );
}
