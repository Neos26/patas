/**
 * Extracts plain text from uploaded quiz-material files.
 * Stateless: the file is read, converted to text, and returned — nothing is
 * stored on disk (important for serverless/Vercel).
 */
import { ApiError } from '../utils/errors.js';

export const MAX_MATERIAL_CHARS = 60000;

function normalize(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractMaterialText(buffer, originalname) {
  const ext = String(originalname).toLowerCase().split('.').pop();
  let text = '';
  let pages = null;

  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'csv') {
    text = buffer.toString('utf8');
  } else if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    text = result.text || '';
    pages = result.totalPages;
  } else if (ext === 'docx') {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
  } else {
    throw new ApiError(
      400,
      `Unsupported file type ".${ext}". Upload .txt, .md, .csv, .pdf or .docx.`,
    );
  }

  text = normalize(text);
  if (!text) {
    throw new ApiError(422, 'No readable text found in that file (it may be scanned images).');
  }

  const totalChars = text.length;
  const truncated = totalChars > MAX_MATERIAL_CHARS;
  return {
    text: truncated ? text.slice(0, MAX_MATERIAL_CHARS) : text,
    chars: truncated ? MAX_MATERIAL_CHARS : totalChars,
    totalChars,
    truncated,
    pages,
  };
}
