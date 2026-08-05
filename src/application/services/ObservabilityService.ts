import type { ObservabilityRepository } from '../../domain/dashboard/ObservabilityRepository';
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
  SystemOverviewDto,
} from '../../domain/dashboard/observabilityDto';
import {
  MONITORED_COMPONENTS,
  aggregateHealthStatus,
  formatUptime,
} from '../../domain/dashboard/observabilityDto';

export class ObservabilityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObservabilityValidationError';
  }
}

/** Probes opcionales — solo APIs públicas / presencia, sin modificar módulos. */
export interface ObservabilityProbeDeps {
  knowledge?: { list: () => unknown };
  automation?: { list: () => unknown };
  workflow?: { list: () => unknown };
  marketplace?: { listTemplates: () => unknown };
  billing?: { listPlans: () => unknown };
  integration?: { list: () => unknown };
  copilot?: { listHistory: () => unknown };
  eventBus?: { emit?: (...args: unknown[]) => unknown } | object;
  aiProvider?: object | null;
}

/**
 * Observability & Operations Center — capa SaaS desacoplada.
 */
export class ObservabilityService {
  private readonly startedAt: number;

  constructor(
    private readonly repository: ObservabilityRepository,
    private readonly probes: ObservabilityProbeDeps = {},
    options: { startedAt?: number } = {},
  ) {
    this.startedAt = options.startedAt ?? Date.now();
  }

  getHealth(): {
    status: ObservabilityHealthStatus;
    components: HealthCheckDto[];
  } {
    const components = this.repository.getLatestHealthByComponent();
    return {
      status: aggregateHealthStatus(components.map((c) => c.status)),
      components,
    };
  }

  listLogs(filters?: SystemLogFilters): SystemLogDto[] {
    return this.repository.listSystemLogs(filters);
  }

  listAudit(filters?: AuditLogFilters): AuditLogDto[] {
    return this.repository.listAuditLogs(filters);
  }

  listMetrics(filters?: MetricFilters): MetricDto[] {
    return this.repository.listMetrics(filters);
  }

  recordLog(input: SystemLogCreateInput): SystemLogDto {
    if (!input.module?.trim() || !input.event?.trim() || !input.message?.trim()) {
      throw new ObservabilityValidationError(
        'module, event y message son obligatorios',
      );
    }
    return this.repository.appendSystemLog(input);
  }

  recordAudit(input: AuditLogCreateInput): AuditLogDto {
    if (!input.action?.trim() || !input.resource?.trim()) {
      throw new ObservabilityValidationError(
        'action y resource son obligatorios',
      );
    }
    return this.repository.appendAuditLog(input);
  }

  recordMetric(input: MetricCreateInput): MetricDto {
    if (!input.metric?.trim()) {
      throw new ObservabilityValidationError('metric es obligatorio');
    }
    if (!Number.isFinite(input.value)) {
      throw new ObservabilityValidationError('value debe ser numérico');
    }
    return this.repository.recordMetric(input);
  }

  getSystemOverview(): SystemOverviewDto {
    const health = this.getHealth();
    const uptimeMs = Math.max(0, Date.now() - this.startedAt);
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const recentErrors = this.repository.listSystemLogs({
      level: 'error',
      limit: 10,
    });
    const metricsSummary = this.repository.latestMetricsByName().map((m) => ({
      metric: m.metric,
      value: m.value,
      unit: m.unit,
    }));

    return {
      status: health.status,
      uptimeMs,
      uptimeLabel: formatUptime(uptimeMs),
      components: health.components,
      recentErrors,
      metricsSummary,
      memory: {
        rssMb: roundMb(mem.rss),
        heapUsedMb: roundMb(mem.heapUsed),
        heapTotalMb: roundMb(mem.heapTotal),
      },
      cpu: {
        available: true,
        userMs: Math.round(cpu.user / 1000),
        systemMs: Math.round(cpu.system / 1000),
      },
      counts: {
        logs: this.repository.countSystemLogs({ limit: 500 }),
        audits: this.repository.countAuditLogs({ limit: 500 }),
        metrics: this.repository.countMetrics({ limit: 500 }),
        healthChecks: health.components.length,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  /** Ejecuta health checks internos y persiste resultados. */
  runHealthCheck(): {
    status: ObservabilityHealthStatus;
    components: HealthCheckDto[];
  } {
    const results: HealthCheckDto[] = [];

    for (const component of MONITORED_COMPONENTS) {
      results.push(this.probeComponent(component));
    }

    // Métricas de runtime
    const mem = process.memoryUsage();
    this.repository.recordMetric({
      metric: 'memory_mb',
      value: roundMb(mem.heapUsed),
      unit: 'MB',
    });
    const cpu = process.cpuUsage();
    this.repository.recordMetric({
      metric: 'cpu_pct',
      value: Math.min(
        100,
        Number((((cpu.user + cpu.system) / 1_000_000) % 100).toFixed(2)),
      ),
      unit: '%',
    });

    this.repository.appendSystemLog({
      level: 'info',
      module: 'Observability',
      event: 'health_check',
      message: `Health check completado · ${results.length} componentes`,
      metadata: {
        status: aggregateHealthStatus(results.map((r) => r.status)),
      },
    });

    this.repository.appendAuditLog({
      action: 'health_check',
      resource: 'observability',
      resourceId: 'system',
      newValue: {
        components: results.length,
        status: aggregateHealthStatus(results.map((r) => r.status)),
      },
    });

    return {
      status: aggregateHealthStatus(results.map((r) => r.status)),
      components: results,
    };
  }

  private probeComponent(component: string): HealthCheckDto {
    const started = Date.now();
    let status: ObservabilityHealthStatus = 'ONLINE';
    let details: Record<string, unknown> = { probe: 'ok' };

    try {
      switch (component) {
        case 'SQLite': {
          const ping = this.repository.ping();
          status = ping.ok ? 'ONLINE' : 'ERROR';
          details = { ping };
          break;
        }
        case 'HTTP Server':
          status = 'ONLINE';
          details = { listening: true };
          break;
        case 'SSE':
          status = this.probes.eventBus ? 'ONLINE' : 'DEGRADED';
          details = { eventBusBound: Boolean(this.probes.eventBus) };
          break;
        case 'EventBus':
          status = this.probes.eventBus ? 'ONLINE' : 'DEGRADED';
          details = { bound: Boolean(this.probes.eventBus) };
          break;
        case 'AI Provider':
          status = this.probes.aiProvider ? 'ONLINE' : 'DEGRADED';
          details = { bound: Boolean(this.probes.aiProvider) };
          break;
        case 'Knowledge':
          ({ status, details } = probeList(
            this.probes.knowledge,
            'list',
            'Knowledge',
          ));
          break;
        case 'Automation':
          ({ status, details } = probeList(
            this.probes.automation,
            'list',
            'Automation',
          ));
          break;
        case 'Workflow':
          ({ status, details } = probeList(
            this.probes.workflow,
            'list',
            'Workflow',
          ));
          break;
        case 'Marketplace':
          ({ status, details } = probeCall(
            this.probes.marketplace,
            () => this.probes.marketplace!.listTemplates(),
            'Marketplace',
          ));
          break;
        case 'Billing':
          ({ status, details } = probeCall(
            this.probes.billing,
            () => this.probes.billing!.listPlans(),
            'Billing',
          ));
          break;
        case 'Integration Hub':
          ({ status, details } = probeList(
            this.probes.integration,
            'list',
            'Integration Hub',
          ));
          break;
        case 'Copilot':
          ({ status, details } = probeCall(
            this.probes.copilot,
            () => this.probes.copilot!.listHistory(),
            'Copilot',
          ));
          break;
        case 'Dashboard':
        case 'Conversation API':
        case 'Clients':
        case 'Pipeline':
        case 'Tasks':
        case 'Analytics':
          status = 'ONLINE';
          details = { surface: component, mode: 'passive' };
          break;
        default:
          status = 'DEGRADED';
          details = { reason: 'unknown_component' };
      }
    } catch (err) {
      status = 'ERROR';
      details = {
        error: err instanceof Error ? err.message : 'unknown',
      };
      this.repository.appendSystemLog({
        level: 'error',
        module: 'Observability',
        event: 'probe_failed',
        message: `Fallo probe ${component}`,
        metadata: details,
      });
    }

    const latencyMs = Math.max(0, Date.now() - started);
    return this.repository.upsertHealthCheck({
      component,
      status,
      latencyMs,
      details,
    });
  }
}

function roundMb(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function probeList(
  target: { list: () => unknown } | undefined,
  _method: 'list',
  label: string,
): { status: ObservabilityHealthStatus; details: Record<string, unknown> } {
  if (!target) {
    return {
      status: 'DEGRADED',
      details: { bound: false, component: label },
    };
  }
  const result = target.list();
  const count = Array.isArray(result)
    ? result.length
    : result && typeof result === 'object' && 'items' in (result as object)
      ? Number((result as { items?: unknown[] }).items?.length ?? 0)
      : 0;
  return {
    status: 'ONLINE',
    details: { bound: true, count, component: label },
  };
}

function probeCall(
  target: unknown,
  fn: () => unknown,
  label: string,
): { status: ObservabilityHealthStatus; details: Record<string, unknown> } {
  if (!target) {
    return {
      status: 'DEGRADED',
      details: { bound: false, component: label },
    };
  }
  const result = fn();
  const count = Array.isArray(result) ? result.length : 1;
  return {
    status: 'ONLINE',
    details: { bound: true, count, component: label },
  };
}
