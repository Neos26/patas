/**
 * Tri-mode data store (same tiny interface used by every route):
 *  1. Firestore (Admin SDK) when Firebase credentials are configured.
 *  2. Vercel Blob when BLOB_READ_WRITE_TOKEN / OIDC is available — persistent
 *     storage for the hosted serverless deployment (survives cold starts).
 *  3. JSON file store (server/data/db.json) otherwise — zero-setup local demo.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get as blobGet, put as blobPut } from '@vercel/blob';
import { firebaseStatus, db as firestoreDb } from './config/firebase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE =
  process.env.STORE_FILE || path.join(__dirname, '..', 'data', 'db.json');

let mem = null;

async function loadMem() {
  if (mem) return mem;
  try {
    mem = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch {
    mem = {};
  }
  return mem;
}

let writing = Promise.resolve();
async function persist() {
  const snapshot = JSON.stringify(mem ?? {}, null, 2);
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, snapshot, 'utf8');
    await fs.rename(tmp, DATA_FILE);
  });
  return writing;
}

function col(memDb, name) {
  if (!memDb[name]) memDb[name] = {};
  return memDb[name];
}

function matches(doc, where = []) {
  return where.every(([field, op, value]) => {
    if (op === '==') return doc[field] === value;
    if (op === '>=') return doc[field] >= value;
    if (op === '<=') return doc[field] <= value;
    if (op === 'in') return Array.isArray(value) && value.includes(doc[field]);
    return false;
  });
}

function useFirestore() {
  return firebaseStatus().ready;
}

const BLOB_PATHNAME = 'data/db.json';

function useBlob() {
  return !useFirestore() && Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function blobLoad() {
  const res = await blobGet(BLOB_PATHNAME, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return {};
  try {
    return JSON.parse(await new Response(res.stream).text());
  } catch {
    return {};
  }
}

async function blobPersist(db) {
  await blobPut(BLOB_PATHNAME, JSON.stringify(db, null, 2), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

let blobQueue = Promise.resolve();
function blobTxn(fn) {
  const run = blobQueue.then(fn, fn);
  blobQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

export const store = {
  get mode() {
    return useFirestore() ? 'firestore' : useBlob() ? 'blob' : 'file';
  },

  async get(collection, id) {
    if (useFirestore()) {
      const snap = await firestoreDb().collection(collection).doc(id).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }
    if (useBlob()) {
      const db = await blobLoad();
      const doc = col(db, collection)[id];
      return doc ? { id, ...doc } : null;
    }
    const db = await loadMem();
    const doc = col(db, collection)[id];
    return doc ? { id, ...doc } : null;
  },

  async set(collection, id, data) {
    if (useFirestore()) {
      await firestoreDb().collection(collection).doc(id).set(data);
      return { id, ...data };
    }
    if (useBlob()) {
      return blobTxn(async () => {
        const db = await blobLoad();
        col(db, collection)[id] = { ...data };
        await blobPersist(db);
        return { id, ...data };
      });
    }
    const db = await loadMem();
    col(db, collection)[id] = { ...data };
    await persist();
    return { id, ...data };
  },

  async patch(collection, id, patchData) {
    if (useFirestore()) {
      await firestoreDb().collection(collection).doc(id).update(patchData);
      return this.get(collection, id);
    }
    if (useBlob()) {
      return blobTxn(async () => {
        const db = await blobLoad();
        const c = col(db, collection);
        if (!c[id]) return null;
        c[id] = { ...c[id], ...patchData };
        await blobPersist(db);
        return { id, ...c[id] };
      });
    }
    const db = await loadMem();
    const c = col(db, collection);
    if (!c[id]) return null;
    c[id] = { ...c[id], ...patchData };
    await persist();
    return { id, ...c[id] };
  },

  async remove(collection, id) {
    if (useFirestore()) {
      await firestoreDb().collection(collection).doc(id).delete();
      return true;
    }
    if (useBlob()) {
      return blobTxn(async () => {
        const db = await blobLoad();
        delete col(db, collection)[id];
        await blobPersist(db);
        return true;
      });
    }
    const db = await loadMem();
    delete col(db, collection)[id];
    await persist();
    return true;
  },

  /** Returns [{ id, ...data }]. `where` = [[field, op, value], ...] ('==', '>=', '<=', 'in'). */
  async all(collection, { where = [] } = {}) {
    if (useFirestore()) {
      let q = firestoreDb().collection(collection);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      const snap = await q.get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    if (useBlob()) {
      const db = await blobLoad();
      return Object.entries(col(db, collection))
        .filter(([, doc]) => matches(doc, where))
        .map(([id, doc]) => ({ id, ...doc }));
    }
    const db = await loadMem();
    return Object.entries(col(db, collection))
      .filter(([, doc]) => matches(doc, where))
      .map(([id, doc]) => ({ id, ...doc }));
  },

  async add(collection, data, fixedId = null) {
    if (useFirestore()) {
      const ref = fixedId
        ? firestoreDb().collection(collection).doc(fixedId)
        : firestoreDb().collection(collection).doc();
      await ref.set(data);
      return ref.id;
    }
    if (useBlob()) {
      return blobTxn(async () => {
        const db = await blobLoad();
        const id = fixedId || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        col(db, collection)[id] = { ...data };
        await blobPersist(db);
        return id;
      });
    }
    const db = await loadMem();
    const id = fixedId || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    col(db, collection)[id] = { ...data };
    await persist();
    return id;
  },
};
