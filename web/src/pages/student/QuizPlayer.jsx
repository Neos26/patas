import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Spinner,
} from '../../components/ui/index.jsx';

function formatTime(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function QuizPlayer() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const startUidRef = useRef(null);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const accRef = useRef({});
  const shownRef = useRef(Date.now());
  const visRef = useRef(0); // debounces blur/focus (visibility + window blur)
  const pasteRef = useRef(0);
  const copyRef = useRef(0);
  const devtoolsRef = useRef(0);
  const fsRef = useRef({ entered: false, everActive: false, lastWarn: 0, hintShown: false, exitP: null });
  const submittedRef = useRef(false);

  // --- start attempt ---
  useEffect(() => {
    let alive = true;
    startUidRef.current = user?.uid ?? null;
    api
      .post('/attempts/start', { quizId })
      .then((d) => {
        if (!alive) return;
        const restored = {};
        for (const [qi, a] of Object.entries(d.answers || {})) restored[qi] = a.v;
        setAnswers(restored);
        setData(d);
        shownRef.current = Date.now();
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 409) {
          navigate(`/student/quiz/${quizId}/result`, { replace: true });
          return;
        }
        setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [quizId, navigate]);

  // --- account-switch guard ---
  // If the signed-in user changes while this quiz is open (sign-out/login in
  // this or another tab), leave immediately — never show or save under a
  // different account.
  useEffect(() => {
    if (!data || !user || !startUidRef.current) return;
    if (user.uid !== startUidRef.current) {
      submittedRef.current = true;
      navigate('/student', { replace: true });
    }
  }, [data, user, navigate]);

  // --- countdown ---
  useEffect(() => {
    if (!data) return undefined;
    const tick = () => {
      const left = new Date(data.endsAt).getTime() - Date.now();
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        submit(true);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // --- integrity events -----------------------------------------------------
  // Tab switches (visibilitychange), alt-tab / clicking another window
  // (window blur), copy/paste, DevTools shortcuts, fullscreen exits.
  useEffect(() => {
    if (!data) return undefined;
    const send = (type) =>
      api.post(`/attempts/${data.attemptId}/event`, { type }).catch(() => {});
    const debounced = (type, ref, ms = 1200) => {
      const now = Date.now();
      if (now - ref.current < ms) return;
      ref.current = now;
      send(type);
    };

    // Tab hidden OR window lost focus (alt-tab, address bar, other app).
    const onVis = () => {
      debounced(document.visibilityState === 'hidden' ? 'blur' : 'focus', visRef);
    };
    const onWinBlur = () => debounced('blur', visRef);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onWinBlur);

    // Copying question content out of the quiz (only when text is selected).
    const selection = () => (window.getSelection?.() || '').toString().trim();
    const onCopy = () => {
      if (selection()) debounced('copy', copyRef, 800);
    };
    const onCut = () => {
      if (selection()) debounced('cut', copyRef, 800);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);

    // DevTools / view-source shortcuts (F12, Ctrl|Cmd+Shift+I/J/C, Ctrl|Cmd+U).
    const onKey = (e) => {
      const k = String(e.key || '').toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const hit =
        e.key === 'F12' ||
        (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        (mod && e.altKey && ['i', 'j', 'c'].includes(k)) ||
        (mod && k === 'u');
      if (hit) debounced('devtools', devtoolsRef, 1500);
    };
    window.addEventListener('keydown', onKey);

    // Fullscreen lockdown: requested immediately when the attempt starts
    // (the Start/Resume click provides the required user activation), with a
    // fallback on the first interaction if the activation window was missed.
    const onFsChange = () => {
      if (document.fullscreenElement) {
        fsRef.current.everActive = true;
        return;
      }
      if (!fsRef.current.everActive || submittedRef.current) return;
      send('fullscreen_exit');
      const now = Date.now();
      if (now - fsRef.current.lastWarn >= 4000) {
        fsRef.current.lastWarn = now;
        toast('Screen lock exited — please return to fullscreen', {
          icon: '⚠️',
          id: 'fs-exit',
        });
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);

    const enterFullscreen = async (hintOnFail = false) => {
      if (document.fullscreenElement) return true;
      if (fsRef.current.exitP) {
        // a cleanup-initiated exit is in flight (effect re-run) — wait, then re-enter
        await fsRef.current.exitP;
        fsRef.current.exitP = null;
      } else if (fsRef.current.entered) {
        return true; // already locked once; a deliberate Esc is not overridden
      }
      try {
        await document.documentElement.requestFullscreen();
        fsRef.current.entered = true;
        toast.success('Fullscreen locked — Esc exits are recorded', { duration: 2500 });
        return true;
      } catch {
        if (hintOnFail && !fsRef.current.hintShown) {
          fsRef.current.hintShown = true;
          toast('Click anywhere to lock the quiz to fullscreen', { duration: 4000 });
        }
        return false;
      }
    };
    const onFsGesture = () => enterFullscreen(false);
    enterFullscreen(true); // auto on quiz entry (Start click ⇒ user activation)
    window.addEventListener('pointerdown', onFsGesture);
    window.addEventListener('keydown', onFsGesture);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onWinBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('pointerdown', onFsGesture);
      window.removeEventListener('keydown', onFsGesture);
      if (document.fullscreenElement) {
        fsRef.current.exitP = document.exitFullscreen().catch(() => {});
      }
    };
  }, [data]);

  // --- block leaving while in progress ---
  useEffect(() => {
    if (!data || submittedRef.current) return undefined;
    const onBefore = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [data]);

  const timeOn = useCallback((qi) => {
    const current = qi;
    const base = accRef.current[current] || 0;
    return Math.round(base + (Date.now() - shownRef.current));
  }, []);

  function goTo(idx) {
    if (!data) return;
    const oldQi = data.questions[current]?.qi;
    if (oldQi !== undefined) {
      accRef.current[oldQi] = timeOn(oldQi);
    }
    shownRef.current = Date.now();
    setCurrent(idx);
  }

  function selectAnswer(qi, value) {
    setAnswers((a) => ({ ...a, [qi]: value }));
    api
      .put(`/attempts/${data.attemptId}/answer`, { qi, v: value, t: timeOn(qi) })
      .catch((err) => {
        if (err.status === 400) toast.error(err.message);
      });
  }

  const submit = useCallback(
    async (auto = false) => {
      if (!data || submittedRef.current) return;
      if (!auto && !window.confirm('Submit your quiz? You cannot change answers afterwards.')) {
        return;
      }
      submittedRef.current = true;
      setSubmitting(true);
      try {
        await api.post(`/attempts/${data.attemptId}/submit`, { auto });
        toast.success(auto ? 'Time expired — quiz auto-submitted' : 'Quiz submitted');
        navigate(`/student/quiz/${quizId}/result`, { replace: true });
      } catch (err) {
        submittedRef.current = false;
        setSubmitting(false);
        toast.error(err.message);
      }
    },
    [data, navigate, quizId],
  );

  function onPaste(e) {
    e.preventDefault();
    if (!data || submittedRef.current) return;
    const now = Date.now();
    if (now - pasteRef.current < 800) return;
    pasteRef.current = now;
    api.post(`/attempts/${data.attemptId}/event`, { type: 'paste' }).catch(() => {});
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <ErrorState
          title="Cannot open this quiz"
          message={error}
          onRetry={() => window.location.reload()}
        />
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => navigate('/student')}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
        <Spinner className="h-8 w-8 text-indigo-600" />
        <p className="text-sm">Preparing your personalized paper…</p>
      </div>
    );
  }

  const questions = data.questions;
  const q = questions[current];
  const answeredCount = questions.filter((x) => answers[x.qi] !== undefined).length;
  const lowTime = remaining !== null && remaining < 60000;

  return (
    <div className="mx-auto max-w-3xl no-select" onPaste={onPaste}>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-slate-900">{data.title}</h1>
          <p className="text-xs text-slate-400">
            {data.topic} · {questions.length} questions · monitored session
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color="amber">🔒 Integrity monitored</Badge>
          <span
            className={`rounded-lg px-3 py-1.5 font-mono text-sm font-bold ${
              lowTime
                ? 'bg-rose-100 text-rose-700 animate-pulse'
                : 'bg-slate-900 text-white'
            }`}
          >
            ⏱ {formatTime(remaining)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <Card className="p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge color="indigo">
            Question {current + 1} / {questions.length}
          </Badge>
          <Badge color="slate">{q.difficulty}</Badge>
          <Badge color="sky">{q.topic}</Badge>
        </div>

        <p className="text-base leading-relaxed text-slate-800">{q.prompt}</p>

        <div className="mt-5">
          {q.type === 'mcq' && (
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const selected = answers[q.qi] === oi;
                return (
                  <button
                    key={oi}
                    onClick={() => selectAnswer(q.qi, oi)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        selected
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : 'border-slate-300 text-slate-400'
                      }`}
                    >
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'true_false' && (
            <div className="grid grid-cols-2 gap-3">
              {['True', 'False'].map((val) => {
                const selected = answers[q.qi] === val;
                return (
                  <button
                    key={val}
                    onClick={() => selectAnswer(q.qi, val)}
                    className={`rounded-xl border px-4 py-4 text-sm font-semibold transition ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'identification' && (
            <input
              type="text"
              value={answers[q.qi] ?? ''}
              onChange={(e) => selectAnswer(q.qi, e.target.value)}
              placeholder="Type your answer…"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          )}

          {q.type === 'short_answer' && (
            <textarea
              rows={4}
              value={answers[q.qi] ?? ''}
              onChange={(e) => selectAnswer(q.qi, e.target.value)}
              placeholder="Write your answer…"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="secondary"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
          >
            ← Previous
          </Button>
          <span className="text-xs text-slate-400">
            {answeredCount}/{questions.length} answered · autosaved
          </span>
          {current < questions.length - 1 ? (
            <Button onClick={() => goTo(current + 1)}>Next →</Button>
          ) : (
            <Button loading={submitting} onClick={() => submit(false)}>
              Submit quiz
            </Button>
          )}
        </div>
      </Card>

      {/* Question grid */}
      <Card className="mt-4 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Questions
        </p>
        <div className="flex flex-wrap gap-2">
          {questions.map((qq, i) => {
            const done = answers[qq.qi] !== undefined;
            return (
              <button
                key={qq.qi}
                onClick={() => goTo(i)}
                className={`h-9 w-9 rounded-lg text-xs font-bold transition ${
                  i === current
                    ? 'bg-indigo-600 text-white'
                    : done
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            className="ml-auto rounded-lg bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            SUBMIT
          </button>
        </div>
      </Card>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        This session is proctored: tab/window switches, copy &amp; paste attempts,
        DevTools shortcuts, fullscreen exits and answer timing are recorded for
        academic integrity review. Your answers are saved automatically.
      </p>
    </div>
  );
}
