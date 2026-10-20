import { Module } from "@nestjs/common";
import { AdminSecurityModule } from "./admin-security.module.js";
import { AdminSupportController } from "./admin-support.controller.js";
import { AdminSupportService } from "./admin-support.service.js";

@Module({ imports: [AdminSecurityModule], controllers: [AdminSupportController], providers: [AdminSupportService] })
export class AdminSupportModule {}
