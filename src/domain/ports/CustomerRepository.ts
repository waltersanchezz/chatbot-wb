import type { Customer } from '../entities/Customer';
import type { Channel } from '../../shared/types';

export interface CustomerRepository {
  findByPhone(phone: string): Promise<Customer | null>;
  findById(id: string): Promise<Customer | null>;
  save(customer: Customer): Promise<Customer>;
  findOrCreate(phone: string, channel: Channel, name?: string): Promise<Customer>;
}
