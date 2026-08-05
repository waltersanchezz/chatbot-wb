import type { AnalyticsDto } from '../../domain/dashboard/analyticsDto';
import type { AnalyticsRepository } from '../../domain/dashboard/AnalyticsRepository';

/**
 * Analytics API — analítica comercial desde SQLite.
 */
export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  getAnalytics(): AnalyticsDto {
    return this.repository.getAnalytics();
  }
}
