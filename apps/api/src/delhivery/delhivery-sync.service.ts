import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { appendOrderAudit } from "../audit/order-audit.js";
import { DelhiveryService } from "./delhivery.service.js";
import { deliveryEvidence, type DeliveryEvidence } from "./tracking-evidence.js";

export const TRACKING_INTERVAL_HOURS = 6;
export const COD_AMOUNT_TOLERANCE_PAISE = 100;
const BATCH_SIZE = 25;
type Candidate = { id: string; orderId: string; awb: string };

@Injectable()
export class DelhiverySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DelhiverySyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private initial?: ReturnType<typeof setTimeout>;
  private running = false;
  private stopped = false;
  constructor(private readonly prisma: PrismaService, private readonly delhivery: DelhiveryService) {}

  enabled() {
    return process.env.DELHIVERY_SYNC_ENABLED === "true" && this.delhivery.trackingConfigured();
  }

  onModuleInit() {
    if (!this.enabled()) return;
    // This minute timer only drains due DB work. Each AWB is checked once per SIX HOURS.
    // The durable reservation survives API restarts and is shared by all replicas.
    this.initial = setTimeout(() => void this.runOnce(), 15_000);
    this.initial.unref();
    this.timer = setInterval(() => void this.runOnce(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.initial) clearTimeout(this.initial);
    if (this.timer) clearInterval(this.timer);
  }

  async candidates(): Promise<Candidate[]> {
    return this.prisma.$queryRaw<Candidate[]>`
      SELECT TOP (${BATCH_SIZE}) s.[id], s.[orderId], s.[awb]
      FROM [dbo].[Shipment] s JOIN [dbo].[Order] o ON o.[id]=s.[orderId]
      LEFT JOIN [dbo].[BackgroundLease] l ON l.[id]=CONCAT('tracking:',s.[id])
      WHERE UPPER(LTRIM(RTRIM(s.[provider])))='DELHIVERY' AND s.[awb] IS NOT NULL AND s.[awb]<>''
        AND (o.[status]='SHIPPED' OR (o.[status]='DELIVERED' AND EXISTS (
          SELECT 1 FROM [dbo].[Payment] p WHERE p.[orderId]=o.[id] AND p.[provider]='COD' AND p.[status]='CREATED')))
        AND s.[status] IN ('SHIPPED','DELIVERED')
        AND NOT EXISTS (SELECT 1 FROM [dbo].[Shipment] newer WHERE newer.[orderId]=s.[orderId]
          AND (newer.[createdAt]>s.[createdAt] OR (newer.[createdAt]=s.[createdAt] AND newer.[id]>s.[id])))
        AND (l.[expiresAt] IS NULL OR l.[expiresAt]<=SYSUTCDATETIME())
      ORDER BY l.[expiresAt], s.[id]`;
  }

  async claim(shipmentId: string) {
    const id = `tracking:${shipmentId}`;
    const owner = randomUUID();
    return this.prisma.$transaction(async tx => {
      // Range lock covers the initial insert too: two replicas cannot both claim an AWB.
      await tx.$executeRaw`
        IF NOT EXISTS (SELECT 1 FROM [dbo].[BackgroundLease] WITH (UPDLOCK,HOLDLOCK) WHERE [id]=${id})
        INSERT INTO [dbo].[BackgroundLease] ([id],[owner],[expiresAt]) VALUES (${id},NULL,'2000-01-01T00:00:00')`;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE [dbo].[BackgroundLease] WITH (UPDLOCK,ROWLOCK)
        SET [owner]=${owner}, [expiresAt]=DATEADD(HOUR,${TRACKING_INTERVAL_HOURS},SYSUTCDATETIME())
        OUTPUT INSERTED.[id] WHERE [id]=${id} AND [expiresAt]<=SYSUTCDATETIME()`;
      return rows.length === 1;
    });
  }

  async runOnce() {
    if (this.running || this.stopped || !this.enabled()) return { skipped: true };
    this.running = true;
    const result = { checked: 0, delivered: 0, collected: 0, review: 0, failed: 0 };
    try {
      for (const candidate of await this.candidates()) {
        if (this.stopped || !this.enabled()) break;
        try {
          if (!await this.claim(candidate.id)) continue;
          const tracking = await this.delhivery.track(candidate.awb);
          result.checked++;
          const evidence = deliveryEvidence(tracking.raw, candidate.awb);
          if (!evidence || this.stopped || !this.enabled()) continue;
          const delivery = await this.applyDelivery(candidate, evidence);
          if (!delivery.eligible) continue;
          if (delivery.changed) result.delivered++;
          // Separate transaction: delivery remains recorded even if COD reconciliation fails.
          const payment = await this.reconcileCod(candidate, evidence);
          if (payment === "collected") result.collected++;
          if (payment === "review") result.review++;
        } catch {
          result.failed++;
          // Never log raw tracking responses, customer data, or API tokens.
        }
      }
      if (result.checked || result.failed) this.logger.log(`Delhivery six-hour reconciliation: ${JSON.stringify(result)}`);
      return result;
    } catch {
      this.logger.warn("Delhivery reconciliation could not read the queue; retrying on the next worker tick");
      return { ...result, failed: result.failed + 1 };
    } finally { this.running = false; }
  }

  private async lockedOrder(tx: Prisma.TransactionClient, candidate: Candidate, evidence: DeliveryEvidence) {
    await tx.$queryRaw`SELECT [id] FROM [dbo].[Order] WITH (UPDLOCK,HOLDLOCK,ROWLOCK) WHERE [id]=${candidate.orderId}`;
    const order = await tx.order.findUnique({ where: { id: candidate.orderId }, include: {
      shipments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }, payments: true,
    } });
    const shipment = order?.shipments[0];
    if (!order || !shipment || shipment.id !== candidate.id || shipment.awb !== evidence.awb
      || shipment.provider?.trim().toUpperCase() !== "DELHIVERY"
      || !["SHIPPED", "DELIVERED"].includes(shipment.status)
      || !["SHIPPED", "DELIVERED"].includes(order.status)
      || evidence.deliveredAt < order.createdAt
      || (shipment.shippedAt && evidence.deliveredAt < shipment.shippedAt)) return null;
    return order;
  }

  async applyDelivery(candidate: Candidate, evidence: DeliveryEvidence) {
    return this.prisma.$transaction(async tx => {
      const order = await this.lockedOrder(tx, candidate, evidence);
      if (!order) return { eligible: false, changed: false };
      if (order.status === "DELIVERED") return { eligible: true, changed: false };
      await tx.shipment.update({ where: { id: candidate.id }, data: { status: "DELIVERED", deliveredAt: evidence.deliveredAt } });
      await tx.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
      await appendOrderAudit(tx, { orderId: order.id, eventType: "ORDER_DELIVERED", actorType: "PROVIDER",
        actorId: "DELHIVERY", entityType: "ORDER", entityId: order.id, fromStatus: "SHIPPED", toStatus: "DELIVERED",
        eventKey: `order:${order.id}:status:DELIVERED`, source: "DELHIVERY_TRACKING_SYNC",
        metadata: { shipmentId: candidate.id, awb: evidence.awb, deliveredAt: evidence.deliveredAt.toISOString() } });
      return { eligible: true, changed: true };
    });
  }

  async reconcileCod(candidate: Candidate, evidence: DeliveryEvidence) {
    return this.prisma.$transaction(async tx => {
      const order = await this.lockedOrder(tx, candidate, evidence);
      if (!order || order.status !== "DELIVERED") return "skipped";
      const pending = order.payments.filter(payment => payment.provider === "COD" && payment.status === "CREATED");
      if (!pending.length) return "skipped";
      const payment = pending[0];
      const reportedAmountPaise = evidence.codAmountPaise;
      const differencePaise = reportedAmountPaise === null ? null : reportedAmountPaise - payment.amountPaise;
      const matches = pending.length === 1 && order.currency === "INR" && payment.amountPaise > 0
        && !order.payments.some(p => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status))
        && evidence.orderType === "COD" && reportedAmountPaise !== null
        && Number.isSafeInteger(reportedAmountPaise) && reportedAmountPaise > 0
        && differencePaise !== null && Math.abs(differencePaise) <= COD_AMOUNT_TOLERANCE_PAISE;
      if (!matches) {
        const eventKey = `cod-review:${payment.id}:${candidate.id}`;
        const recorded = await tx.orderAuditEvent.findUnique({ where: { eventKey }, select: { id: true } });
        if (!recorded) await appendOrderAudit(tx, { orderId: order.id, eventType: "COD_COLLECTION_REVIEW_REQUIRED", actorType: "SYSTEM",
          entityType: "PAYMENT", entityId: payment.id, amountPaise: payment.amountPaise,
          eventKey, source: "DELHIVERY_TRACKING_SYNC",
          metadata: { reason: "COD_DETAILS_MISSING_OR_MISMATCHED", awb: evidence.awb,
            reportedAmountPaise: evidence.codAmountPaise } });
        return "review";
      }
      // Delhivery confirms collection on delivery of a COD shipment. This is customer
      // collection, NOT a bank settlement or remittance confirmation.
      const changed = await tx.payment.updateMany({ where: { id: payment.id, status: "CREATED" }, data: { status: "CAPTURED" } });
      if (!changed.count) return "skipped";
      await appendOrderAudit(tx, { orderId: order.id, eventType: "PAYMENT_CAPTURED", actorType: "PROVIDER", actorId: "DELHIVERY",
        entityType: "PAYMENT", entityId: payment.id, fromStatus: "CREATED", toStatus: "CAPTURED", amountPaise: payment.amountPaise,
        eventKey: `cod-payment:${payment.id}:collected`, source: "DELHIVERY_TRACKING_SYNC",
        metadata: { provider: "COD", awb: evidence.awb, collectionConfirmed: true,
          evidence: differencePaise === 0 ? "DELIVERED_COD_AMOUNT_MATCH" : "DELIVERED_COD_AMOUNT_WITHIN_TOLERANCE",
          expectedAmountPaise: payment.amountPaise, reportedAmountPaise, differencePaise,
          tolerancePaise: COD_AMOUNT_TOLERANCE_PAISE,
          collectedAt: evidence.deliveredAt.toISOString(), bankRemittanceConfirmed: false } });
      return "collected";
    });
  }
}
