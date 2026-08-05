/**
 * DTOs de GET /api/conversations (lista paginada).
 * Sin SQL ni detalles de almacenamiento.
 */

export interface ConversationListItemDto {
  id: string;
  /** Nombre del cliente si está disponible en el snapshot. */
  customerName: string | null;
  /** Teléfono / waId. */
  phone: string;
  vehicle: string | null;
  year: string | null;
  recommendedReference: string | null;
  /** Estado actual del SalesFlow (o state persistido). */
  salesFlowState: string;
  leadScore: number | null;
  createdAt: string;
  lastActivityAt: string;
}

export interface ConversationListDto {
  items: ConversationListItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  query: string | null;
  sortBy: 'createdAt' | 'lastActivityAt';
  sortOrder: 'asc' | 'desc';
}

export interface ConversationListQuery {
  page?: number;
  pageSize?: number;
  /** Búsqueda en teléfono, vehículo, referencia, estado, nombre. */
  q?: string;
  sortBy?: 'createdAt' | 'lastActivityAt';
  sortOrder?: 'asc' | 'desc';
}
