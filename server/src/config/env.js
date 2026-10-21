import dotenv from 'dotenv';

dotenv.config();

function bool(v, fallback = false) {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes'].includes(String(v).toLowerCase());
}

function list(v, fallback = []) {
  if (!v) return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: Number(process.env.PORT || 8080),

  allowedOrigins: list(process.env.ALLOWED_ORIGINS, [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]),

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '',
    serviceAccountB64: process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    mockMode: bool(process.env.MOCK_MODE, false) || !process.env.GEMINI_API_KEY,
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 600),
  },
};
