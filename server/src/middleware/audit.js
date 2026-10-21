import { store } from '../store.js';

/**
 * Fire-and-forget audit trail for privileged actions.
 * Never throws into the request path.
 */
export async function writeAudit(req, entry) {
  try {
    await store.add('auditLogs', {
      actorUid: req.user?.uid || null,
      actorRole: req.user?.role || null,
      action: entry.action,
      targetType: entry.targetType || null,
      targetId: entry.targetId || null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[audit] failed:', err.message);
  }
}
