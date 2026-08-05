/**
 * Respuesta de GET /api/dashboard.
 * Sin SQL ni detalles de almacenamiento.
 */
export interface DashboardDto {
  conversacionesHoy: number;
  clientesActivos: number;
  leadsPendientes: number;
  conversacionesCerradasHoy: number;
  /** Duración promedio en milisegundos. */
  tiempoPromedioConversacionMs: number;
  /** Etiqueta legible mm:ss. */
  tiempoPromedioConversacion: string;
  generatedAt: string;
}
