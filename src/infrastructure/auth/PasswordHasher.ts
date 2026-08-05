import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Hash de contraseñas con scrypt (node:crypto, sin deps externas).
 */
export class PasswordHasher {
  hash(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  verify(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }
}
