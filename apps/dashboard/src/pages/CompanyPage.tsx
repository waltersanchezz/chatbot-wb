import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import {
  fetchCompany,
  updateCompany,
  type CompanyDto,
  type CompanyUpdateInput,
} from '../api/companyApi'
import { Card } from '../components/Card'
import { PageSkeleton } from '../components/Skeleton'
import { QueryError } from '../components/QueryError'
import { useToast } from '../ui/toast/useToast'

type FormState = {
  companyName: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  phone: string
  email: string
  website: string
  address: string
  city: string
  country: string
  businessType: string
  welcomeMessage: string
  workingHours: string
}

function toForm(dto: CompanyDto): FormState {
  return {
    companyName: dto.companyName ?? '',
    logoUrl: dto.logoUrl ?? '',
    primaryColor: dto.primaryColor || '#c45c26',
    secondaryColor: dto.secondaryColor || '#121a22',
    phone: dto.phone ?? '',
    email: dto.email ?? '',
    website: dto.website ?? '',
    address: dto.address ?? '',
    city: dto.city ?? '',
    country: dto.country ?? '',
    businessType: dto.businessType ?? '',
    welcomeMessage: dto.welcomeMessage ?? '',
    workingHours: dto.workingHours ?? '',
  }
}

function toUpdate(form: FormState): CompanyUpdateInput {
  return {
    companyName: form.companyName,
    logoUrl: form.logoUrl || null,
    primaryColor: form.primaryColor,
    secondaryColor: form.secondaryColor,
    phone: form.phone || null,
    email: form.email || null,
    website: form.website || null,
    address: form.address || null,
    city: form.city || null,
    country: form.country || null,
    businessType: form.businessType || null,
    welcomeMessage: form.welcomeMessage || null,
    workingHours: form.workingHours || null,
  }
}

export function CompanyPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const query = useQuery({
    queryKey: ['api', 'company'],
    queryFn: fetchCompany,
  })

  const [form, setForm] = useState<FormState | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    if (query.data) setForm(toForm(query.data))
  }, [query.data])

  const mutation = useMutation({
    mutationFn: updateCompany,
    onSuccess: (data) => {
      queryClient.setQueryData(['api', 'company'], data)
      setForm(toForm(data))
      setFieldError(null)
      toast.success('Configuración guardada', 'Los cambios ya están visibles.')
    },
    onError: () => {
      toast.error('No se pudo guardar', 'Intenta de nuevo en unos segundos.')
    },
  })

  if (query.isLoading || !form) {
    return <PageSkeleton rows={5} />
  }

  if (query.isError) {
    return (
      <QueryError
        title="No se pudo cargar la configuración"
        description="Verifica que el backend esté en marcha y la sesión activa."
        onRetry={() => void query.refetch()}
      />
    )
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function onSave() {
    if (mutation.isPending || !form) return
    const current = form
    if (!current.companyName.trim()) {
      setFieldError('El nombre de empresa es obligatorio.')
      toast.error('Validación', 'El nombre de empresa es obligatorio.')
      return
    }
    if (
      current.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.email.trim())
    ) {
      setFieldError('El email no tiene un formato válido.')
      toast.error('Validación', 'Revisa el formato del email.')
      return
    }
    setFieldError(null)
    mutation.mutate(toUpdate(current))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Card
        title="Configuración de empresa"
        description="Datos visibles para tu operación y marca"
        action={
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={onSave}
            className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
          >
            {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        }
      >
        <div className="space-y-4">
          {fieldError ? (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {fieldError}
            </p>
          ) : null}

          <Field label="Nombre de empresa">
            <input
              value={form.companyName}
              onChange={(e) => setField('companyName', e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Logo (URL)">
            <input
              value={form.logoUrl}
              onChange={(e) => setField('logoUrl', e.target.value)}
              placeholder="https://…"
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Color principal">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setField('primaryColor', e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border border-line bg-surface"
                />
                <input
                  value={form.primaryColor}
                  onChange={(e) => setField('primaryColor', e.target.value)}
                  className={inputClass}
                />
              </div>
            </Field>
            <Field label="Color secundario">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.secondaryColor}
                  onChange={(e) => setField('secondaryColor', e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded border border-line bg-surface"
                />
                <input
                  value={form.secondaryColor}
                  onChange={(e) => setField('secondaryColor', e.target.value)}
                  className={inputClass}
                />
              </div>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp">
              <input
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Correo">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Sitio web">
            <input
              value={form.website}
              onChange={(e) => setField('website', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Dirección">
            <input
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ciudad">
              <input
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="País">
              <input
                value={form.country}
                onChange={(e) => setField('country', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Tipo de negocio">
            <input
              value={form.businessType}
              onChange={(e) => setField('businessType', e.target.value)}
              placeholder="Baterías, rodamientos…"
              className={inputClass}
            />
          </Field>
          <Field label="Horario">
            <input
              value={form.workingHours}
              onChange={(e) => setField('workingHours', e.target.value)}
              placeholder="Lun–Vie 8:00–18:00"
              className={inputClass}
            />
          </Field>
          <Field label="Mensaje de bienvenida">
            <textarea
              value={form.welcomeMessage}
              onChange={(e) => setField('welcomeMessage', e.target.value)}
              rows={3}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
      </Card>

      <Card title="Vista previa" description="Actualización en tiempo real">
        <div
          className="overflow-hidden rounded-xl border border-line"
          style={{ background: form.secondaryColor }}
        >
          <div
            className="px-5 py-4"
            style={{ background: form.primaryColor }}
          >
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg bg-white/90 object-contain"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-xs font-bold text-white">
                  {(form.companyName || 'RC').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">
                  {form.companyName || 'Nombre de empresa'}
                </p>
                <p className="text-xs text-white/80">
                  {form.businessType || 'Tipo de negocio'}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3 bg-panel px-5 py-5 text-sm text-ink">
            <p className="whitespace-pre-wrap text-ink-muted">
              {form.welcomeMessage ||
                'Mensaje de bienvenida que verá el cliente…'}
            </p>
            <dl className="space-y-2 border-t border-line pt-3 text-xs">
              <PreviewRow label="WhatsApp" value={form.phone} />
              <PreviewRow label="Correo" value={form.email} />
              <PreviewRow label="Web" value={form.website} />
              <PreviewRow
                label="Dirección"
                value={[form.address, form.city, form.country]
                  .filter(Boolean)
                  .join(', ')}
              />
              <PreviewRow label="Horario" value={form.workingHours} />
            </dl>
          </div>
        </div>
        {query.data ? (
          <p className="mt-3 text-xs text-ink-muted">
            Última actualización{' '}
            {new Date(query.data.updatedAt).toLocaleString('es-CO')}
          </p>
        ) : null}
      </Card>
    </div>
  )
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

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">
        {value || '—'}
      </dd>
    </div>
  )
}
