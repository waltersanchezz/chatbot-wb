import type { CompanyUpdateInput } from './companyApi'
import { apiFetch } from './http'

export interface OnboardingStatusDto {
  completed: boolean
  step: number
  progress: number
  version: string | null
  completedAt: string | null
  tenantId: string
}

export interface OnboardingFinishInput {
  company: CompanyUpdateInput
  admin: {
    name: string
    email: string
    password: string
  }
  version?: string
}

export interface OnboardingFinishResultDto {
  ok: boolean
  alreadyCompleted: boolean
  status: OnboardingStatusDto
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatusDto> {
  const res = await apiFetch('/api/onboarding')
  if (!res.ok) throw new Error(`Onboarding API ${res.status}`)
  return (await res.json()) as OnboardingStatusDto
}

export async function saveOnboardingStep(
  step: number,
): Promise<OnboardingStatusDto> {
  const res = await apiFetch('/api/onboarding/step', {
    method: 'PUT',
    body: JSON.stringify({ step }),
  })
  if (!res.ok) throw new Error(`Onboarding step ${res.status}`)
  return (await res.json()) as OnboardingStatusDto
}

export async function finishOnboarding(
  input: OnboardingFinishInput,
): Promise<OnboardingFinishResultDto> {
  const res = await apiFetch('/api/onboarding/finish', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `Onboarding finish ${res.status}`)
  }
  return (await res.json()) as OnboardingFinishResultDto
}
