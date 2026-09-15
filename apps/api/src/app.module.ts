import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProductsModule } from "./products/products.module.js";
import { CartsModule } from "./carts/carts.module.js";
import { CheckoutModule } from "./checkout/checkout.module.js";
import { PaymentsModule } from "./payments/payments.module.js";

@Module({
  imports: [PrismaModule, ProductsModule, CartsModule, CheckoutModule, PaymentsModule],
  controllers: [HealthController],
})
export class AppModule {}
