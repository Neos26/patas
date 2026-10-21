import multer from 'multer';
import { ApiError } from '../utils/errors.js';

const ALLOWED_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'pdf', 'docx']);
export const MAX_MATERIAL_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MATERIAL_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = String(file.originalname).toLowerCase().split('.').pop();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(
        new ApiError(400, `Unsupported file type ".${ext}". Upload .txt, .md, .csv, .pdf or .docx.`),
      );
    }
    return cb(null, true);
  },
}).single('material');

/** Wraps multer so its errors come back as clean JSON ApiErrors. */
export function uploadMaterial(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(413, 'File is too large (max 5 MB).'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ApiError(400, 'Send the file in a form field named "material".'));
    }
    if (err.code === 'LIMIT_MISSING_FILE') {
      return next(new ApiError(400, 'No file received.'));
    }
    return next(new ApiError(400, err.message || 'Upload failed.'));
  });
}
