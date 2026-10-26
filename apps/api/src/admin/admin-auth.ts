import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  SetMetadata,
  ServiceUnavailableException,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "node:crypto";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { resolveAdminSession } from './admin-session.js';
import { isAdminRole, validateRoles, readStaffRoles, writeStaffRoles, type AdminRole } from './admin-roles.js';

export type { AdminRole } from './admin-roles.js';
export const PRIMARY_OWNER_EMAIL = "fashionshidi@gmail.com";
export type AdminPermission =
  | "support:write"
  | "support:approve"
  | "order:read"
  | "order:write"
  | "return:write"
  | "inventory:read"
  | "inventory:write"
  | "catalog:read"
  | "catalog:write"
  | "review:read"
  | "review:write"
  | "staff:manage";

export type AdminActor = {
  id: string;
  authSubject: string | null;
  email: string | null;
  displayName: string;
  role: AdminRole;
  roles?: AdminRole[];
  authMode: "SUPABASE" | "LEGACY_KEY";
};

const ADMIN_PERMISSIONS_KEY = "hidi:admin-permissions";

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  OWNER: new Set<AdminPermission>([
    "support:write",
    "support:approve",
    "order:read",
    "order:write",
    "return:write",
    "inventory:read",
    "inventory:write",
    "catalog:read",
    "catalog:write",
    "review:read",
    "review:write",
    "staff:manage",
  ]),
  OPERATIONS: new Set<AdminPermission>([
    "support:write",
    "order:read",
    "order:write",
    "return:write",
    "inventory:read",
    "inventory:write",
    "catalog:read",
    "review:read",
    "review:write",
  ]),
  SUPPORT: new Set<AdminPermission>([
    "support:write",
    "order:read",
    "inventory:read",
    "catalog:read",
    "review:read",
  ]),
  CATALOG: new Set<AdminPermission>([
    "inventory:read",
    "catalog:read",
    "catalog:write",
  ]),
};

function normalize(value?: string | null) {
  return (value ?? "").trim();
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const RequireAdminPermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);

export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ adminActor?: AdminActor }>();
  return request.adminActor;
});

@Injectable()
export class AdminAuthService {
  private readonly emailCodeCooldowns = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async requestEmailCode(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("Enter a valid admin email address");
    }
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some(key => key !== "email")) {
      throw new BadRequestException("Unsupported admin sign-in field");
    }
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Enter a valid admin email address");
    }

    // Azure SQL staff membership is authoritative. Only an active, Owner-added
    // staff account can provision its email identity during verified OTP login.
    const staff = await this.prisma.adminStaff.findFirst({ where: { email } });
    if (!staff || !staff.active || !isAdminRole(staff.role)) {
      throw new ForbiddenException("This email is not authorised for HIDI Admin");
    }

    const now = Date.now();
    for (const [key, until] of this.emailCodeCooldowns) {
      if (until <= now) this.emailCodeCooldowns.delete(key);
    }
    const until = this.emailCodeCooldowns.get(email) ?? 0;
    if (until > now) {
      throw new HttpException({
        statusCode: 429,
        message: "Please wait before requesting another admin code",
        retryAfterSeconds: Math.ceil((until - now) / 1000),
      }, 429);
    }

    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new ServiceUnavailableException("Admin code delivery is not configured");
    // Set the cooldown before awaiting delivery, including uncertain failures.
    this.emailCodeCooldowns.set(email, now + 60_000);
    try {
      const response = await fetch(`${url}/auth/v1/otp`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { apikey: key, "content-type": "application/json" },
        body: JSON.stringify({ email, create_user: true }),
      });
      if (!response.ok) throw new Error("Code delivery rejected");
    } catch {
      throw new ServiceUnavailableException("Unable to send the admin sign-in code. Please retry later.");
    }
    return { email, retryAfterSeconds: 60 };
  }

  async resolveActor(input: { authorization?: string; adminKey?: string }): Promise<AdminActor> {
    return resolveAdminSession(this.prisma, input.authorization);
  }

  async resolveVerifiedIdentity(input: { authorization?: string; adminKey?: string }): Promise<AdminActor> {
    if (input.authorization?.startsWith("Bearer ")) {
      const user = await this.supabaseAuth.requireUser(input.authorization);
      const email = user.email?.trim().toLowerCase() ?? "";
      if (!email || !user.emailVerified) {
        throw new UnauthorizedException("Admin access requires a verified email account");
      }

      const staff = await this.prisma.adminStaff.findFirst({
        where: {
          OR: [
            { authSubject: user.id },
            { email },
          ],
        },
      });

      if (!staff || !staff.active || staff.email.trim().toLowerCase() !== email) {
        throw new ForbiddenException("This account is not authorized for HIDI Admin");
      }
      if (!isAdminRole(staff.role)) {
        throw new ForbiddenException("Admin role requires configuration");
      }
      if (staff.authSubject && staff.authSubject !== user.id) {
        throw new ForbiddenException("This admin identity is already linked to another sign-in account");
      }

      const linked = staff.authSubject
        ? await this.prisma.adminStaff.update({
            where: { id: staff.id },
            data: { lastLoginAt: new Date() },
          })
        : await this.prisma.adminStaff.update({
            where: { id: staff.id },
            data: { authSubject: user.id, email, lastLoginAt: new Date() },
          });

      const roles = await readStaffRoles(this.prisma, linked.id);
      return {
        id: linked.id,
        authSubject: linked.authSubject,
        email: linked.email,
        displayName: linked.displayName,
        role: roles[0], roles,
        authMode: "SUPABASE",
      };
    }

    const supplied = normalize(input.adminKey);
    const expected = normalize(process.env.ADMIN_API_KEY);
    const legacyEnabled = process.env.ADMIN_LEGACY_KEY_ENABLED === "true";

    if (legacyEnabled && supplied && expected && safeEqual(supplied, expected)) {
      return {
        id: "legacy-admin",
        authSubject: null,
        email: null,
        displayName: "Legacy admin",
        role: "OWNER",
        authMode: "LEGACY_KEY",
      };
    }

    throw new UnauthorizedException("Admin access required");
  }

  async listStaff() {
    const staff = await this.prisma.adminStaff.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        active: true,
        authSubject: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return Promise.all(staff.map(async member => ({...member,roles:await readStaffRoles(this.prisma,member.id)})));
  }

  async createStaff(input: { email?: unknown; displayName?: unknown; role?: unknown; roles?: unknown }) {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
    if (input.role !== undefined && input.roles !== undefined) throw new BadRequestException('Send roles or a single role, not both');
    const roles = validateRoles(input.roles ?? [typeof input.role === 'string' ? input.role.trim().toUpperCase() : '']);
    const role = roles[0];

    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException("Enter a valid admin email");
    if (displayName.length < 2 || displayName.length > 120) throw new BadRequestException("Enter a valid admin display name");
    if (!isAdminRole(role)) throw new BadRequestException("Choose a valid admin role");

    try {
      return await this.prisma.$transaction(async tx => {
      const staff = await tx.adminStaff.create({
        data: { email, displayName, role, active: true },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          active: true,
          authSubject: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await writeStaffRoles(tx,staff.id,roles);
      return {...staff,roles};
      });
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
      if (code === "P2002") throw new ConflictException("An admin account already exists for this email");
      throw error;
    }
  }

  async updateStaff(
    staffId: string,
    input: { displayName?: unknown; role?: unknown; roles?: unknown; active?: unknown },
    actor: AdminActor,
  ) {
    return this.prisma.$transaction(async tx => {
    // Serialize edits to one member so changes cannot mix role sets.
    await tx.$queryRaw`SELECT [id] FROM [dbo].[AdminStaff] WITH (UPDLOCK,HOLDLOCK) WHERE [id]=${staffId}`;
    const current = await tx.adminStaff.findUnique({ where: { id: staffId } });
    if (!current) throw new BadRequestException("Admin staff account not found");

    const nextDisplayName = input.displayName === undefined
      ? current.displayName
      : typeof input.displayName === "string"
        ? input.displayName.trim()
        : "";
    const currentRoles = await readStaffRoles(tx,current.id);
    if (input.role !== undefined && input.roles !== undefined) throw new BadRequestException('Send roles or a single role, not both');
    const nextRoles = input.roles !== undefined ? validateRoles(input.roles) : input.role !== undefined
      ? validateRoles([typeof input.role === 'string' ? input.role.trim().toUpperCase() : '']) : currentRoles;
    const nextRole = nextRoles[0];
    const nextActive = input.active === undefined ? current.active : input.active === true;

    if (nextDisplayName.length < 2 || nextDisplayName.length > 120) {
      throw new BadRequestException("Enter a valid admin display name");
    }
    if (!isAdminRole(nextRole)) throw new BadRequestException("Choose a valid admin role");

    if (current.email.trim().toLowerCase() === PRIMARY_OWNER_EMAIL && (!nextActive || nextRole !== "OWNER")) {
      throw new ConflictException("The primary HIDI Owner cannot be disabled or demoted");
    }

    if (actor.id === current.id && (!nextActive || JSON.stringify(nextRoles) !== JSON.stringify(currentRoles))) {
      throw new ConflictException("You cannot deactivate or change your own admin role");
    }

    if (current.role === "OWNER" && current.active && (!nextActive || nextRole !== "OWNER")) {
      const activeOwners = await tx.adminStaff.count({ where: { role: "OWNER", active: true } });
      if (activeOwners <= 1) throw new ConflictException("HIDI must keep at least one active owner");
    }

    const member = await tx.adminStaff.update({
      where: { id: current.id },
      data: {
        displayName: nextDisplayName,
        role: nextRole,
        active: nextActive,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        active: true,
        authSubject: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await writeStaffRoles(tx,current.id,nextRoles);
    return {...member,roles:nextRoles};
    },{isolationLevel:'Serializable'});
  }

  hasPermission(actor: AdminActor, permission: AdminPermission) {
    return (actor.roles ?? [actor.role]).some(role => ROLE_PERMISSIONS[role]?.has(permission));
  }

  permissions(actor: AdminActor) { return [...new Set((actor.roles ?? [actor.role]).flatMap(role => [...ROLE_PERMISSIONS[role]]))]; }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      adminActor?: AdminActor;
    }>();

    const authorizationHeader = request.headers.authorization;
    const adminKeyHeader = request.headers["x-admin-key"];
    const authorization = typeof authorizationHeader === "string" ? authorizationHeader : undefined;
    const adminKey = typeof adminKeyHeader === "string" ? adminKeyHeader : undefined;

    const actor = await this.auth.resolveActor({ authorization, adminKey });
    const permissions =
      this.reflector.getAllAndOverride<AdminPermission[]>(ADMIN_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    for (const permission of permissions) {
      if (!this.auth.hasPermission(actor, permission)) {
        throw new ForbiddenException(`Admin role ${actor.role} cannot perform ${permission}`);
      }
    }

    request.adminActor = actor;
    return true;
  }
}
