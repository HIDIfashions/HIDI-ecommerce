import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdminActor } from './admin-auth.js';
// Keep the primary-owner boundary self-contained for retained API runtimes.
const PRIMARY_OWNER_EMAIL = 'fashionshidi@gmail.com';

export function salesCutoff(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Choose a valid cutoff date');
  const date = new Date(value+'T00:00:00+05:30');
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime()+19800000).toISOString().slice(0,10)!==value || date.getTime()>Date.now()) throw new BadRequestException('Choose a valid date no later than today');
  return date;
}
export function requireSalesOwner(actor: AdminActor) {
  if (actor.authMode!=='SUPABASE' || actor.role!=='OWNER' || actor.email?.trim().toLowerCase()!==PRIMARY_OWNER_EMAIL) throw new ForbiddenException('Sales deletion is restricted to fashionshidi@gmail.com');
}
const signature = (rows: any[]) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const selector = {id:true,orderNumber:true,status:true,totalPaise:true,createdAt:true,updatedAt:true} as const;

@Injectable()
export class AdminSalesService {
  constructor(private readonly db: PrismaService) {}
  async preview(before: unknown, actor: AdminActor) {
    requireSalesOwner(actor); const cutoff=salesCutoff(before);
    const orders=await this.db.order.findMany({where:{createdAt:{lt:cutoff}},select:selector,orderBy:{id:'asc'},take:5001});
    if (orders.length>5000) throw new BadRequestException('Choose an earlier cutoff; at most 5,000 records can be deleted at once');
    return {before,cutoff:cutoff.toISOString(),timeZone:'Asia/Kolkata',count:orders.length,totalPaise:orders.reduce((s,o)=>s+o.totalPaise,0),snapshot:signature(orders),orders};
  }
  async remove(input: any, actor: AdminActor) {
    requireSalesOwner(actor);
    const cutoff=salesCutoff(input?.before);
    if (input?.confirmation!==`DELETE BEFORE ${input.before}` || typeof input.snapshot!=='string') throw new BadRequestException('Enter the exact confirmation shown in the preview');
    return this.db.$transaction(async tx=>{
      // Lock the selected range until archive + deletion commit together.
      await tx.$queryRaw`SELECT [id] FROM [dbo].[Order] WITH (UPDLOCK,HOLDLOCK) WHERE [createdAt] < ${cutoff}`;
      const orders=await tx.order.findMany({where:{createdAt:{lt:cutoff}},select:selector,orderBy:{id:'asc'},take:5001});
      if (orders.length>5000 || signature(orders)!==input.snapshot) throw new ConflictException('Sales changed since the preview. Preview again before deleting.');
      if (!orders.length) return {deleted:0,before:input.before};
      // Keep a private, transactionally complete recovery copy. Wallet ledger
      // entries remain in place so removing sales never changes settled credit.
      const archive: Record<string,unknown>={};
      const tables=['OrderNotificationOutbox','OrderAuditEvent','ReviewFollowUp','ProductReview','ReturnRequest','InventoryReservation','Shipment','Payment','OrderItem','WalletHold','RewardAccrual','WalletLedger','CouponRedemption'];
      for (const table of tables) archive[table]=await tx.$queryRawUnsafe(`SELECT t.* FROM [dbo].[${table}] t JOIN [dbo].[Order] o ON o.[id]=t.[orderId] WHERE o.[createdAt]<@P1`,cutoff);
      archive.PaymentRefund=await tx.$queryRaw`SELECT r.* FROM [dbo].[PaymentRefund] r JOIN [dbo].[Payment] p ON p.[id]=r.[paymentId] JOIN [dbo].[Order] o ON o.[id]=p.[orderId] WHERE o.[createdAt]<${cutoff}`;
      archive.Order=await tx.order.findMany({where:{createdAt:{lt:cutoff}}});
      const archiveId=randomUUID();
      const json=JSON.stringify(archive,(_key,value)=>typeof value==='bigint'?value.toString():value);
      await tx.$executeRaw`INSERT INTO [dbo].[AdminSalesDeletion] ([id],[actorEmail],[cutoff],[orderCount],[archiveJson]) VALUES (${archiveId},${actor.email!},${cutoff},${orders.length},${json})`;
      // Release only still-active reservations, never restock completed sales.
      const reserved=await tx.inventoryReservation.findMany({where:{order:{createdAt:{lt:cutoff}},status:'ACTIVE'}});
      for (const row of reserved) {
        const changed=await tx.inventory.updateMany({where:{variantId:row.variantId,reserved:{gte:row.quantity}},data:{reserved:{decrement:row.quantity}}});
        if(changed.count!==1) throw new ConflictException('Inventory reservation mismatch; no sales were deleted');
      }
      const exchanges=await tx.returnRequest.findMany({where:{order:{createdAt:{lt:cutoff}},exchangeReservationStatus:'ACTIVE'}});
      for (const row of exchanges) {
        if(!row.requestedVariantId) throw new ConflictException('Exchange reservation mismatch; no sales were deleted');
        const changed=await tx.inventory.updateMany({where:{variantId:row.requestedVariantId,reserved:{gte:row.quantity}},data:{reserved:{decrement:row.quantity}}});
        if(changed.count!==1) throw new ConflictException('Exchange reservation mismatch; no sales were deleted');
      }
      const holds=await tx.walletHold.findMany({where:{order:{createdAt:{lt:cutoff}},status:'ACTIVE'}});
      for (const row of holds) {
        const changed=await tx.walletAccount.updateMany({where:{id:row.walletId,reservedPaise:{gte:row.amountPaise}},data:{reservedPaise:{decrement:row.amountPaise}}});
        if(changed.count!==1) throw new ConflictException('Wallet reservation mismatch; no sales were deleted');
      }
      await tx.$executeRaw`UPDATE l SET [orderId]=NULL FROM [dbo].[WalletLedger] l JOIN [dbo].[Order] o ON o.[id]=l.[orderId] WHERE o.[createdAt]<${cutoff}`;
      await tx.$executeRaw`DELETE r FROM [dbo].[PaymentRefund] r JOIN [dbo].[Payment] p ON p.[id]=r.[paymentId] JOIN [dbo].[Order] o ON o.[id]=p.[orderId] WHERE o.[createdAt]<${cutoff}`;
      for (const table of tables.filter(t=>t!=='WalletLedger')) await tx.$executeRawUnsafe(`DELETE t FROM [dbo].[${table}] t JOIN [dbo].[Order] o ON o.[id]=t.[orderId] WHERE o.[createdAt]<@P1`,cutoff);
      const removed=await tx.order.deleteMany({where:{createdAt:{lt:cutoff}}});
      if(removed.count!==orders.length) throw new ConflictException('Sales changed; deletion rolled back');
      return {deleted:removed.count,before:input.before,archiveId};
    },{isolationLevel:'Serializable',timeout:120000});
  }
}
