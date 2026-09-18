import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

@Injectable()
export class AdminProductsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const value = request.headers["x-admin-key"];
    const supplied = typeof value === "string" ? value.trim() : "";
    const expected = (process.env.ADMIN_API_KEY ?? "").trim();
    const left = Buffer.from(supplied); const right = Buffer.from(expected);
    if (!expected || !supplied || left.length !== right.length || !timingSafeEqual(left, right)) throw new UnauthorizedException("Admin access required.");
    return true;
  }
}
