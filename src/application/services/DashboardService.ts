import type { DashboardDto } from '../../domain/dashboard/dashboardDto';
import type { DashboardRepository } from '../../domain/ports/DashboardRepository';

/**
 * Dashboard API — capa de aplicación.
 * Solo lectura de métricas; no toca el flujo conversacional.
 */
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  getDashboard(): DashboardDto {
    return this.repository.getDashboardSummary();
  }
}
