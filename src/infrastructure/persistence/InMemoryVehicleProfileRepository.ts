import type { VehicleProfile } from '../../domain/entities/VehicleProfile';
import type { VehicleProfileRepository } from '../../domain/ports/VehicleProfileRepository';

/**
 * Persistencia en memoria de VehicleProfile (CRM_SPEC §5.3 / §10.2).
 */
export class InMemoryVehicleProfileRepository implements VehicleProfileRepository {
  private readonly byId = new Map<string, VehicleProfile>();

  async listByCustomerId(customerId: string): Promise<VehicleProfile[]> {
    return [...this.byId.values()]
      .filter((v) => v.customerId === customerId)
      .map(cloneVehicle)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }

  async upsert(vehicle: VehicleProfile): Promise<VehicleProfile> {
    const copy = cloneVehicle(vehicle);
    this.byId.set(copy.id, copy);
    return cloneVehicle(copy);
  }

  async findById(id: string): Promise<VehicleProfile | null> {
    const vehicle = this.byId.get(id);
    return vehicle ? cloneVehicle(vehicle) : null;
  }
}

function cloneVehicle(vehicle: VehicleProfile): VehicleProfile {
  return { ...vehicle };
}
