import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { decodeJson, encodeJson } from "../prisma/json.js";
import type { AdminActor } from "./admin-auth.js";

const WRITERS = new Set(["OWNER", "OPERATIONS", "SUPPORT"]);
const APPROVAL_TYPES = new Set(["REFUND", "CANCELLATION", "COMPENSATION", "ORDER_CHANGE"]);
const FOLLOW_UP_STATUSES = new Set(["OPEN", "IN_PROGRESS", "DONE"]);

function text(value: unknown, max: number, name: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${name} must contain 1–${max} characters`);
  }
  return value.trim();
}

@Injectable()
export class AdminSupportService {
  constructor(private readonly prisma: PrismaService) {}

  async queue() {
    const rows = await this.prisma.orderAuditEvent.findMany({
      where: { entityType: "SUPPORT", eventType: { in: ["SUPPORT_FOLLOW_UP", "SUPPORT_APPROVAL_REQUEST", "SUPPORT_APPROVAL_DECISION"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { order: { select: { orderNumber: true } } },
    });
    const decided = new Set(rows.filter(row => row.eventType === "SUPPORT_APPROVAL_DECISION").map(row => row.entityId));
    const followUps = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (row.eventType === "SUPPORT_FOLLOW_UP") followUps.set(row.orderId, row);
    const visible = rows.filter(row => row.eventType === "SUPPORT_APPROVAL_REQUEST" && !decided.has(row.id));
    for (const row of followUps.values()) if (decodeJson(row.metadata)?.status !== "DONE") visible.push(row);
    return { items: visible.map(row => ({ id: row.id, orderNumber: row.order.orderNumber, kind: row.eventType.replace("SUPPORT_", ""), createdAt: row.createdAt, ...decodeJson(row.metadata) })) };
  }

  private async order(orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, select: { id: true } });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  async list(orderNumber: string) {
    const order = await this.order(orderNumber);
    const rows = await this.prisma.orderAuditEvent.findMany({
      where: { orderId: order.id, entityType: "SUPPORT" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { events: rows.map(row => ({
      id: row.id, kind: row.eventType.replace("SUPPORT_", ""), actorId: row.actorId,
      createdAt: row.createdAt, requestId: row.entityId, ...decodeJson(row.metadata),
    })) };
  }

  async create(orderNumber: string, body: Record<string, unknown>, actor: AdminActor) {
    if (!WRITERS.has(actor.role)) throw new ForbiddenException("Support access required");
    const kind = body.kind;
    let metadata: Record<string, unknown>;
    if (kind === "NOTE") {
      metadata = { text: text(body.text, 2000, "Note") };
    } else if (kind === "TAGS") {
      if (!Array.isArray(body.tags) || body.tags.length > 10) throw new BadRequestException("Provide up to 10 tags");
      metadata = { tags: [...new Set(body.tags.map(tag => text(tag, 40, "Tag").toLowerCase()))] };
    } else if (kind === "FOLLOW_UP") {
      if (typeof body.status !== "string" || !FOLLOW_UP_STATUSES.has(body.status)) throw new BadRequestException("Invalid follow-up status");
      const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
      if (body.status !== "DONE" && (!dueAt || !Number.isFinite(dueAt.getTime()))) throw new BadRequestException("A valid follow-up date is required");
      metadata = { status: body.status, dueAt: dueAt && Number.isFinite(dueAt.getTime()) ? dueAt.toISOString() : null, text: text(body.text, 2000, "Follow-up details") };
    } else if (kind === "APPROVAL_REQUEST") {
      if (typeof body.type !== "string" || !APPROVAL_TYPES.has(body.type)) throw new BadRequestException("Invalid approval type");
      if (body.amountPaise !== undefined && (!Number.isSafeInteger(body.amountPaise) || Number(body.amountPaise) <= 0 || Number(body.amountPaise) > 2147483647)) throw new BadRequestException("Amount must be a positive integer in paise");
      metadata = { type: body.type, text: text(body.text, 2000, "Requested action and reason"), amountPaise: body.amountPaise ?? null };
    } else {
      throw new BadRequestException("Invalid support action");
    }
    const order = await this.order(orderNumber);
    const event = await this.prisma.orderAuditEvent.create({ data: {
      orderId: order.id, eventType: `SUPPORT_${kind}`, entityType: "SUPPORT", actorType: "ADMIN",
      actorId: actor.id, source: "ADMIN_PORTAL", metadata: encodeJson({ ...metadata, actorName: actor.displayName }),
    } });
    return { id: event.id };
  }

  async decide(orderNumber: string, requestId: string, body: Record<string, unknown>, actor: AdminActor) {
    if (actor.role !== "OWNER") throw new ForbiddenException("Only an Owner can approve or reject requests");
    if (body.decision !== "APPROVED" && body.decision !== "REJECTED") throw new BadRequestException("Invalid decision");
    const reason = text(body.text, 2000, "Decision reason");
    const order = await this.order(orderNumber);
    const request = await this.prisma.orderAuditEvent.findFirst({ where: {
      id: requestId, orderId: order.id, eventType: "SUPPORT_APPROVAL_REQUEST", entityType: "SUPPORT",
    } });
    if (!request) throw new NotFoundException("Approval request not found for this order");
    // The existing unique eventKey prevents two concurrent decisions. Never
    // swallow the uniqueness error: the second reviewer must see a conflict.
    try {
      await this.prisma.orderAuditEvent.create({ data: {
        orderId: order.id, eventType: "SUPPORT_APPROVAL_DECISION", entityType: "SUPPORT", entityId: requestId,
        actorType: "ADMIN", actorId: actor.id, eventKey: `support-decision:${requestId}`, source: "ADMIN_PORTAL",
        metadata: encodeJson({ decision: body.decision, text: reason, actorName: actor.displayName }),
      } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("This request already has an Owner decision");
      throw error;
    }
    return { decision: body.decision };
  }
}
