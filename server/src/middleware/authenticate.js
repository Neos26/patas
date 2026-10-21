import { firebaseStatus } from '../config/firebase.js';
import { ApiError } from '../utils/errors.js';

/**
 * Dual-mode authentication.
 *  - Firebase configured → verify the Bearer ID token (production path).
 *  - Firebase not configured → local demo mode: trust the `x-dev-user` JSON
 *    header (never honored when Firebase credentials exist).
 */
export async function authenticate(req, _res, next) {
  const fb = firebaseStatus();

  if (!fb.ready) {
    const dev = req.headers['x-dev-user'];
    if (!dev) {
      return next(
        new ApiError(
          401,
          'Firebase is not configured and no demo user header was sent. Use the demo login screen.',
        ),
      );
    }
    try {
      const u = JSON.parse(dev);
      if (!u.uid || !u.role) throw new Error('missing uid/role');
      req.user = {
        uid: String(u.uid),
        email: u.email || null,
        name: u.name || null,
        role: String(u.role),
        dev: true,
      };
      return next();
    } catch {
      return next(new ApiError(401, 'Invalid demo user header.'));
    }
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Missing Authorization bearer token.'));
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) return next(new ApiError(401, 'Missing ID token.'));

  try {
    const { auth } = await import('../config/firebase.js');
    const decoded = await auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      role: decoded.role || null,
      claims: decoded,
    };
    return next();
  } catch (err) {
    if (err.statusCode === 503) return next(err);
    if (err.code === 'auth/id-token-expired') {
      return next(new ApiError(401, 'Session expired. Please sign in again.'));
    }
    return next(new ApiError(401, 'Invalid authentication token.'));
  }
}
