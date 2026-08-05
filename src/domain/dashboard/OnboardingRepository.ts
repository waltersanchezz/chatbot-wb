import type {
  InstallationEventDto,
  OnboardingStatusDto,
} from './onboardingDto';

export interface OnboardingRepository {
  getStatus(): OnboardingStatusDto;
  setStep(step: number): OnboardingStatusDto;
  markCompleted(version: string): OnboardingStatusDto;
  recordEvent(eventType: string, payload?: Record<string, unknown>): InstallationEventDto;
  listEvents(): InstallationEventDto[];
}
