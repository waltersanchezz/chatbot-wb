import { randomUUID } from 'crypto';
import type { Customer } from '../../domain/entities/Customer';
import type { CustomerRepository } from '../../domain/ports/CustomerRepository';
import type { Channel } from '../../shared/types';

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly byId = new Map<string, Customer>();
  private readonly byPhone = new Map<string, string>();

  async findByPhone(phone: string): Promise<Customer | null> {
    const id = this.byPhone.get(phone);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  async findById(id: string): Promise<Customer | null> {
    return this.byId.get(id) ?? null;
  }

  async save(customer: Customer): Promise<Customer> {
    const next = { ...customer, updatedAt: new Date() };
    this.byId.set(next.id, next);
    this.byPhone.set(next.phone, next.id);
    return next;
  }

  async findOrCreate(phone: string, channel: Channel, name?: string): Promise<Customer> {
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
