import { ApiError } from '../utils/errors.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req, _res, next) {
  next(new ApiError(404, 'Endpoint not found.'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    console.error('[error]', err.stack || err.message || err);
  }

  const body = {
    error: {
      message:
        isServerError && env.isProd
          ? 'Internal server error.'
          : err.message || 'Unexpected error.',
    },
  };
  if (err.details) body.error.details = err.details;
  if (err.code) body.error.code = err.code;

  res.status(status).json(body);
}
