import { ApiError } from '../utils/errors.js';

/**
 * Zod validation for req.body / req.query / req.params.
 * Replaces the parsed value with the stripped/sanitized result.
 *
 * Usage: validate({ body: z.object({...}), query: z.object({...}) })
 */
export function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    for (const key of Object.keys(schemas)) {
      const result = schemas[key].safeParse(req[key]);
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        return next(
          new ApiError(400, 'Validation failed.', { fields: fieldErrors }),
        );
      }
      req[key] = result.data;
    }
    return next();
  };
}
