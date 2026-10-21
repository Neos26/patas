import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { auth, db, firebaseStatus } from '../config/firebase.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { store } from '../store.js';
import { ApiError } from '../utils/errors.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';
import { loginSchema, registerClaimsSchema, registerSchema } from '../validators/schemas.js';

export const authRouter = Router();

// Stricter limit for public credential endpoints.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many sign-in attempts. Please wait and try again.' } },
});

/**
 * POST /api/auth/register
 *  - Firebase mode: the client created the Auth account first; we attach the
 *    profile doc + custom claims (role) to that uid.
 *  - Demo/file mode: creates a local account (scrypt-hashed password).
 */
authRouter.post('/register', credentialLimiter, async (req, res, next) => {
  try {
    if (firebaseStatus().ready) {
      const header = req.headers.authorization || '';
      if (!header.startsWith('Bearer ')) {
        throw new ApiError(
          401,
          'Create your email/password account first, then call register with your ID token.',
        );
      }
      let decoded;
      try {
        decoded = await auth().verifyIdToken(header.slice('Bearer '.length).trim());
      } catch {
        throw new ApiError(401, 'Invalid authentication token.');
      }

      const parsed = registerClaimsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid registration details.');
      }
      const { name, role } = parsed.data;
      const createdAt = new Date().toISOString();

      await db()
        .collection('users')
        .doc(decoded.uid)
        .set({ role, name, email: decoded.email, active: true, createdAt }, { merge: true });
      await db()
        .collection(role === 'teacher' ? 'teachers' : 'students')
        .doc(decoded.uid)
        .set({ uid: decoded.uid, name, email: decoded.email, createdAt }, { merge: true });
      await auth().setCustomUserClaims(decoded.uid, {
        role,
        teacherId: role === 'teacher' ? decoded.uid : null,
        studentId: role === 'student' ? decoded.uid : null,
      });

      return res.status(201).json({
        user: { uid: decoded.uid, role, name, email: decoded.email },
      });
    }

    // Local demo mode.
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid registration details.');
    }
    const { name, email, password, role } = parsed.data;
    const existing = await store.all('users', { where: [['email', '==', email]] });
    if (existing.length) throw new ApiError(409, 'An account with this email already exists.');

    const uid = `u_${randomBytes(8).toString('hex')}`;
    const createdAt = new Date().toISOString();
    await store.set('users', uid, {
      role,
      name,
      email,
      active: true,
      passwordHash: hashPassword(password),
      createdAt,
    });
    await store.set(role === 'teacher' ? 'teachers' : 'students', uid, {
      uid,
      name,
      email,
      createdAt,
    });

    return res.status(201).json({ user: { uid, role, name, email } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/login — local demo mode only (Firebase mode signs in with
 * the client SDK on the login screen).
 */
authRouter.post('/login', credentialLimiter, async (req, res, next) => {
  try {
    if (firebaseStatus().ready) {
      throw new ApiError(
        400,
        'This server uses Firebase Authentication. Sign in with email and password on the login screen.',
      );
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'Enter a valid email and password.');
    }
    const { email, password } = parsed.data;
    const [user] = await store.all('users', { where: [['email', '==', email]] });
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw new ApiError(401, 'Incorrect email or password.');
    }
    if (user.active === false) throw new ApiError(403, 'This account has been disabled.');

    return res.json({
      user: { uid: user.id, role: user.role, name: user.name, email: user.email },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/session-claims
 * Mirrors the authoritative role in `users/{uid}` into Firebase Auth custom
 * claims so the client (and security rules) can trust `request.auth.token.role`.
 * Called automatically by the frontend after every sign-in.
 */
authRouter.post(
  '/session-claims',
  authenticate,
  validate({ body: z.object({}).passthrough().optional().default({}) }),
  async (req, res, next) => {
    try {
      const snap = await db().collection('users').doc(req.user.uid).get();
      if (!snap.exists) {
        throw new ApiError(
          404,
          'No profile is linked to this account yet. Contact your administrator.',
        );
      }
      const profile = snap.data();
      if (!profile.active) {
        throw new ApiError(403, 'This account has been disabled.');
      }

      const claims = {
        role: profile.role,
        teacherId: profile.role === 'teacher' ? profile.teacherId || null : null,
        studentId: profile.role === 'student' ? profile.studentId || null : null,
      };
      await auth().setCustomUserClaims(req.user.uid, claims);

      res.json({ ok: true, role: profile.role, claims });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/auth/me — current profile + claims (for debugging / bootstrap UI).
 */
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.user.uid).get();
    res.json({
      uid: req.user.uid,
      email: req.user.email,
      claims: { role: req.user.role, teacherId: req.user.teacherId, studentId: req.user.studentId },
      profile: snap.exists ? snap.data() : null,
    });
  } catch (err) {
    next(err);
  }
});
