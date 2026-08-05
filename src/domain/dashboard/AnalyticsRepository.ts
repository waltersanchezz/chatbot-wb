import type { AnalyticsDto } from './analyticsDto';

/**
 * Puerto Analytics API (métricas comerciales desde SQLite).
 */
export interface AnalyticsRepository {
  getAnalytics(): AnalyticsDto;
}
