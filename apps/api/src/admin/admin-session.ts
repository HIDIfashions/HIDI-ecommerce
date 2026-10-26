import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AdminActor, AdminAuthService } from './admin-auth.js';
import { storedRoles } from './admin-roles.js';

export const ADMIN_IDLE_MS = 60 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const expired = () => new UnauthorizedException('Admin session expired. Enter a new email OTP to sign in.');
function tokenFrom(authorization?: string) {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!/^hidi_admin_[a-f0-9]{64}$/.test(token)) throw expired();
  return token;
}

export async function resolveAdminSession(db: PrismaService, authorization?: string, activity = false): Promise<AdminActor> {
  const digest = hash(tokenFrom(authorization));
  // SQL's clock and a conditional update enforce expiry across replicas and
  // races. Background reads/refreshes never extend lastActivityAt.
  if (activity) {
    const changed = await db.$executeRaw`UPDATE [dbo].[AdminLoginSession] SET [lastActivityAt] = SYSUTCDATETIME()
      WHERE [tokenHash] = ${digest} AND [revokedAt] IS NULL
      AND [lastActivityAt] > DATEADD(hour,-1,SYSUTCDATETIME())`;
    if (changed !== 1) throw expired();
  }
  const rows = await db.$queryRaw<(AdminActor & { active: boolean; rolesJson: string | null })[]>`SELECT s.[id], s.[authSubject], s.[email], s.[displayName], s.[role], s.[rolesJson], s.[active]
    FROM [dbo].[AdminLoginSession] a JOIN [dbo].[AdminStaff] s ON s.[id] = a.[staffId]
    WHERE a.[tokenHash] = ${digest} AND a.[revokedAt] IS NULL
      AND a.[lastActivityAt] > DATEADD(hour,-1,SYSUTCDATETIME())`;
  const staff = rows[0];
  if (!staff?.active || !['OWNER','OPERATIONS','SUPPORT','CATALOG'].includes(staff.role)) throw expired();
  return {id:staff.id, authSubject:staff.authSubject, email:staff.email, displayName:staff.displayName, role:staff.role, roles:storedRoles(staff.role,staff.rolesJson), authMode:'SUPABASE'};
}

export async function verifyAdminCode(db: PrismaService, auth: AdminAuthService, value: unknown) {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (Object.keys(body).some(key => !['email','token'].includes(key)) || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !/^\d{8}$/.test(token)) {
    throw new BadRequestException('Enter your admin email and 8-digit OTP');
  }
  const staff = await db.adminStaff.findFirst({where:{email,active:true}});
  if (!staff) throw new ForbiddenException('This email is not authorised for HIDI Admin');
  const url = process.env.SUPABASE_URL?.replace(/\/$/,'');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new UnauthorizedException('Admin OTP is not configured');
  const response = await fetch(`${url}/auth/v1/verify`, {method:'POST', headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({type:'email',email,token}), redirect:'error', signal:AbortSignal.timeout(15000)});
  const verified = await response.json() as {access_token?:string};
  if (!response.ok || typeof verified.access_token !== 'string') throw new UnauthorizedException('That OTP is invalid or expired');
  // Only a successful server-to-server OTP exchange can reach this method.
  const actor = await auth.resolveVerifiedIdentity({authorization:`Bearer ${verified.access_token}`});
  if (actor.email?.trim().toLowerCase() !== email) throw new UnauthorizedException('OTP identity mismatch');
  const sessionToken = 'hidi_admin_' + randomBytes(32).toString('hex');
  const digest = hash(sessionToken);
  await db.$executeRaw`INSERT INTO [dbo].[AdminLoginSession] ([tokenHash],[staffId],[createdAt],[lastActivityAt])
    VALUES (${digest},${actor.id},SYSUTCDATETIME(),SYSUTCDATETIME())`;
  // The provider access/refresh tokens never leave this server or become admin credentials.
  return {admin:actor,sessionToken,idleTimeoutSeconds:3600};
}

export async function revokeAdminSession(db: PrismaService, authorization?: string) {
  let token: string; try {token = tokenFrom(authorization);} catch {return {ok:true};}
  const digest = hash(token);
  await db.$executeRaw`UPDATE [dbo].[AdminLoginSession] SET [revokedAt] = SYSUTCDATETIME() WHERE [tokenHash] = ${digest} AND [revokedAt] IS NULL`;
  return {ok:true};
}
