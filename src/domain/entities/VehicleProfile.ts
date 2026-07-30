/**
 * Vehículo conocido del cliente a lo largo del tiempo (1→N por customer).
 * Independiente del lead; un lead puede referenciar `vehicleProfileId`.
 */
export type VehicleProfileSource = 'whatsapp_flow' | 'advisor' | 'import';

export interface VehicleProfile {
  id: string;
  customerId: string;
  brand: string;
  model: string;
  year?: string;
  version?: string;
  notes?: string;
  /** Origen de alta. */
  source: VehicleProfileSource;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
