import {
  BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import type { VerifiedAuthUser } from "../auth/supabase-auth.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  spendablePaise, validOrderAmounts, validPaise, walletEarnPaise, walletMaturity, walletRewardBasis,
  WALLET_MAX_PAISE, WALLET_POLICY_VERSION, WALLET_RETURN_WINDOW_DAYS, type WalletOrderAmounts,
} from "./wallet-policy.js";
import { withSerializableRetry } from "./wallet-transaction.js";

type Tx = Prisma.TransactionClient;
type WalletRow = { id: string; userId: string; authSubject: string; currency: string; balancePaise: number; reservedPaise: number };
type AccrualOrder = WalletOrderAmounts & { id: string; userId: string | null; currency: string; createdAt: Date };
type ReconciliationStatus = "CREDITED" | "REVERSED" | "HELD" | "PENDING" | "SKIPPED" | "UNCHANGED";
const ACTIVE_RETURN_STATUSES = ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REFUND_PROCESSING", "EXCHANGE_SHIPPED"];

/**
 * Store-credit only. Every funds mutation locks Order -> WalletAccount in that
 * order, uses integer paise, and appends an immutable uniquely keyed ledger row.
 * Callers must not perform external/network work inside the shared transaction.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  enabled(): boolean { return process.env.HIDI_WALLET_ENABLED === "true"; }

  private requireEnabled() {
    if (!this.enabled()) throw new ServiceUnavailableException("Wallet payments are temporarily unavailable");
  }

  private async lockOrder(tx: Tx, orderId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException("Order not found");
  }

  private async lockWallet(tx: Tx, walletId: string): Promise<WalletRow> {
    const rows = await tx.$queryRaw<WalletRow[]>`
      SELECT "id", "userId", "authSubject", "currency", "balancePaise", "reservedPaise"
      FROM "WalletAccount" WHERE "id" = ${walletId} FOR UPDATE
    `;
    const wallet = rows[0];
    if (!wallet || wallet.currency !== "INR" || !validPaise(wallet.reservedPaise)
      || !Number.isSafeInteger(wallet.balancePaise) || Math.abs(wallet.balancePaise) > WALLET_MAX_PAISE) {
      throw new ConflictException("Wallet requires a support review");
    }
    return wallet;
  }

  /** Enrolment is only called from an authenticated checkout, never a GET. */
  async ensureWallet(authUser: VerifiedAuthUser) {
    this.requireEnabled();
    if (!authUser.id || (!authUser.email && !(authUser.phoneVerified && authUser.phone))) {
      throw new BadRequestException("A verified customer account is required");
    }
    return withSerializableRetry(this.prisma, async (tx) => {
      const existing = await tx.walletAccount.findUnique({ where: { authSubject: authUser.id } });
      if (existing) return existing;
      // Resolve only server-verified Auth identifiers. Never accept browser-supplied identity here.
      const user = authUser.phoneVerified && authUser.phone
        ? await tx.user.upsert({
            where: { phone: authUser.phone },
            create: { phone: authUser.phone, email: authUser.email ?? null },
            update: authUser.email ? { email: authUser.email } : {},
          })
        : await tx.user.upsert({
            where: { email: authUser.email! },
            create: { email: authUser.email! },
            update: {},
          });
      const prior = await tx.walletAccount.findUnique({ where: { userId: user.id } });
      if (prior) {
        if (prior.authSubject !== authUser.id) throw new ConflictException("This account requires support review before linking a wallet");
        return prior;
      }
      return tx.walletAccount.create({ data: { authSubject: authUser.id, userId: user.id, currency: "INR" } });
    });
  }

  /** Read-only: a summary neither enrols a customer nor creates/credits rewards. */
  async getSummary(authUser: VerifiedAuthUser) {
    return withSerializableRetry(this.prisma, async (tx) => {
      const wallet = await tx.walletAccount.findUnique({ where: { authSubject: authUser.id } });
      const enabled = this.enabled();
      const policy = {
        version: WALLET_POLICY_VERSION, pointsPerComplete100Rupees: 2, paisePerPoint: 100,
        returnWindowDays: WALLET_RETURN_WINDOW_DAYS, redemptionCapPaise: null, expiry: null,
        basis: "MERCHANDISE_AFTER_DISCOUNT_AND_WALLET",
      };
      if (!wallet) return {
        enabled, currency: "INR", balancePaise: 0, reservedPaise: 0, availablePaise: 0, debtPaise: 0,
        pendingPaise: 0, heldPaise: 0, history: [], historyTruncated: false, policy,
      };
      const [pending, held, staleActiveReturnPending, history] = await Promise.all([
        // Defensive read rule: an active return must never appear as spendable/pending
        // reward even if an older request predates the transactional hold logic.
        tx.rewardAccrual.aggregate({
          where: {
            walletId: wallet.id,
            status: "PENDING",
            order: { returnRequests: { none: { status: { in: ACTIVE_RETURN_STATUSES } } } },
          },
          _sum: { rewardPaise: true },
        }),
        tx.rewardAccrual.aggregate({ where: { walletId: wallet.id, status: "HELD" }, _sum: { rewardPaise: true } }),
        tx.rewardAccrual.aggregate({
          where: {
            walletId: wallet.id,
            status: "PENDING",
            order: { returnRequests: { some: { status: { in: ACTIVE_RETURN_STATUSES } } } },
          },
          _sum: { rewardPaise: true },
        }),
        tx.walletLedger.findMany({
          where: { walletId: wallet.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
          select: { id: true, kind: true, deltaPaise: true, createdAt: true, order: { select: { orderNumber: true } } },
        }),
      ]);
      return {
        enabled, currency: "INR", balancePaise: wallet.balancePaise, reservedPaise: wallet.reservedPaise,
        availablePaise: enabled ? spendablePaise(wallet.balancePaise, wallet.reservedPaise) : 0,
        debtPaise: Math.max(0, -wallet.balancePaise),
        pendingPaise: pending._sum.rewardPaise ?? 0,
        heldPaise: (held._sum.rewardPaise ?? 0) + (staleActiveReturnPending._sum.rewardPaise ?? 0),
        history: history.slice(0, 20).map(({ order, ...entry }) => ({ ...entry, orderNumber: order?.orderNumber ?? null })),
        historyTruncated: history.length > 20, policy,
      };
    });
  }

  /** Snapshot the earning rule once when creating a new authenticated order. */
  async createAccrual(tx: Tx, order: AccrualOrder, walletId: string) {
    if (!this.enabled()) return null;
    await this.lockOrder(tx, order.id);
    const wallet = await this.lockWallet(tx, walletId);
    if (!order.userId || order.userId !== wallet.userId || order.currency !== "INR" || !validOrderAmounts(order)) {
      throw new ConflictException("Order is not eligible for this wallet");
    }
    const basisPaise = walletRewardBasis(order);
    const rewardPaise = walletEarnPaise(basisPaise);
    if (rewardPaise === 0) return null;
    const existing = await tx.rewardAccrual.findUnique({ where: { orderId: order.id } });
    if (existing) {
      if (existing.walletId !== walletId || existing.basisPaise !== basisPaise || existing.rewardPaise !== rewardPaise) {
        throw new ConflictException("Reward snapshot does not match this order");
      }
      return existing;
    }
    return tx.rewardAccrual.create({ data: {
      orderId: order.id, walletId, basisPaise, rewardPaise, returnWindowDays: WALLET_RETURN_WINDOW_DAYS,
      policyVersion: WALLET_POLICY_VERSION, status: "PENDING", reason: "AWAITING_PAYMENT_AND_DELIVERY",
    } });
  }

  /** Reserve exactly the requested amount; no percentage/minimum cash cap. */
  async reserve(tx: Tx, walletId: string, orderId: string, amountPaise: number, expiresAt: Date) {
    this.requireEnabled();
    if (!validPaise(amountPaise) || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Invalid wallet reservation");
    }
    await this.lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { userId: true, currency: true, totalPaise: true, walletAppliedPaise: true, status: true } });
    const wallet = await this.lockWallet(tx, walletId);
    if (!order || order.userId !== wallet.userId || order.currency !== "INR" || order.status !== "PENDING_PAYMENT"
      || order.walletAppliedPaise !== amountPaise || amountPaise > order.totalPaise) throw new ConflictException("Wallet reservation does not match this order");
    const existing = await tx.walletHold.findUnique({ where: { orderId } });
    if (existing) {
      if (existing.walletId !== walletId || existing.amountPaise !== amountPaise || existing.status !== "ACTIVE"
        || existing.expiresAt.getTime() <= Date.now()) throw new ConflictException("Wallet reservation has ended; start a new checkout");
      return existing;
    }
    if (amountPaise === 0) return null;
    if (spendablePaise(wallet.balancePaise, wallet.reservedPaise) < amountPaise) throw new ConflictException("Wallet balance changed. Refresh checkout and try again.");
    const hold = await tx.walletHold.create({ data: { walletId, orderId, amountPaise, expiresAt, status: "ACTIVE" } });
    await tx.walletAccount.update({ where: { id: walletId }, data: { reservedPaise: { increment: amountPaise } } });
    return hold;
  }

  /** Called inside the same transaction as capture + inventory consumption. */
  async consume(tx: Tx, orderId: string): Promise<boolean> {
    await this.lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { walletAppliedPaise: true, userId: true } });
    if (!order) throw new NotFoundException("Order not found");
    const hold = await tx.walletHold.findUnique({ where: { orderId } });
    if (order.walletAppliedPaise === 0) return !hold;
    if (!hold || hold.amountPaise !== order.walletAppliedPaise) return false;
    const wallet = await this.lockWallet(tx, hold.walletId);
    if (order.userId !== wallet.userId) throw new ConflictException("Wallet owner mismatch");
    const eventKey = `wallet:redeem:${orderId}`;
    const existing = await tx.walletLedger.findUnique({ where: { eventKey } });
    if (hold.status === "CONSUMED") {
      if (!existing || existing.deltaPaise !== -hold.amountPaise || existing.walletId !== wallet.id) throw new ConflictException("Wallet debit needs reconciliation");
      return true;
    }
    // No reacquisition after expiration/release; captured cash requires review.
    if (!this.enabled() || hold.status !== "ACTIVE" || hold.expiresAt.getTime() <= Date.now()) return false;
    if (existing) throw new ConflictException("Wallet debit needs reconciliation");
    // A late reversal can create debt underneath active reservations. Never
    // consume any hold if the wallet cannot still cover ALL reserved amounts.
    if (wallet.reservedPaise < hold.amountPaise || wallet.balancePaise < wallet.reservedPaise) return false;
    await tx.walletLedger.create({ data: { walletId: wallet.id, orderId, kind: "REDEEM", deltaPaise: -hold.amountPaise, eventKey } });
    await tx.walletAccount.update({ where: { id: wallet.id }, data: {
      balancePaise: { decrement: hold.amountPaise }, reservedPaise: { decrement: hold.amountPaise },
    } });
    await tx.walletHold.update({ where: { id: hold.id }, data: { status: "CONSUMED", consumedAt: new Date() } });
    return true;
  }

  /** Releases are allowed even while new wallet spending is disabled. */
  async release(tx: Tx, orderId: string) {
    await this.lockOrder(tx, orderId);
    const hold = await tx.walletHold.findUnique({ where: { orderId } });
    if (!hold || hold.status !== "ACTIVE") return false;
    const wallet = await this.lockWallet(tx, hold.walletId);
    if (wallet.reservedPaise < hold.amountPaise) throw new ConflictException("Wallet reservation needs reconciliation");
    await tx.walletAccount.update({ where: { id: wallet.id }, data: { reservedPaise: { decrement: hold.amountPaise } } });
    await tx.walletHold.update({ where: { id: hold.id }, data: { status: "RELEASED", releasedAt: new Date() } });
    return true;
  }

  /** Freeze reward maturity as soon as a customer opens a return/exchange. */
  async holdForReturn(tx: Tx, orderId: string, requestId: string) {
    await this.lockOrder(tx, orderId);
    const accrual = await tx.rewardAccrual.findUnique({ where: { orderId } });
    if (!accrual || accrual.status === "REVERSED") return false;
    if (accrual.status === "CREDITED") {
      return this.reverseEarned(tx, orderId, `RETURN_REQUESTED:${requestId}`);
    }
    await tx.rewardAccrual.update({
      where: { id: accrual.id },
      data: { status: "HELD", reason: `ACTIVE_RETURN:${requestId}`.slice(0, 240) },
    });
    return true;
  }

  /** Credit an approved customer refund to HIDI Wallet exactly once. */
  async creditReturnRefund(tx: Tx, orderId: string, requestId: string, amountPaise: number) {
    if (!validPaise(amountPaise) || amountPaise <= 0) throw new BadRequestException("Invalid wallet refund amount");
    await this.lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { userId: true, currency: true } });
    if (!order?.userId || order.currency !== "INR") throw new ConflictException("Refund wallet requires a linked customer");
    const account = await tx.walletAccount.findUnique({ where: { userId: order.userId } });
    if (!account) throw new ConflictException("Customer wallet is not available for this refund");
    const wallet = await this.lockWallet(tx, account.id);
    const eventKey = `wallet:return-refund:${requestId}`;
    const existing = await tx.walletLedger.findUnique({ where: { eventKey } });
    if (existing) {
      if (existing.walletId !== wallet.id || existing.orderId !== orderId || existing.deltaPaise !== amountPaise || existing.kind !== "RETURN_REFUND") {
        throw new ConflictException("Wallet refund requires reconciliation");
      }
      return false;
    }
    await tx.walletLedger.create({
      data: { walletId: wallet.id, orderId, kind: "RETURN_REFUND", deltaPaise: amountPaise, eventKey },
    });
    await tx.walletAccount.update({ where: { id: wallet.id }, data: { balancePaise: { increment: amountPaise } } });
    return true;
  }

  /** Conservative full reward reversal on any recorded return/refund. */
  async reverseEarned(tx: Tx, orderId: string, reason: string) {
    await this.lockOrder(tx, orderId);
    const accrual = await tx.rewardAccrual.findUnique({ where: { orderId } });
    if (!accrual || accrual.status === "REVERSED") return false;
    const wallet = await this.lockWallet(tx, accrual.walletId);
    if (accrual.status === "CREDITED") {
      const earning = await tx.walletLedger.findUnique({ where: { eventKey: `wallet:earn:${orderId}` } });
      if (!earning || earning.walletId !== wallet.id || earning.deltaPaise !== accrual.rewardPaise) throw new ConflictException("Reward credit needs reconciliation");
      const eventKey = `wallet:reverse-earn:${orderId}`;
      if (await tx.walletLedger.findUnique({ where: { eventKey } })) throw new ConflictException("Reward reversal needs reconciliation");
      // Negative balances are retained as debt; never discard spent rewards.
      await tx.walletLedger.create({ data: { walletId: wallet.id, orderId, kind: "REVERSE_EARN", deltaPaise: -accrual.rewardPaise, eventKey } });
      await tx.walletAccount.update({ where: { id: wallet.id }, data: { balancePaise: { decrement: accrual.rewardPaise } } });
    }
    await tx.rewardAccrual.update({ where: { id: accrual.id }, data: { status: "REVERSED", reversedAt: new Date(), reason: reason.slice(0, 240) } });
    return true;
  }

  /** Restore original wallet tender only after a confirmed FULL order refund. */
  async restoreRedeemed(tx: Tx, orderId: string) {
    await this.lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: { include: { refunds: true } } } });
    const hold = await tx.walletHold.findUnique({ where: { orderId } });
    if (!order || !hold || hold.status === "REFUNDED") return false;
    if (hold.status !== "CONSUMED" || hold.amountPaise !== order.walletAppliedPaise) return false;
    const cashPayable = order.totalPaise - order.walletAppliedPaise;
    const refunds = order.payments.flatMap((payment) => payment.refunds.filter((refund) => refund.status === "PROCESSED"));
    const cashRefunded = refunds.reduce((sum, refund) => sum + refund.amountPaise, 0);
    // Wallet-only refunds have no provider event: only the privileged full
    // refund operation sets REFUNDED, and it must do so in this transaction.
    if (order.status !== "REFUNDED" || cashPayable < 0 || (cashPayable > 0 && cashRefunded !== cashPayable)
      || refunds.some((refund) => !validPaise(refund.amountPaise))) return false;
    const wallet = await this.lockWallet(tx, hold.walletId);
    if (order.userId !== wallet.userId) throw new ConflictException("Wallet owner mismatch");
    const debit = await tx.walletLedger.findUnique({ where: { eventKey: `wallet:redeem:${orderId}` } });
    if (!debit || debit.walletId !== wallet.id || debit.deltaPaise !== -hold.amountPaise) throw new ConflictException("Wallet debit needs reconciliation");
    const eventKey = `wallet:refund-redeem:${orderId}`;
    if (await tx.walletLedger.findUnique({ where: { eventKey } })) throw new ConflictException("Wallet refund needs reconciliation");
    await tx.walletLedger.create({ data: { walletId: wallet.id, orderId, kind: "REFUND_REDEEM", deltaPaise: hold.amountPaise, eventKey } });
    await tx.walletAccount.update({ where: { id: wallet.id }, data: { balancePaise: { increment: hold.amountPaise } } });
    await tx.walletHold.update({ where: { id: hold.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
    return true;
  }

  async reconcileOrder(orderId: string): Promise<{ orderId: string; status: ReconciliationStatus; reason: string }> {
    return withSerializableRetry(this.prisma, async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: {
        rewardAccrual: true, walletHold: true, payments: { include: { refunds: true } }, shipments: true,
      } });
      const accrual = order?.rewardAccrual;
      if (!order || !accrual) return { orderId, status: "SKIPPED", reason: "NO_AUTHENTICATED_ORDER_ACCRUAL" };
      const wallet = await this.lockWallet(tx, accrual.walletId);
      if (order.userId !== wallet.userId) throw new ConflictException("Reward owner mismatch");
      if (accrual.status === "REVERSED") return { orderId, status: "UNCHANGED", reason: "ALREADY_REVERSED" };
      const activeReturn = await tx.returnRequest.findFirst({
        where: { orderId, status: { in: ACTIVE_RETURN_STATUSES } },
        select: { id: true },
      });
      if (activeReturn) {
        if (accrual.status === "CREDITED") {
          await this.reverseEarned(tx, orderId, `ACTIVE_RETURN:${activeReturn.id}`);
          return { orderId, status: "REVERSED", reason: "ACTIVE_RETURN" };
        }
        if (accrual.status !== "HELD" || accrual.reason !== `ACTIVE_RETURN:${activeReturn.id}`) {
          await tx.rewardAccrual.update({
            where: { id: accrual.id },
            data: { status: "HELD", reason: `ACTIVE_RETURN:${activeReturn.id}` },
          });
        }
        return { orderId, status: "HELD", reason: "ACTIVE_RETURN" };
      }
      const decision = walletMaturity({ ...order, hold: order.walletHold }, accrual.returnWindowDays, new Date());
      if (decision.status === "REVERSE") {
        await this.reverseEarned(tx, orderId, decision.reason);
        return { orderId, status: "REVERSED", reason: decision.reason };
      }
      const validSnapshot = validOrderAmounts(order) && accrual.policyVersion === WALLET_POLICY_VERSION
        && accrual.basisPaise === walletRewardBasis(order) && accrual.rewardPaise === walletEarnPaise(accrual.basisPaise);
      if (!validSnapshot) {
        if (accrual.status === "CREDITED") await this.reverseEarned(tx, orderId, "REWARD_SNAPSHOT_MISMATCH");
        else await tx.rewardAccrual.update({ where: { id: accrual.id }, data: { status: "HELD", reason: "REWARD_SNAPSHOT_MISMATCH" } });
        return { orderId, status: accrual.status === "CREDITED" ? "REVERSED" : "HELD", reason: "REWARD_SNAPSHOT_MISMATCH" };
      }
      if (accrual.status === "CREDITED") return { orderId, status: "UNCHANGED", reason: "ALREADY_CREDITED" };
      if (!this.enabled()) return { orderId, status: "SKIPPED", reason: "NEW_EARNING_DISABLED" };
      if (decision.status !== "ELIGIBLE") {
        await tx.rewardAccrual.update({ where: { id: accrual.id }, data: {
          status: decision.status, eligibleAt: decision.eligibleAt, reason: decision.reason,
        } });
        return { orderId, status: decision.status, reason: decision.reason };
      }
      const eventKey = `wallet:earn:${orderId}`;
      if (await tx.walletLedger.findUnique({ where: { eventKey } })) throw new ConflictException("Reward credit needs reconciliation");
      await tx.walletLedger.create({ data: { walletId: wallet.id, orderId, kind: "EARN", deltaPaise: accrual.rewardPaise, eventKey } });
      await tx.walletAccount.update({ where: { id: wallet.id }, data: { balancePaise: { increment: accrual.rewardPaise } } });
      await tx.rewardAccrual.update({ where: { id: accrual.id }, data: {
        status: "CREDITED", eligibleAt: decision.eligibleAt, creditedAt: new Date(), reason: decision.reason,
      } });
      return { orderId, status: "CREDITED", reason: decision.reason };
    });
  }

  /** Bounded keyset page; scheduler carries nextCursor until null, then restarts. */
  async runMaturationBatch(after?: string, limit = 50) {
    if (after !== undefined && (typeof after !== "string" || !after || after.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(after))) throw new BadRequestException("Invalid wallet reconciliation cursor");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException("Wallet batch limit must be between 1 and 100");
    const entries = await this.prisma.rewardAccrual.findMany({
      where: { status: { in: ["PENDING", "HELD"] }, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" }, take: limit + 1, select: { id: true, orderId: true },
    });
    const page = entries.slice(0, limit);
    const result = { enabled: this.enabled(), processed: 0, credited: 0, reversed: 0, held: 0, pending: 0,
      failed: [] as { orderId: string; reason: string }[], nextCursor: entries.length > limit ? page[page.length - 1].id : null };
    for (const entry of page) {
      try {
        const reconciliation = await this.reconcileOrder(entry.orderId);
        result.processed += 1;
        if (reconciliation.status === "CREDITED") result.credited += 1;
        if (reconciliation.status === "REVERSED") result.reversed += 1;
        if (reconciliation.status === "HELD") result.held += 1;
        if (reconciliation.status === "PENDING") result.pending += 1;
      } catch {
        // No DB internals or customer details in admin response. Failed rows are
        // revisited on the next cursor cycle; posting remains transactional.
        result.failed.push({ orderId: entry.orderId, reason: "RECONCILIATION_FAILED" });
      }
    }
    return result;
  }
}
