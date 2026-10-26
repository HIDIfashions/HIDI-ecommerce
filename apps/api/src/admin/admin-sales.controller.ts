import { Body, Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, CurrentAdmin, type AdminActor } from './admin-auth.js';
import { AdminSalesService } from './admin-sales.service.js';
@Controller('admin/sales-deletion')
@UseGuards(AdminGuard)
export class AdminSalesController {
  constructor(private readonly sales: AdminSalesService) {}
  @Get()
  preview(@Query('before') before: string,@CurrentAdmin() actor: AdminActor) {return this.sales.preview(before,actor);}
  @Delete()
  remove(@Body() body: unknown,@CurrentAdmin() actor: AdminActor) {return this.sales.remove(body,actor);}
}
