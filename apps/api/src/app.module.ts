import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccountModule } from "./account/account.module.js";
import { ProductsModule } from "./products/products.module.js";
import { CartsModule } from "./carts/carts.module.js";
import { CheckoutModule } from "./checkout/checkout.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { ReviewsModule } from "./reviews/reviews.module.js";
import { RetentionModule } from "./retention/retention.module.js";
import { RewardsModule } from "./rewards/rewards.module.js";
import { WalletModule } from "./wallet/wallet.module.js";
import { WhatsAppModule } from "./whatsapp/whatsapp.module.js";
import { MarketingModule } from "./marketing/marketing.module.js";

import { OrderNotificationModule } from "./order-notifications/order-notification.module.js";

@Module({
  imports: [PrismaModule, AuthModule, AccountModule, ProductsModule, CartsModule, CheckoutModule, PaymentsModule, AdminModule, ReviewsModule, RetentionModule, RewardsModule, WalletModule, WhatsAppModule, MarketingModule, OrderNotificationModule],
  controllers: [HealthController],
})
export class AppModule {}
