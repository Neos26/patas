import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  PageHeader,
  Spinner,
} from '../../components/ui/index.jsx';

const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
const MATERIAL_ACCEPT = '.txt,.md,.markdown,.csv,.pdf,.docx';

const TYPE_OPTIONS = [
  ['mcq', 'Multiple Choice'],
  ['true_false', 'True / False'],
  ['identification', 'Identification'],
  ['short_answer', 'Short Answer'],
];

const DIFF_META = {
  easy: { label: 'Easy', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Medium', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  hard: { label: 'Hard', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS);

export function QuizWizard() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState('form'); // form | generating | review
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hours, setHours] = useState(24);
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState(null); // { fileName, chars, truncated }
  const materialFileRef = useRef(null);

  const [form, setForm] = useState({
    title: '',
    subject: 'IT 301',
    topic: '',
    objectives: [''],
    material: '',
    count: 12,
    difficulty: { easy: 4, medium: 5, hard: 3 },
    types: ['mcq', 'true_false'],
    timeLimitMin: 20,
  });

  const diffSum =
    form.difficulty.easy + form.difficulty.medium + form.difficulty.hard;

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }
  function setDifficulty(patch) {
    setForm((f) => ({ ...f, difficulty: { ...f.difficulty, ...patch } }));
  }

  async function handleMaterialFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_MATERIAL_BYTES) {
      toast.error('File is too large (max 5 MB).');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('material', file);
      const res = await api.upload('/quizzes/upload-material', fd);
      set({ material: res.text });
      setUploadInfo({ fileName: res.fileName, chars: res.chars, truncated: res.truncated });
      toast.success(
        `Extracted ${res.chars.toLocaleString()} characters from ${res.fileName}`,
      );
    } catch (err) {
      toast.error(err.message || 'File upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function clearUploadedFile() {
    set({ material: '' });
    setUploadInfo(null);
  }

  function toggleType(type) {
    setForm((f) => ({
      ...f,
      types: f.types.includes(type)
        ? f.types.filter((t) => t !== type)
        : [...f.types, type],
    }));
  }

  function setObjective(i, value) {
    setForm((f) => {
      const objectives = [...f.objectives];
      objectives[i] = value;
      return { ...f, objectives };
    });
  }

  const formValid =
    form.title.trim().length >= 3 &&
    form.topic.trim().length >= 2 &&
    form.objectives.some((o) => o.trim().length >= 3) &&
    form.types.length > 0 &&
    diffSum === form.count &&
    diffSum > 0;

  async function handleGenerate(e) {
    e.preventDefault();
    if (!formValid) return;
    setError(null);
    setGenerating(true);
    setPhase('generating');
    try {
      const body = {
        ...form,
        title: form.title.trim(),
        topic: form.topic.trim(),
        subject: form.subject.trim() || undefined,
        material: form.material.trim() || undefined,
        objectives: form.objectives.map((o) => o.trim()).filter((o) => o.length >= 3),
      };
      const created = await api.post('/quizzes/generate', body);
      setQuiz(created);
      setPhase('review');
      toast.success(`Pool generated: ${created.pool.questions.length} questions`);
    } catch (err) {
      setError(err.message);
      setPhase('form');
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      await api.post(`/quizzes/${quiz.id}/publish`, { hours: Number(hours) });
      toast.success('Quiz published — students can take it now');
      navigate(`/teacher/quizzes/${quiz.id}`);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setPublishing(false);
    }
  }

  // --- generating spinner ----------------------------------------------------
  if (phase === 'generating') {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
          <Spinner className="h-8 w-8 text-indigo-600" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-900">
          Generating your question pool…
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Gemini is writing {Math.ceil(form.count * 1.5)} questions across{' '}
          {form.difficulty.easy}/{form.difficulty.medium}/{form.difficulty.hard}{' '}
          easy/medium/hard with equivalent difficulty. This usually takes 5–20 seconds.
        </p>
        <Button variant="ghost" className="mt-6" onClick={() => setPhase('form')}>
          Cancel
        </Button>
      </div>
    );
  }

  // --- review phase ----------------------------------------------------------
  if (phase === 'review' && quiz) {
    const pool = quiz.pool.questions;
    return (
      <div>
        <PageHeader
          title="Review question pool"
          subtitle={`${quiz.title} · ${pool.length} questions generated (${
            quiz.pool.source === 'mock' ? 'mock mode — no API key' : quiz.pool.model
          })`}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPhase('form')}>
                Regenerate
              </Button>
              <Button onClick={handlePublish} loading={publishing}>
                Publish quiz
              </Button>
            </div>
          }
        />

        {error && <div className="mb-4"><ErrorState message={error} /></div>}

        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-slate-700">Blueprint:</span>
            {Object.entries(quiz.blueprint.difficulty).map(([d, n]) => (
              <span
                key={d}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${DIFF_META[d].color}`}
              >
                {DIFF_META[d].label}: needs {n} · pool has{' '}
                {pool.filter((q) => q.difficulty === d).length}
              </span>
            ))}
            <Badge color="indigo">{quiz.blueprint.count} per student</Badge>
            <Badge color="sky">{quiz.blueprint.timeLimitMin} min</Badge>
          </div>
        </Card>

        <div className="grid gap-4">
          {['easy', 'medium', 'hard']
            .filter((d) => pool.some((q) => q.difficulty === d))
            .map((d) => (
              <Card key={d}>
                <CardHeader
                  title={`${DIFF_META[d].label} questions`}
                  subtitle={`${pool.filter((q) => q.difficulty === d).length} in pool`}
                />
                <ul className="divide-y divide-slate-100">
                  {pool
                    .filter((q) => q.difficulty === d)
                    .map((q, i) => (
                      <li key={i} className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color="slate">{TYPE_LABEL[q.type] || q.type}</Badge>
                          <span className="text-xs text-slate-400">{q.objective}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-800">{q.prompt}</p>
                        {q.type === 'mcq' && (
                          <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                            {q.options.map((o, oi) => (
                              <li
                                key={oi}
                                className={`rounded px-2 py-1 text-xs ${
                                  o === q.options[q.answerIndex]
                                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                                    : 'bg-slate-50 text-slate-500'
                                }`}
                              >
                                {o === q.options[q.answerIndex] ? '✓ ' : ''}
                                {o}
                              </li>
                            ))}
                          </ul>
                        )}
                        {q.type !== 'mcq' && (
                          <p className="mt-1 text-xs text-emerald-700">
                            Answer: <strong>{q.answer}</strong>
                          </p>
                        )}
                      </li>
                    ))}
                </ul>
              </Card>
            ))}
        </div>

        <Card className="mt-5 p-5">
          <h3 className="text-sm font-semibold text-slate-900">Publish settings</h3>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="text-sm text-slate-600">
              Open for
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <span className="text-sm text-slate-500">hours</span>
              </div>
            </label>
            <Button onClick={handlePublish} loading={publishing}>
              Publish to students
            </Button>
            <Button variant="ghost" onClick={() => navigate('/teacher/quizzes')}>
              Save as draft &amp; exit
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- form phase ------------------------------------------------------------
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Create AI quiz"
        subtitle="One wizard: details → Gemini pool → publish. Every student gets a different but equivalent paper."
      />

      <form onSubmit={handleGenerate}>
        <Card className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Quiz title</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Midterm — Normalization"
                required
                minLength={3}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Subject</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                value={form.subject}
                onChange={(e) => set({ subject: e.target.value })}
                placeholder="IT 301"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Topic</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                value={form.topic}
                onChange={(e) => set({ topic: e.target.value })}
                placeholder="Database Normalization"
                required
              />
            </label>
          </div>

          <div className="mt-5">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Learning objectives
            </span>
            {form.objectives.map((o, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                  value={o}
                  onChange={(e) => setObjective(i, e.target.value)}
                  placeholder={`Objective ${i + 1} — e.g. Explain 2NF and eliminate partial dependencies`}
                />
                {form.objectives.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      set({ objectives: form.objectives.filter((_, j) => j !== i) })
                    }
                    className="rounded-lg border border-slate-200 px-3 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove objective"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {form.objectives.length < 6 && (
              <button
                type="button"
                onClick={() => set({ objectives: [...form.objectives, ''] })}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                + Add objective
              </button>
            )}
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="material-text" className="text-sm font-medium text-slate-700">
                Source material{' '}
                <span className="font-normal text-slate-400">
                  (optional — paste notes or upload a file)
                </span>
              </label>
              <button
                type="button"
                disabled={uploading}
                onClick={() => materialFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Spinner className="h-3.5 w-3.5" /> Extracting…
                  </>
                ) : (
                  <>⬆ Upload file</>
                )}
              </button>
              <input
                ref={materialFileRef}
                type="file"
                accept={MATERIAL_ACCEPT}
                className="hidden"
                onChange={handleMaterialFile}
              />
            </div>

            {uploadInfo && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <span className="font-semibold">📄 {uploadInfo.fileName}</span>
                <span>
                  {uploadInfo.chars.toLocaleString()} characters
                  {uploadInfo.truncated ? ' (truncated to limit)' : ' extracted'}
                </span>
                <button
                  type="button"
                  onClick={clearUploadedFile}
                  className="ml-auto font-medium text-emerald-700 underline hover:text-emerald-900"
                >
                  Remove
                </button>
              </div>
            )}

            <textarea
              id="material-text"
              rows={5}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
              value={form.material}
              onChange={(e) => {
                set({ material: e.target.value });
                if (uploadInfo) setUploadInfo(null);
              }}
              placeholder="Paste excerpts, or upload .txt / .md / .csv / .pdf / .docx — text is extracted and can be edited before generating."
              maxLength={60000}
            />
            <p className="mt-1 text-right text-[11px] text-slate-400">
              {form.material.length.toLocaleString()} / 60,000 characters
              {' · '}max 5 MB per file
            </p>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Questions per student
              </span>
              <input
                type="number"
                min="4"
                max="30"
                className="w-32 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                value={form.count}
                onChange={(e) => set({ count: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Time limit (minutes)
              </span>
              <input
                type="number"
                min="3"
                max="180"
                className="w-32 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                value={form.timeLimitMin}
                onChange={(e) => set({ timeLimitMin: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Difficulty split
              </span>
              <span
                className={`text-xs font-semibold ${
                  diffSum === form.count ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {diffSum} / {form.count} {diffSum === form.count ? '✓' : '— must equal question count'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['easy', 'medium', 'hard'].map((d) => (
                <label key={d} className={`rounded-xl border px-3 py-2 ${DIFF_META[d].color}`}>
                  <span className="block text-xs font-semibold">{DIFF_META[d].label}</span>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={form.difficulty[d]}
                    onChange={(e) => setDifficulty({ [d]: Number(e.target.value) })}
                    className="mt-1 w-full bg-transparent text-lg font-bold outline-none"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Question types
            </span>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(([value, label]) => {
                const active = form.types.includes(value);
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => toggleType(value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {active ? '✓ ' : ''}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {error && (
          <div className="mt-4">
            <ErrorState message={error} />
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/teacher/quizzes')}
          >
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={generating} disabled={!formValid}>
            Generate question pool
          </Button>
        </div>
        {!formValid && (
          <p className="mt-2 text-right text-xs text-slate-400">
            Fill the title, topic, at least one objective, one type, and make the
            difficulty split match the question count.
          </p>
        )}
      </form>
    </div>
  );
}
