import { createHmac, timingSafeEqual } from 'crypto';
import type { AuthUserView, UserRole } from '../../domain/auth/userDto';

export interface JwtPayload extends AuthUserView {
  exp: number;
  iat: number;
}

/**
 * JWT HS256 mínimo con node:crypto (sin jsonwebtoken).
 */
export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number = 8 * 60 * 60,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!secret || secret.length < 16) {
      throw new Error('JWT secret debe tener al menos 16 caracteres');
    }
  }

  sign(user: AuthUserView): string {
    const iat = Math.floor(this.now() / 1000);
    const payload: JwtPayload = {
      ...user,
      iat,
      exp: iat + this.ttlSeconds,
    };
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const sig = this.signPart(`${header}.${body}`);
    return `${header}.${body}.${sig}`;
  }

  verify(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = this.signPart(`${header}.${body}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
      if (!payload.exp || payload.exp * 1000 < this.now()) return null;
      if (!payload.userId || !payload.tenantId || !payload.role) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private signPart(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'ASESOR' || value === 'LECTURA';
}
