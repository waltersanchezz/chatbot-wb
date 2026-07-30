import { randomUUID } from 'crypto';
import type { Customer } from '../../domain/entities/Customer';
import type { CustomerRepository } from '../../domain/ports/CustomerRepository';
import type { Channel } from '../../shared/types';

/**
 * Persistencia en memoria de identidad Customer (CRM_SPEC §5.1).
 * Contrato estable: findOrCreate por teléfono canónico + save.
 */
export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly byId = new Map<string, Customer>();
  private readonly byPhone = new Map<string, string>();

  async findByPhone(phone: string): Promise<Customer | null> {
    const id = this.byPhone.get(phone);
    if (!id) return null;
    const customer = this.byId.get(id);
    return customer ? cloneCustomer(customer) : null;
  }

  async findById(id: string): Promise<Customer | null> {
    const customer = this.byId.get(id);
    return customer ? cloneCustomer(customer) : null;
  }

  async save(customer: Customer): Promise<Customer> {
    const next = cloneCustomer({ ...customer, updatedAt: new Date() });
    const previous = this.byId.get(next.id);
    if (previous && previous.phone !== next.phone) {
      this.byPhone.delete(previous.phone);
    }
    this.byId.set(next.id, next);
    this.byPhone.set(next.phone, next.id);
    return cloneCustomer(next);
  }

  async findOrCreate(
    phone: string,
    channel: Channel,
    name?: string,
  ): Promise<Customer> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      if (name && !existing.name) {
        return this.save({ ...existing, name });
      }
      return existing;
    }

    const now = new Date();
    const customer: Customer = {
      id: randomUUID(),
      phone,
      name,
      channel,
      createdAt: now,
      updatedAt: now,
    };
    return this.save(customer);
  }
}

function cloneCustomer(customer: Customer): Customer {
  return { ...customer };
}
