import type { UserRepository } from '../../domain/auth/UserRepository';
import type { CompanyService } from './CompanyService';
import type { OnboardingRepository } from '../../domain/dashboard/OnboardingRepository';
import type {
  OnboardingFinishInput,
  OnboardingFinishResultDto,
  OnboardingStatusDto,
} from '../../domain/dashboard/onboardingDto';
import {
  ONBOARDING_TOTAL_STEPS,
  ONBOARDING_VERSION,
} from '../../domain/dashboard/onboardingDto';
import { getActiveTenantId } from '../../domain/tenant/TenantContext';
import type { TenantRepository } from '../../domain/tenant/TenantRepository';
import type { PasswordHasher } from '../../infrastructure/auth/PasswordHasher';

/**
 * Asistente de instalación. Reutiliza CompanyService + UserRepository + TenantRepository.
 * No modifica AuthService / CompanyService / TenantService / motores.
 */
export class OnboardingService {
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly companyService: CompanyService,
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  getStatus(): OnboardingStatusDto {
    return this.onboarding.getStatus();
  }

  setStep(step: number): OnboardingStatusDto {
    const status = this.onboarding.getStatus();
    if (status.completed) return status;
    return this.onboarding.setStep(step);
  }

  finish(input: OnboardingFinishInput): OnboardingFinishResultDto {
    const current = this.onboarding.getStatus();
    if (current.completed) {
      return {
        ok: true,
        alreadyCompleted: true,
        status: current,
      };
    }

    const adminName = String(input.admin?.name ?? '').trim();
    const adminEmail = String(input.admin?.email ?? '').trim().toLowerCase();
    const password = String(input.admin?.password ?? '');
    if (!adminName || !adminEmail || password.length < 6) {
      throw new OnboardingValidationError(
        'Admin requiere nombre, correo y contraseña (mín. 6 caracteres)',
      );
    }

    const companyName = String(input.company?.companyName ?? '').trim();
    if (!companyName) {
      throw new OnboardingValidationError('El nombre de empresa es obligatorio');
    }

    const tenantId = getActiveTenantId();
    this.tenants.ensureDefault(tenantId, companyName);

    this.companyService.updateCompany({
      ...input.company,
      companyName,
    });

    this.ensureAdmin(tenantId, adminName, adminEmail, password);

    const version = input.version?.trim() || ONBOARDING_VERSION;
    const status = this.onboarding.markCompleted(version);
    this.onboarding.recordEvent('installation.completed', {
      version,
      companyName,
      adminEmail,
      steps: ONBOARDING_TOTAL_STEPS,
    });

    return {
      ok: true,
      alreadyCompleted: false,
      status,
    };
  }

  private ensureAdmin(
    tenantId: string,
    name: string,
    email: string,
    password: string,
  ): void {
    const existing = this.users.findByEmail(email);
    if (existing) {
      if (existing.tenantId !== tenantId) {
        throw new OnboardingValidationError(
          'El correo ya pertenece a otro tenant',
        );
      }
      return;
    }
    this.users.create({
      tenantId,
      email,
      name,
      role: 'ADMIN',
      passwordHash: this.hasher.hash(password),
      active: true,
    });
  }
}

export class OnboardingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingValidationError';
  }
}
