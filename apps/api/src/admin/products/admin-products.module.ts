import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { AdminProductsController } from "./admin-products.controller.js";
import { AdminProductsService } from "./admin-products.service.js";
import { AdminProductsGuard } from "./admin-products.guard.js";

@Module({ imports: [PrismaModule], controllers: [AdminProductsController], providers: [AdminProductsService, AdminProductsGuard] })
export class AdminProductsModule {}
