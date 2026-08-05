import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  fetchOnboardingStatus,
  finishOnboarding,
  saveOnboardingStep,
} from '../api/onboardingApi'
import { Loading } from '../components/Loading'

const STEPS = [
  'Empresa',
  'Imagen',
  'Contacto',
  'Horario',
  'Administrador',
  'Resumen',
] as const

type WizardState = {
  companyName: string
  businessType: string
  city: string
  country: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  phone: string
  email: string
  website: string
  address: string
  workingHours: string
  welcomeMessage: string
  adminName: string
  adminEmail: string
  adminPassword: string
  adminPasswordConfirm: string
}

const initialState: WizardState = {
  companyName: '',
  businessType: '',
  city: '',
  country: 'Colombia',
  logoUrl: '',
  primaryColor: '#c45c26',
  secondaryColor: '#121a22',
  phone: '',
  email: '',
  website: '',
  address: '',
  workingHours: '',
  welcomeMessage: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  adminPasswordConfirm: '',
}

export function WizardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const statusQuery = useQuery({
    queryKey: ['api', 'onboarding'],
    queryFn: fetchOnboardingStatus,
  })

  const [step, setStep] = useState(1)
  const [form, setForm] = useState<WizardState>(initialState)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (statusQuery.data && !statusQuery.data.completed) {
      setStep(statusQuery.data.step || 1)
    }
  }, [statusQuery.data])

  const finishMutation = useMutation({
    mutationFn: finishOnboarding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api', 'onboarding'] })
      await queryClient.invalidateQueries({ queryKey: ['api', 'company'] })
      navigate('/', { replace: true })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Error al finalizar')
    },
  })

  const progress = useMemo(
    () => Math.round(((step - 1) / STEPS.length) * 100),
    [step],
  )

  if (statusQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loading label="Cargando asistente…" />
      </div>
    )
  }

  if (statusQuery.data?.completed) {
    return <Navigate to="/" replace />
  }

  function setField<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function goNext() {
    setError(null)
    const validation = validateStep(step, form)
    if (validation) {
      setError(validation)
      return
    }
    const next = Math.min(STEPS.length, step + 1)
    setStep(next)
    try {
      await saveOnboardingStep(next)
      await queryClient.invalidateQueries({ queryKey: ['api', 'onboarding'] })
    } catch {
      /* el paso local sigue */
    }
  }

  function goBack() {
    setError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  function onFinish() {
    setError(null)
    if (form.adminPassword !== form.adminPasswordConfirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    finishMutation.mutate({
      company: {
        companyName: form.companyName,
        businessType: form.businessType || null,
        city: form.city || null,
        country: form.country || null,
        logoUrl: form.logoUrl || null,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        address: form.address || null,
        workingHours: form.workingHours || null,
        welcomeMessage: form.welcomeMessage || null,
      },
      admin: {
        name: form.adminName,
        email: form.adminEmail,
        password: form.adminPassword,
      },
    })
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,#f3e4d8_0%,transparent_40%),linear-gradient(165deg,#f8f6f3_0%,#eef2f5_100%)]"
      />
      <div className="relative mx-auto w-full max-w-3xl">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">
          Instalación
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          Asistente de creación de empresa
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Paso {step} de {STEPS.length}: {STEPS[step - 1]}
        </p>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${Math.max(progress, step === 1 ? 8 : progress)}%` }}
          />
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-panel/95 p-6 shadow-[0_20px_50px_rgba(15,23,32,0.06)]">
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre de empresa">
                <input
                  className={inputClass}
                  value={form.companyName}
                  onChange={(e) => setField('companyName', e.target.value)}
                />
              </Field>
              <Field label="Tipo de negocio">
                <input
                  className={inputClass}
                  value={form.businessType}
                  onChange={(e) => setField('businessType', e.target.value)}
                />
              </Field>
              <Field label="Ciudad">
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                />
              </Field>
              <Field label="País">
                <input
                  className={inputClass}
                  value={form.country}
                  onChange={(e) => setField('country', e.target.value)}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <Field label="Logo (URL)">
                  <input
                    className={inputClass}
                    value={form.logoUrl}
                    onChange={(e) => setField('logoUrl', e.target.value)}
                  />
                </Field>
                <Field label="Color principal">
                  <ColorField
                    value={form.primaryColor}
                    onChange={(v) => setField('primaryColor', v)}
                  />
                </Field>
                <Field label="Color secundario">
                  <ColorField
                    value={form.secondaryColor}
                    onChange={(v) => setField('secondaryColor', v)}
                  />
                </Field>
              </div>
              <BrandPreview form={form} />
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp">
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </Field>
              <Field label="Sitio web">
                <input
                  className={inputClass}
                  value={form.website}
                  onChange={(e) => setField('website', e.target.value)}
                />
              </Field>
              <Field label="Dirección">
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Field label="Horario laboral">
                <input
                  className={inputClass}
                  value={form.workingHours}
                  onChange={(e) => setField('workingHours', e.target.value)}
                  placeholder="Lun–Vie 8:00–18:00"
                />
              </Field>
              <Field label="Mensaje de bienvenida">
                <textarea
                  className={`${inputClass} resize-y`}
                  rows={4}
                  value={form.welcomeMessage}
                  onChange={(e) => setField('welcomeMessage', e.target.value)}
                />
              </Field>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre del administrador">
                <input
                  className={inputClass}
                  value={form.adminName}
                  onChange={(e) => setField('adminName', e.target.value)}
                />
              </Field>
              <Field label="Correo">
                <input
                  className={inputClass}
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setField('adminEmail', e.target.value)}
                />
              </Field>
              <Field label="Contraseña">
                <input
                  className={inputClass}
                  type="password"
                  value={form.adminPassword}
                  onChange={(e) => setField('adminPassword', e.target.value)}
                />
              </Field>
              <Field label="Confirmación">
                <input
                  className={inputClass}
                  type="password"
                  value={form.adminPasswordConfirm}
                  onChange={(e) =>
                    setField('adminPasswordConfirm', e.target.value)
                  }
                />
              </Field>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4 text-sm">
              <BrandPreview form={form} />
              <SummaryGrid form={form} />
            </div>
          )}

          {error ? (
            <p className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || finishMutation.isPending}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
            >
              Atrás
            </button>
            {step < STEPS.length ? (
              <button
                type="button"
                onClick={() => void goNext()}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                disabled={finishMutation.isPending}
                onClick={onFinish}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {finishMutation.isPending
                  ? 'Instalando…'
                  : 'Finalizar instalación'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function validateStep(step: number, form: WizardState): string | null {
  if (step === 1 && !form.companyName.trim()) {
    return 'Indica el nombre de la empresa'
  }
  if (step === 5) {
    if (!form.adminName.trim() || !form.adminEmail.trim()) {
      return 'Completa nombre y correo del administrador'
    }
    if (form.adminPassword.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres'
    }
    if (form.adminPassword !== form.adminPasswordConfirm) {
      return 'Las contraseñas no coinciden'
    }
  }
  return null
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none ring-accent/30 focus:ring-2'

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

function ColorField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded border border-line"
      />
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function BrandPreview({ form }: { form: WizardState }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-line"
      style={{ background: form.secondaryColor }}
    >
      <div className="px-4 py-3" style={{ background: form.primaryColor }}>
        <div className="flex items-center gap-3">
          {form.logoUrl ? (
            <img
              src={form.logoUrl}
              alt=""
              className="h-9 w-9 rounded-md bg-white/90 object-contain"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/20 text-xs font-bold text-white">
              {(form.companyName || 'EM').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-white">
              {form.companyName || 'Tu empresa'}
            </p>
            <p className="text-xs text-white/80">
              {form.businessType || 'Tipo de negocio'}
            </p>
          </div>
        </div>
      </div>
      <div className="bg-panel px-4 py-4 text-xs text-ink-muted">
        {form.welcomeMessage || 'Vista previa del mensaje de bienvenida'}
      </div>
    </div>
  )
}

function SummaryGrid({ form }: { form: WizardState }) {
  const rows = [
    ['Empresa', form.companyName],
    ['Negocio', form.businessType],
    ['Ciudad', form.city],
    ['País', form.country],
    ['WhatsApp', form.phone],
    ['Email', form.email],
    ['Web', form.website],
    ['Dirección', form.address],
    ['Horario', form.workingHours],
    ['Admin', `${form.adminName} · ${form.adminEmail}`],
  ]
  return (
    <dl className="divide-y divide-line rounded-xl border border-line">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex justify-between gap-3 px-4 py-2.5 text-sm"
        >
          <dt className="text-ink-muted">{label}</dt>
          <dd className="text-right font-medium text-ink">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
