import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { recipient, type NotificationChannel, type NotificationOrder } from "./order-message.js";
import { RETENTION_CONSENT_VERSION } from "../retention/retention-policy.js";
export type NotificationJob = {
  id: string; orderId: string; channel: NotificationChannel; provider: string | null;
  payload: string | null; attempts: number; firstAttemptAt: Date | null; leaseOwner: string;
};
@Injectable()
export class OrderNotificationStore {
  constructor(private readonly prisma: PrismaService) {}
  async enqueue(channel: NotificationChannel, startAt: Date) {
    // Only committed confirmation events backed by captured payment. The unique index
    // and serializable range lock also cover callback/webhook and replica races.
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO [dbo].[OrderNotificationOutbox] ([id],[orderId],[channel])
        SELECT CONVERT(NVARCHAR(64), NEWID()), eligible.[id], ${channel}
        FROM (SELECT TOP (50) o.[id], MIN(a.[createdAt]) AS confirmedAt
          FROM [dbo].[Order] o JOIN [dbo].[OrderAuditEvent] a ON a.[orderId]=o.[id]
          WHERE a.[eventType]='ORDER_CONFIRMED' AND a.[toStatus]='CONFIRMED' AND a.[createdAt]>=${startAt}
            AND o.[status] IN ('CONFIRMED','PACKED','SHIPPED','DELIVERED')
            AND (${channel}='EMAIL' OR EXISTS (SELECT 1 FROM [dbo].[RetentionProfile] consent WHERE consent.[userId]=o.[userId]
              AND consent.[whatsappOptIn]=1 AND consent.[phoneVerifiedAt] IS NOT NULL
              AND consent.[consentVersion]=${RETENTION_CONSENT_VERSION}))
            AND EXISTS (SELECT 1 FROM [dbo].[Payment] p WHERE p.[orderId]=o.[id] AND p.[status]='CAPTURED')
            AND NOT EXISTS (SELECT 1 FROM [dbo].[OrderNotificationOutbox] n WITH (UPDLOCK,HOLDLOCK)
              WHERE n.[orderId]=o.[id] AND n.[channel]=${channel})
          GROUP BY o.[id] ORDER BY MIN(a.[createdAt]), o.[id]) eligible`;
    }, { isolationLevel: "Serializable", timeout: 15000 });
  }
  async recover() {
    // A crashed process before submission is safe to resume. After submission,
    // only Resend has a documented idempotency window (conservatively 23 hours).
    await this.prisma.$executeRaw`
      UPDATE [dbo].[OrderNotificationOutbox] SET
        [status]=CASE WHEN [status]='PROCESSING' THEN 'RETRY'
          WHEN [provider]='RESEND' AND [firstAttemptAt]>DATEADD(HOUR,-23,SYSUTCDATETIME()) THEN 'RETRY' ELSE 'UNKNOWN' END,
        [lastError]='WORKER_LEASE_EXPIRED', [leaseOwner]=NULL, [leaseUntil]=NULL,
        [dueAt]=SYSUTCDATETIME(), [updatedAt]=SYSUTCDATETIME()
      WHERE [status] IN ('PROCESSING','SENDING') AND [leaseUntil]<SYSUTCDATETIME()`;
  }
  async claim(owner: string): Promise<NotificationJob | null> {
    const rows = await this.prisma.$transaction(tx => tx.$queryRaw<NotificationJob[]>`
      ;WITH nextJob AS (SELECT TOP (1) * FROM [dbo].[OrderNotificationOutbox] WITH (UPDLOCK,READPAST,READCOMMITTEDLOCK)
        WHERE [status] IN ('PENDING','RETRY','WAITING_CONFIG') AND [dueAt]<=SYSUTCDATETIME()
        ORDER BY [dueAt],[id])
      UPDATE nextJob SET [status]='PROCESSING', [leaseOwner]=${owner},
        [leaseUntil]=DATEADD(MINUTE,2,SYSUTCDATETIME()), [updatedAt]=SYSUTCDATETIME()
      OUTPUT INSERTED.[id], INSERTED.[orderId], INSERTED.[channel], INSERTED.[provider],
        INSERTED.[payload], INSERTED.[attempts], INSERTED.[firstAttemptAt], INSERTED.[leaseOwner]`,
      { isolationLevel: "ReadCommitted", timeout: 15000 });
    return rows[0] ?? null;
  }
  async order(id: string): Promise<NotificationOrder | null> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: {
      items: true, user: { select: { retentionProfile: { select: {
        whatsappOptIn: true, verifiedPhone: true, phoneVerifiedAt: true, consentVersion: true,
      } } } },
    } });
    if (!order) return null;
    const consent = order.user?.retentionProfile;
    const to = recipient(order, "WHATSAPP");
    return { ...order, whatsappOptIn: Boolean(consent?.whatsappOptIn && consent.phoneVerifiedAt
      && consent.consentVersion === RETENTION_CONSENT_VERSION && to
      && consent.verifiedPhone?.replace(/\D/g, "") === to) };
  }
  async beginSend(job: NotificationJob, provider: string, payload: string): Promise<boolean> {
    const changed = await this.prisma.$executeRaw`
      UPDATE [dbo].[OrderNotificationOutbox] SET [status]='SENDING', [provider]=${provider}, [payload]=${payload},
        [attempts]=[attempts]+1, [firstAttemptAt]=COALESCE([firstAttemptAt],SYSUTCDATETIME()),
        [leaseUntil]=DATEADD(MINUTE,2,SYSUTCDATETIME()), [updatedAt]=SYSUTCDATETIME()
      WHERE [id]=${job.id} AND [leaseOwner]=${job.leaseOwner} AND [status]='PROCESSING' AND [leaseUntil]>SYSUTCDATETIME()`;
    return changed === 1;
  }
  async finish(job: NotificationJob, status: string, error: string | null, messageId: string | null = null, delaySeconds = 0) {
    await this.prisma.$executeRaw`
      UPDATE [dbo].[OrderNotificationOutbox] SET [status]=${status}, [lastError]=${error},
        [providerMessageId]=${messageId}, [sentAt]=CASE WHEN ${status}='SENT' THEN SYSUTCDATETIME() ELSE [sentAt] END,
        [dueAt]=DATEADD(SECOND,${delaySeconds},SYSUTCDATETIME()), [leaseOwner]=NULL, [leaseUntil]=NULL, [updatedAt]=SYSUTCDATETIME()
      WHERE [id]=${job.id} AND [leaseOwner]=${job.leaseOwner} AND [status] IN ('PROCESSING','SENDING')`;
  }
  async schemaReady(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ ready: number }>>`
      SELECT CASE WHEN OBJECT_ID('dbo.OrderNotificationOutbox','U') IS NULL THEN 0 ELSE 1 END AS ready`;
    return rows[0]?.ready === 1;
  }
  async summary() {
    return this.prisma.$queryRaw<Array<{ channel: string; status: string; count: number }>>`
      SELECT [channel],[status],COUNT(*) AS [count] FROM [dbo].[OrderNotificationOutbox] GROUP BY [channel],[status]`;
  }
}
