import { Module } from '@nestjs/common';
import { AdminSecurityModule } from './admin-security.module.js';
import { AdminSalesController } from './admin-sales.controller.js';
import { AdminSalesService } from './admin-sales.service.js';
@Module({imports:[AdminSecurityModule],controllers:[AdminSalesController],providers:[AdminSalesService]})
export class AdminSalesModule {}
