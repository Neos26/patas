import admin from 'firebase-admin';
import { env } from './env.js';

let status = 'not_initialized';
let statusDetail = 'Firebase Admin has not been initialized.';

function tryInit() {
  try {
    if (admin.apps.length > 0) {
      status = 'ready';
      statusDetail = 'Already initialized.';
      return;
    }

    if (env.firebase.serviceAccountB64) {
      const json = JSON.parse(
        Buffer.from(env.firebase.serviceAccountB64, 'base64').toString('utf8'),
      );
      admin.initializeApp({
        credential: admin.credential.cert(json),
        projectId: env.firebase.projectId || json.project_id,
      });
      status = 'ready';
      statusDetail = 'Initialized from FIREBASE_SERVICE_ACCOUNT_B64.';
      return;
    }

    // Falls back to GOOGLE_APPLICATION_CREDENTIALS or Application Default
    // Credentials (works on Google Cloud / attached-service runtimes).
    admin.initializeApp({
      projectId: env.firebase.projectId || undefined,
    });

    if (!env.firebase.credentialsPath && !env.firebase.projectId) {
      status = 'unconfigured';
      statusDetail =
        'No credentials found. Set FIREBASE_SERVICE_ACCOUNT_B64 or GOOGLE_APPLICATION_CREDENTIALS (see server/.env.example).';
      return;
    }
    status = 'ready';
    statusDetail = 'Initialized from application default credentials.';
  } catch (err) {
    status = 'error';
    statusDetail = err.message;
  }
}

tryInit();

export function firebaseStatus() {
  return { ready: status === 'ready', status, detail: statusDetail };
}

export function assertFirebaseReady() {
  if (status !== 'ready') {
    const err = new Error(
      `Server backend not configured: ${statusDetail} — see README “Firebase setup”.`,
    );
    err.statusCode = 503;
    throw err;
  }
}

export function auth() {
  assertFirebaseReady();
  return admin.auth();
}

export function db() {
  assertFirebaseReady();
  return admin.firestore();
}

export { admin };
