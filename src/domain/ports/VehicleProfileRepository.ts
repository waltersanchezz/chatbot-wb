import type { VehicleProfile } from '../entities/VehicleProfile';

/**
 * Puerto de persistencia de vehículos CRM (CRM_SPEC §10.2).
 * Upsert por `id`; la clave lógica suave (customerId, brand, model, year)
 * la resuelve la capa de aplicación en un PR posterior.
 */
export interface VehicleProfileRepository {
  listByCustomerId(customerId: string): Promise<VehicleProfile[]>;
  upsert(vehicle: VehicleProfile): Promise<VehicleProfile>;
  findById(id: string): Promise<VehicleProfile | null>;
}
