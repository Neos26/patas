import app from './app.js';
import { env } from './config/env.js';
import { describeRuntime } from './app.js';

// On Vercel the app is exported as a serverless function (api/index.js)
// and must not listen.
if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    const rt = describeRuntime();
    console.log(`API listening on http://localhost:${env.port}`);
    console.log(`  store:  ${rt.store} (${rt.store === 'file' ? 'server/data/db.json' : 'Firestore'})`);
    console.log(`  auth:   ${rt.auth}${rt.auth === 'demo' ? ' (x-dev-user header / demo login)' : ''}`);
    console.log(`  gemini: ${rt.gemini}${rt.gemini === 'mock' ? ' (set GEMINI_API_KEY for live)' : ''}`);
  });
}

export default app;
