/**
 * DTOs de Client API (Dashboard Sprint 4).
 */

export interface ClientDto {
  id: string;
  nombre: string | null;
  waId: string;
  cantidadConversaciones: number;
  primerContacto: string;
  ultimaActividad: string;
  cantidadVehiculos: number;
  /** Vehículo de la conversación más reciente (label + año si hay). */
  ultimoVehiculo: string | null;
  leadPromedio: number | null;
  ultimaReferencia: string | null;
  estadoUltimaConversacion: string;
}

export interface ClientVehicleDto {
  label: string;
  brand: string | null;
  model: string | null;
  year: string | null;
}

export interface ClientConversationSummaryDto {
  id: string;
  salesFlowState: string;
  leadScore: number | null;
  recommendedReference: string | null;
  updatedAt: string;
}

export interface ClientDetailDto {
  id: string;
  nombre: string | null;
  waId: string;
  leadPromedio: number | null;
  createdAt: string;
  updatedAt: string;
  vehiculos: ClientVehicleDto[];
  conversaciones: ClientConversationSummaryDto[];
  referenciasRecomendadas: string[];
}

export interface ClientListDto {
  items: ClientDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  query: string | null;
  sortBy: 'ultimaActividad' | 'primerContacto' | 'leadPromedio' | 'cantidadConversaciones';
  sortOrder: 'asc' | 'desc';
}

export interface ClientListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sortBy?: ClientListDto['sortBy'];
  sortOrder?: 'asc' | 'desc';
}
