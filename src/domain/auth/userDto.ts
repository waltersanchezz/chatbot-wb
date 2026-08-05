/**
 * Usuarios SaaS (Sprint 10).
 */

export type UserRole = 'ADMIN' | 'ASESOR' | 'LECTURA';

export interface UserDto {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface UserRecord extends UserDto {
  passwordHash: string;
}

export interface AuthUserView {
  userId: string;
  tenantId: string;
  role: UserRole;
  name: string;
  email: string;
}

export interface LoginResultDto {
  token: string;
  user: AuthUserView;
}

export const USER_ROLES: UserRole[] = ['ADMIN', 'ASESOR', 'LECTURA'];
