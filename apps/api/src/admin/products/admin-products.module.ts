import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { AdminProductsController } from "./admin-products.controller.js";
import { AdminProductsService } from "./admin-products.service.js";
import { AdminSecurityModule } from "../admin-security.module.js";

@Module({ imports: [PrismaModule, AdminSecurityModule], controllers: [AdminProductsController], providers: [AdminProductsService] })
export class AdminProductsModule {}
