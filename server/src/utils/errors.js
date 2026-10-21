export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFound = (msg = 'Resource not found') => new ApiError(404, msg);
export const forbidden = (msg = 'You do not have permission to do that') =>
  new ApiError(403, msg);
export const unauthorized = (msg = 'Authentication required') =>
  new ApiError(401, msg);
export const badRequest = (msg = 'Invalid request', details) =>
  new ApiError(400, msg, details);
export const conflict = (msg = 'Conflict') => new ApiError(409, msg);
export const unavailable = (msg = 'Service temporarily unavailable') =>
  new ApiError(503, msg);
