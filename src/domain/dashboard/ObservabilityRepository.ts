import type {
  AuditLogCreateInput,
  AuditLogDto,
  AuditLogFilters,
  HealthCheckDto,
  MetricCreateInput,
  MetricDto,
  MetricFilters,
  ObservabilityHealthStatus,
  SystemLogCreateInput,
  SystemLogDto,
  SystemLogFilters,
} from './observabilityDto';

export interface ObservabilityRepository {
  appendSystemLog(input: SystemLogCreateInput): SystemLogDto;
  listSystemLogs(filters?: SystemLogFilters): SystemLogDto[];
  countSystemLogs(filters?: SystemLogFilters): number;

  appendAuditLog(input: AuditLogCreateInput): AuditLogDto;
  listAuditLogs(filters?: AuditLogFilters): AuditLogDto[];
  countAuditLogs(filters?: AuditLogFilters): number;

  upsertHealthCheck(input: {
    component: string;
    status: ObservabilityHealthStatus;
    latencyMs: number;
    details?: Record<string, unknown>;
  }): HealthCheckDto;
  listHealthChecks(): HealthCheckDto[];
  getLatestHealthByComponent(): HealthCheckDto[];

  recordMetric(input: MetricCreateInput): MetricDto;
  listMetrics(filters?: MetricFilters): MetricDto[];
  latestMetricsByName(): MetricDto[];
  countMetrics(filters?: MetricFilters): number;

  /** Prueba de lectura/escritura SQLite. */
  ping(): { ok: boolean; latencyMs: number };
}
