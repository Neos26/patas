import { ApiError } from '../utils/errors.js';

/**
 * Role-based authorization. Must run after `authenticate`.
 * Admins always pass. Unknown/missing role → 403.
 *
 * Usage: router.post('/x', authenticate, requireRole('teacher'), handler)
 */
export function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) return next(new ApiError(401, 'Authentication required.'));
    if (req.user.role === 'admin') return next();
    if (!req.user.role) {
      return next(
        new ApiError(403, 'Your account has no role yet. Contact an administrator.'),
      );
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(403, `This action requires role: ${roles.join(' or ')}.`),
      );
    }
    return next();
  };
}
