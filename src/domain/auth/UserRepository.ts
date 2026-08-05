import type { UserRecord, UserRole } from './userDto';

export interface CreateUserInput {
  id?: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  active?: boolean;
}

export interface UserRepository {
  findByEmail(email: string): UserRecord | null;
  findById(id: string): UserRecord | null;
  create(input: CreateUserInput): UserRecord;
  ensureSeedAdmin(input: {
    tenantId: string;
    email: string;
    name: string;
    passwordHash: string;
  }): UserRecord;
}
