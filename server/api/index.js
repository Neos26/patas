import app from '../src/app.js';

/**
 * Vercel serverless entrypoint.
 *
 * The function filesystem starts empty on every cold start (STORE_FILE points
 * at /tmp), so before serving the first request we idempotently seed the demo
 * dataset (accounts, published quiz, graded attempts, integrity flags).
 * Skips entirely once data exists — local dev and tests are unaffected
 * (they run src/index.js, not this file).
 */
let seedPromise = null;
function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const { store } = await import('../src/store.js');
        const users = await store.all('users');
        if (users.length === 0) {
          const { seedDemo } = await import('../src/seed/seedDemo.js');
          await seedDemo();
        }
      } catch (err) {
        console.error('cold-start seed skipped:', err.message);
      }
    })();
  }
  return seedPromise;
}

export default async function handler(req, res) {
  await ensureSeeded();
  return app(req, res);
}
