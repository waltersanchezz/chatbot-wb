import type {
  AuthUserView,
  LoginResultDto,
  UserDto,
} from '../../domain/auth/userDto';
import type { UserRepository } from '../../domain/auth/UserRepository';
import type { JwtService } from '../../infrastructure/auth/JwtService';
import type { PasswordHasher } from '../../infrastructure/auth/PasswordHasher';

/**
 * Autenticación SaaS. No conoce ConversationEngine ni motores de venta.
 */
export class AuthService {
  /** Denylist en memoria para logout (sin Redis). */
  private readonly revoked = new Map<string, number>();

  constructor(
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly hasher: PasswordHasher,
    private readonly now: () => number = () => Date.now(),
  ) {}

  login(email: string, password: string): LoginResultDto | null {
    const user = this.users.findByEmail(email);
    if (!user || !user.active) return null;
    if (!this.hasher.verify(password, user.passwordHash)) return null;

    const view = toAuthView(user);
    const token = this.jwt.sign(view);
    return { token, user: view };
  }

  logout(token: string): void {
    const payload = this.jwt.verify(token);
    if (!payload) return;
    this.revoked.set(token, payload.exp * 1000);
    this.purgeRevoked();
  }

  me(token: string): AuthUserView | null {
    if (this.isRevoked(token)) return null;
    const payload = this.jwt.verify(token);
    if (!payload) return null;

    const fresh = this.users.findById(payload.userId);
    if (!fresh || !fresh.active) return null;
    if (fresh.tenantId !== payload.tenantId) return null;

    return toAuthView(fresh);
  }

  /** Resuelve usuario desde Bearer token (middleware). */
  authenticate(token: string): AuthUserView | null {
    return this.me(token);
  }

  ensureSeedAdmin(input: {
    tenantId: string;
    email: string;
    name: string;
    password: string;
  }): UserDto {
    const passwordHash = this.hasher.hash(input.password);
    const record = this.users.ensureSeedAdmin({
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      passwordHash,
    });
    return toUserDto(record);
  }

  private isRevoked(token: string): boolean {
    this.purgeRevoked();
    return this.revoked.has(token);
  }

  private purgeRevoked(): void {
    const now = this.now();
    for (const [token, expMs] of this.revoked) {
      if (expMs <= now) this.revoked.delete(token);
    }
  }
}

function toAuthView(user: {
  id: string;
  tenantId: string;
  role: AuthUserView['role'];
  name: string;
  email: string;
}): AuthUserView {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
    email: user.email,
  };
}

function toUserDto(user: {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: AuthUserView['role'];
  active: boolean;
  createdAt: string;
}): UserDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  };
}
