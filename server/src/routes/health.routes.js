import { Router } from 'express';
import { firebaseStatus } from '../config/firebase.js';
import { env } from '../config/env.js';
import { store } from '../store.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const fb = firebaseStatus();
  res.json({
    ok: true,
    service: 'raite-integrity-api',
    env: env.nodeEnv,
    store: store.mode,
    auth: fb.ready ? 'firebase' : 'demo',
    firebase: fb,
    gemini: {
      mockMode: env.gemini.mockMode,
      model: env.gemini.model,
      keyConfigured: Boolean(env.gemini.apiKey),
    },
    time: new Date().toISOString(),
  });
});
