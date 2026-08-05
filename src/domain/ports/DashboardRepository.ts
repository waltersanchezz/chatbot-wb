import type { DashboardDto } from '../dashboard/dashboardDto';

/**
 * Puerto de lectura para el Dashboard API.
 * Independiente de LearningEngine y PersistenceRepository.
 */
export interface DashboardRepository {
  getDashboardSummary(now?: number): DashboardDto;
}
