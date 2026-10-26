import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

export const ADMIN_ROLES = ['OWNER','OPERATIONS','SUPPORT','CATALOG'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];
export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}
export function validateRoles(value: unknown): AdminRole[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3 || value.some(role => !isAdminRole(role)) || new Set(value).size !== value.length)
    throw new BadRequestException('Choose between one and three different admin roles');
  return ADMIN_ROLES.filter(role => value.includes(role));
}
export function storedRoles(role: unknown, json?: string | null): AdminRole[] {
  try {
    if (!isAdminRole(role)) throw new Error('Invalid role');
    const roles = json == null ? [role] : validateRoles(JSON.parse(json));
    if (roles[0] !== role) throw new Error('Inconsistent primary role');
    return roles;
  } catch { throw new UnauthorizedException('Admin roles require configuration'); }
}
type RoleDatabase = Pick<PrismaService,'$queryRaw'|'$executeRaw'>;
export async function readStaffRoles(db: RoleDatabase, staffId: string) {
  const rows = await db.$queryRaw<{role:string;rolesJson:string|null}[]>`SELECT [role],[rolesJson] FROM [dbo].[AdminStaff] WHERE [id]=${staffId}`;
  if (!rows[0]) throw new UnauthorizedException('Admin staff account no longer exists');
  return storedRoles(rows[0].role, rows[0].rolesJson);
}
export async function writeStaffRoles(db: RoleDatabase, staffId: string, roles: AdminRole[]) {
  const json = JSON.stringify(roles);
  const changed = await db.$executeRaw`UPDATE [dbo].[AdminStaff] SET [rolesJson]=${json} WHERE [id]=${staffId}`;
  if (changed !== 1) throw new Error('Admin role update did not match one staff account');
}
