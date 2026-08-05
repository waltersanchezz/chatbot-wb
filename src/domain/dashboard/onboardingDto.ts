/**
 * Onboarding / instalación de empresa (Sprint 12).
 */

import type { CompanyUpdateInput } from './companyDto';

export const ONBOARDING_TOTAL_STEPS = 6;
export const ONBOARDING_VERSION = '1.0.0';

export interface OnboardingStatusDto {
  completed: boolean;
  step: number;
  progress: number;
  version: string | null;
  completedAt: string | null;
  tenantId: string;
}

export interface OnboardingAdminInput {
  name: string;
  email: string;
  password: string;
}

export interface OnboardingFinishInput {
  company: CompanyUpdateInput;
  admin: OnboardingAdminInput;
  version?: string;
}

export interface OnboardingFinishResultDto {
  ok: boolean;
  alreadyCompleted: boolean;
  status: OnboardingStatusDto;
}

export interface InstallationEventDto {
  id: string;
  tenantId: string;
  eventType: string;
  createdAt: string;
}
