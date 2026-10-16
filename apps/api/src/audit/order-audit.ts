import { encodeJson } from "../prisma/json.js";
import type { Prisma } from "../generated/prisma/client.js";

type AuditWriter = {
  orderAuditEvent: {
    create(args: Prisma.OrderAuditEventCreateArgs): Promise<unknown>;
  };
};

export type OrderAuditInput = {
  orderId: string;
  eventType: string;
  actorType: "CUSTOMER" | "ADMIN" | "SYSTEM" | "PROVIDER";
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  amountPaise?: number | null;
  eventKey?: string | null;
  correlationId?: string | null;
  source?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  createdAt?: Date;
};

export async function appendOrderAudit(db: AuditWriter, input: OrderAuditInput) {
  try {
    return await db.orderAuditEvent.create({
      data: {
        orderId: input.orderId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        amountPaise: input.amountPaise ?? null,
        eventKey: input.eventKey ?? null,
        correlationId: input.correlationId ?? null,
        source: input.source ?? null,
        metadata: input.metadata == null ? undefined : encodeJson(input.metadata),
        createdAt: input.createdAt,
      },
    });
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    // Provider/webhook retries may legitimately repeat an event. A stable
    // eventKey makes the audit stream idempotent without updating old rows.
    if (input.eventKey && code === "P2002") return null;
    throw error;
  }
}

