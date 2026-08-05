/**
 * DTOs de Analytics API (Dashboard Sprint 7).
 */

export interface AnalyticsRankedItemDto {
  key: string;
  label: string;
  count: number;
}

export interface AnalyticsConversacionesDto {
  hoy: number;
  semana: number;
  mes: number;
}

export interface AnalyticsLeadsDto {
  generados: number;
  listosParaAsesor: number;
  abandonados: number;
  cerrados: number;
}

export interface AnalyticsDto {
  conversaciones: AnalyticsConversacionesDto;
  leads: AnalyticsLeadsDto;
  topReferencias: AnalyticsRankedItemDto[];
  topVehiculos: AnalyticsRankedItemDto[];
  topPreguntasTecnicas: AnalyticsRankedItemDto[];
  /** Promedio 0–100; 0 si no hay datos. */
  promedioLeadScore: number;
  tiempoPromedioConversacionMs: number;
  /** Etiqueta legible mm:ss. */
  tiempoPromedioConversacion: string;
  /** Tasa 0–1 (accepted / con decisión). */
  tasaAceptacion: number;
  generatedAt: string;
}
