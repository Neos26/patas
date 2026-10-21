# Patas — AI Academic Integrity & Fair Assessment System

RAITE 2026 hackathon prototype: **AI-generated quizzes, fair per-student
randomization, and cheating detection** (behavioral + analytics), with
AI-written teacher reports.

> Runs **fully local with zero setup** (JSON store + demo login + mock AI).
> Add Firebase / Gemini env vars later to switch to production services —
> no code changes needed.

## Quick start (zero config)

```powershell
npm install        # once, at the repo root (installs the dev runner)
npm run seed       # demo users, subjects, classes, demo quiz + attempts + flags
npm run dev        # starts API :8080 AND web :5173 together
```

(Or run `npm run dev` separately inside `server/` and `web/` in two terminals.
**Both must be running** — the web proxies `/api` to `localhost:8080`; if the
API is down, pages show a `502` error.)

Open <http://localhost:5173> and either **pick a demo role** or **sign in /
register** with an account:

| Role | Lands on | Try this demo |
|---|---|---|
| **Teacher** | dashboard | Create AI Quiz → Generate → Publish → open the quiz → Results / Flags / AI insight |
| **Student** | quiz list | Start the quiz; switch tabs to trigger flags; submit; view result |
| **Student #2** | quiz list | Take the same quiz answering identically-wrong → collusion flag appears |

**Accounts** (password for all seeded logins: `Password123!`):

- Quick demo role picker (no password), or
- Email + password: `teacher@integrity.demo`, `student1@integrity.demo`, … , or
- **Create an account** (`/register`) — teachers & students; stored locally in
  demo mode, as real Firebase Auth users once Firebase is connected.

Run the backend test suite any time:

```powershell
cd server; npm run smoke     # 70 end-to-end checks, no Firebase/keys needed
```

## The anti-cheat pipeline (core of the project)

1. **Pool generation (Gemini)** — teacher supplies topic, objectives, material,
   difficulty split (e.g. 5/10/5), types, count. Gemini writes a pool of
   `count × 1.5` questions. Mock mode produces deterministic pools without a key.
2. **Fair randomization (code)** — each student gets a paper assembled from the
   pool with a seed `hash(quizId:studentId)`: same difficulty/topic blueprint,
   different questions, shuffled options, reproducible forever
   (`GET /api/quizzes/:id/version/:studentId` shows any student's exact paper).
3. **Integrity Suite (code)** — the player records tab-switch & alt-tab
   (window blur) events, per-answer timing, paste/copy attempts, DevTools
   shortcuts (F12 / Ctrl+Shift+I,J,C / view-source) and fullscreen exits
   (auto-locks fullscreen the moment the quiz starts, first click as fallback); one attempt per student;
   server-side time window + auto-submit on expiry.
4. **Integrity Analytics (code)** — on submit: focus-loss, implausibly
   fast wrong-answer, and **identical-wrong-answer similarity** flags on the
   questions two students share (`agreement ≥ 0.6` ⇒ collusion evidence), plus
   clipboard (paste ≥1 or copy ≥2), DevTools-shortcut, and fullscreen-exit
   flags — each with severity (low/medium/high) + evidence. Teacher reviews:
   confirm / dismiss. **AI never assigns penalties.**
5. **AI insight (Gemini)** — anonymized statistics only (no names) →
   teacher-friendly summary + recommendations.

## Project layout

```
├── web/       React + Vite + Tailwind v4 PWA-ready SPA
│   └── src/pages/{teacher,student,admin,auth}/
├── server/    Express API (Vercel function via server/api/index.js)
│   ├── src/services/   gemini · quiz (assembly) · attempt (grading/integrity)
│   ├── src/routes/     quizzes · attempts · integrity · auth · system · health
│   ├── src/store.js    dual-mode: Firestore ⇄ server/data/db.json
│   └── scripts/smoke.mjs
├── firestore.rules     deny-by-default, API-only writes
└── firebase.json
```

## Dual-mode architecture

| Concern | Local demo (default) | Production (add env vars) |
|---|---|---|
| Data | `server/data/db.json` | Cloud Firestore |
| Auth | demo role picker → `x-dev-user` header | Firebase Auth ID token + custom claims |
| AI | deterministic mock pools/reports | Gemini via `GEMINI_API_KEY` |
| Roles | trusted header (local only) | `requireRole()` on verified claims |

**Mode is auto-detected**: the moment `FIREBASE_SERVICE_ACCOUNT_B64` /
`GOOGLE_APPLICATION_CREDENTIALS` exists, the store and auth switch to Firebase.
`GET /healthz` reports the active mode.

### Enabling Firebase later

1. Console → Add project → enable **Auth/Email-password** + **Firestore**.
2. Web app config → paste into `web/.env` (copy `web/.env.example`).
3. Service account JSON → save as `server/serviceAccount.json`
   (or `FIREBASE_SERVICE_ACCOUNT_B64` on Vercel); set `FIREBASE_PROJECT_ID`.
4. `npm run seed` (creates real Auth users, password `Password123!`),
   `firebase deploy --only firestore:rules`.

### Enabling live Gemini

Set `GEMINI_API_KEY` in `server/.env` (optional `GEMINI_MODEL`, default
`gemini-2.5-flash`). The key never reaches the browser. `MOCK_MODE=true`
forces fixtures even with a key.

## REST API (all under `/api`, Bearer token or demo header)

```
POST /auth/session-claims          GET /auth/me
POST /auth/register                POST /auth/login
POST /quizzes/upload-material      (teacher, text extraction: txt/md/csv/pdf/docx)
POST /quizzes/generate   (teacher, AI, rate-limited)
GET  /quizzes?scope=teacher|student
GET  /quizzes/:id                   POST /quizzes/:id/publish | /close
GET  /quizzes/:id/results           GET /quizzes/:id/version/:studentId
POST /quizzes/:id/insight           (teacher, AI)
GET  /integrity/flags?quizId=       PATCH /integrity/flags/:id
POST /attempts/start                PUT  /attempts/:id/answer
POST /attempts/:id/event            POST /attempts/:id/submit
GET  /attempts/:id/result           GET  /attempts
GET  /system/stats                  (admin)
GET  /healthz
```

## Security

- Role checks server-side on every route; students can only read their own
  attempts/versions; teachers only their own quizzes/flags (`403` verified by tests).
- Gemini key server-only; AI payloads are pseudonymized (statistics + item text).
- Zod validation on every mutating body; rate limits globally + stricter on AI.
- Audit log for generate/publish/close/insight/flag-review actions.
- Firestore rules deny-by-default for the Firebase mode.

## Deploy (Vercel)

Two projects from this repo: `web` (root dir `web`, build `npm run build`,
output `dist`) and `server` (root dir `server`, function `api/index.js`,
`maxDuration: 60` in `server/vercel.json`). Set `VITE_API_BASE_URL` on the web
project and `ALLOWED_ORIGINS=<web origin>` + credentials + `GEMINI_API_KEY` on
the API project.

## Roadmap status

- **M0 ✅** scaffold, roles, rules, seed
- **S1–S6 ✅** dual store/auth, Gemini service (mock+live), pool generation,
  seeded assembly, quiz player, grading, 3 integrity detectors, AI insight —
  **70/70 automated checks passing** (`npm run smoke`)
- **S7–S9 ✅** teacher wizard/results/flags/insight, student player/result/history,
  dashboards
- **S10 ✅** E2E smoke + web build + proxy verification
- **S11 ✅** this README
