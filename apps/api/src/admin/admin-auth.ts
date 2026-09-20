import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "node:crypto";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type AdminRole = "OWNER" | "OPERATIONS" | "SUPPORT" | "CATALOG";
export type AdminPermission =
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
  authMode: "SUPABASE" | "LEGACY_KEY";
};

const ADMIN_PERMISSIONS_KEY = "hidi:admin-permissions";

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  OWNER: new Set<AdminPermission>([
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

function isAdminRole(value: string): value is AdminRole {
  return value === "OWNER" || value === "OPERATIONS" || value === "SUPPORT" || value === "CATALOG";
}

export const RequireAdminPermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);

export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ adminActor?: AdminActor }>();
  return request.adminActor;
});

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async resolveActor(input: { authorization?: string; adminKey?: string }): Promise<AdminActor> {
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

      if (!staff || !staff.active) {
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

      return {
        id: linked.id,
        authSubject: linked.authSubject,
        email: linked.email,
        displayName: linked.displayName,
        role: linked.role as AdminRole,
        authMode: "SUPABASE",
      };
    }

    const supplied = normalize(input.adminKey);
    const expected = normalize(process.env.ADMIN_API_KEY);
    const legacyEnabled =
      process.env.ADMIN_LEGACY_KEY_ENABLED === "true" ||
      process.env.NODE_ENV !== "production";

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
    return this.prisma.adminStaff.findMany({
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
  }

  async createStaff(input: { email?: unknown; displayName?: unknown; role?: unknown }) {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
    const role = typeof input.role === "string" ? input.role.trim().toUpperCase() : "";

    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException("Enter a valid admin email");
    if (displayName.length < 2 || displayName.length > 120) throw new BadRequestException("Enter a valid admin display name");
    if (!isAdminRole(role)) throw new BadRequestException("Choose a valid admin role");

    try {
      return await this.prisma.adminStaff.create({
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
    input: { displayName?: unknown; role?: unknown; active?: unknown },
    actor: AdminActor,
  ) {
    const current = await this.prisma.adminStaff.findUnique({ where: { id: staffId } });
    if (!current) throw new BadRequestException("Admin staff account not found");

    const nextDisplayName = input.displayName === undefined
      ? current.displayName
      : typeof input.displayName === "string"
        ? input.displayName.trim()
        : "";
    const nextRole = input.role === undefined
      ? current.role
      : typeof input.role === "string"
        ? input.role.trim().toUpperCase()
        : "";
    const nextActive = input.active === undefined ? current.active : input.active === true;

    if (nextDisplayName.length < 2 || nextDisplayName.length > 120) {
      throw new BadRequestException("Enter a valid admin display name");
    }
    if (!isAdminRole(nextRole)) throw new BadRequestException("Choose a valid admin role");

    if (actor.id === current.id && (!nextActive || nextRole !== current.role)) {
      throw new ConflictException("You cannot deactivate or change your own admin role");
    }

    if (current.role === "OWNER" && current.active && (!nextActive || nextRole !== "OWNER")) {
      const activeOwners = await this.prisma.adminStaff.count({ where: { role: "OWNER", active: true } });
      if (activeOwners <= 1) throw new ConflictException("HIDI must keep at least one active owner");
    }

    return this.prisma.adminStaff.update({
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
  }

  hasPermission(actor: AdminActor, permission: AdminPermission) {
    return ROLE_PERMISSIONS[actor.role].has(permission);
  }
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
