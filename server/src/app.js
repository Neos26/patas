import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';

import { env } from './config/env.js';
import { firebaseStatus } from './config/firebase.js';
import { store } from './store.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { quizzesRouter, integrityRouter } from './routes/quiz.routes.js';
import { attemptsRouter } from './routes/attempt.routes.js';
import { systemRouter } from './routes/system.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || env.allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-dev-user'],
  }),
);
app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  req.id = randomUUID();
  next();
});

app.use(
  rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many requests. Please slow down.' } },
  }),
);

// Stricter limit for AI generation endpoints.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'AI generation limit reached. Try again in a few minutes.' } },
});

app.use('/healthz', healthRouter);
app.use('/api/healthz', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/quizzes', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/generate') return aiLimiter(req, res, next);
  return next();
}, quizzesRouter);
app.use('/api/integrity', integrityRouter);
app.use('/api/attempts', attemptsRouter);
app.use('/api/system', systemRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// Expose a one-line summary for logs/boot.
export function describeRuntime() {
  const fb = firebaseStatus();
  return {
    store: store.mode,
    auth: fb.ready ? 'firebase' : 'demo',
    gemini: env.gemini.mockMode ? 'mock' : 'live',
  };
}

export default app;
