import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CheckoutService } from "./checkout.service.js";

@Injectable()
export class ReservationJanitorService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly checkout: CheckoutService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.checkout.releaseExpiredReservations(100).catch(() => undefined);
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
