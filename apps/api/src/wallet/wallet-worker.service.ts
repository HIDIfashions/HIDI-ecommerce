import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WalletService } from "./wallet.service.js";

/** Optional bounded poller. The public HTTP API never grants rewards on a GET. */
@Injectable()
export class WalletWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private after?: string;
  constructor(private readonly wallet: WalletService) {}

  onModuleInit() {
    if (process.env.HIDI_WALLET_WORKER_ENABLED !== "true") return;
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
    this.timer.unref();
  }

  async tick() {
    if (this.busy || process.env.HIDI_WALLET_WORKER_ENABLED !== "true" || !this.wallet.enabled()) return;
    this.busy = true;
    try {
      const result = await this.wallet.runMaturationBatch(this.after, 50);
      this.after = result.nextCursor ?? undefined;
      if (result.failed.length) this.logger.warn(`Wallet reconciliation needs attention for ${result.failed.length} record(s)`);
    } catch {
      // Do not log payment payloads, customer identities, DB credentials or tokens.
      this.logger.error("Wallet reconciliation failed; retrying at the next scheduled pass");
    } finally { this.busy = false; }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
