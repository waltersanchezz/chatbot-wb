/**
 * Observability & Operations Center (Dashboard Sprint 21).
 * Monitoreo desacoplado — no modifica motores ni módulos de negocio.
 */

export const OBSERVABILITY_HEALTH_STATUSES = [
  'ONLINE',
  'DEGRADED',
  'OFFLINE',
  'ERROR',
] as const;

export type ObservabilityHealthStatus =
  (typeof OBSERVABILITY_HEALTH_STATUSES)[number];

export const OBSERVABILITY_LOG_LEVELS = [
  'debug',
  'info',
  'warn',
  'error',
] as const;

export type ObservabilityLogLevel = (typeof OBSERVABILITY_LOG_LEVELS)[number];

export const MONITORED_COMPONENTS = [
  'Dashboard',
  'Conversation API',
  'Clients',
  'Pipeline',
  'Tasks',
  'Analytics',
  'Knowledge',
  'Automation',
  'Workflow',
  'Marketplace',
  'Billing',
  'Copilot',
  'Integration Hub',
  'SQLite',
  'EventBus',
  'SSE',
  'HTTP Server',
  'AI Provider',
] as const;

export type MonitoredComponent = (typeof MONITORED_COMPONENTS)[number];

export const OBSERVABILITY_METRICS = [
  'conversations',
  'clients',
  'automations_executed',
  'workflows_executed',
  'ai_queries',
  'marketplace_usage',
  'integrations',
  'billing_usage',
  'active_users',
  'api_latency_ms',
  'sse_events',
  'memory_mb',
  'cpu_pct',
] as const;

export type ObservabilityMetricName = (typeof OBSERVABILITY_METRICS)[number];

export const AUDIT_ACTIONS = [
  'login',
  'logout',
  'config_change',
  'create',
  'update',
  'delete',
  'marketplace_install',
  'automation',
  'workflow',
  'integration',
  'knowledge',
  'billing',
  'company',
  'health_check',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface SystemLogDto {
  id: string;
  tenantId: string;
  level: ObservabilityLogLevel;
  module: string;
  event: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

export interface HealthCheckDto {
  id: string;
  component: string;
  status: ObservabilityHealthStatus;
  latencyMs: number;
  details: Record<string, unknown>;
  checkedAt: string;
}

export interface MetricDto {
  id: string;
  tenantId: string;
  metric: string;
  value: number;
  unit: string;
  recordedAt: string;
}

export interface SystemLogCreateInput {
  level: ObservabilityLogLevel | string;
  module: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogCreateInput {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

export interface MetricCreateInput {
  metric: string;
  value: number;
  unit?: string;
}

export interface SystemLogFilters {
  level?: string;
  module?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface MetricFilters {
  metric?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface SystemOverviewDto {
  status: ObservabilityHealthStatus;
  uptimeMs: number;
  uptimeLabel: string;
  components: HealthCheckDto[];
  recentErrors: SystemLogDto[];
  metricsSummary: Array<{ metric: string; value: number; unit: string }>;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  cpu: {
    available: boolean;
    userMs: number;
    systemMs: number;
  };
  counts: {
    logs: number;
    audits: number;
    metrics: number;
    healthChecks: number;
  };
  checkedAt: string;
}

export function isObservabilityHealthStatus(
  value: string,
): value is ObservabilityHealthStatus {
  return (OBSERVABILITY_HEALTH_STATUSES as readonly string[]).includes(value);
}

export function isObservabilityLogLevel(
  value: string,
): value is ObservabilityLogLevel {
  return (OBSERVABILITY_LOG_LEVELS as readonly string[]).includes(value);
}

export function isMonitoredComponent(value: string): value is MonitoredComponent {
  return (MONITORED_COMPONENTS as readonly string[]).includes(value);
}

export function isObservabilityMetricName(
  value: string,
): value is ObservabilityMetricName {
  return (OBSERVABILITY_METRICS as readonly string[]).includes(value);
}

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export function aggregateHealthStatus(
  statuses: ObservabilityHealthStatus[],
): ObservabilityHealthStatus {
  if (statuses.length === 0) return 'OFFLINE';
  if (statuses.some((s) => s === 'ERROR')) return 'ERROR';
  if (statuses.some((s) => s === 'OFFLINE')) return 'DEGRADED';
  if (statuses.some((s) => s === 'DEGRADED')) return 'DEGRADED';
  return 'ONLINE';
}

export function formatUptime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
