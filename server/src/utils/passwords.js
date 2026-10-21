import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384;

/** scrypt hash → `scrypt$<N>$<salt>$<hash>` */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64, { N }).toString('hex');
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const calc = scryptSync(String(password), salt, 64, { N: Number(n) });
    const expected = Buffer.from(hash, 'hex');
    return calc.length === expected.length && timingSafeEqual(calc, expected);
  } catch {
    return false;
  }
}
