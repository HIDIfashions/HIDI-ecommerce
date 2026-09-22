import type { Prisma } from "../generated/prisma/client.js";

type InvoiceOrderSnapshot = {
  id: string;
  orderNumber: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
};

export async function ensureCustomerInvoice(
  tx: Prisma.TransactionClient,
  order: InvoiceOrderSnapshot,
) {
  const invoiceNumber = "HIDI-INV-" + order.orderNumber.replace(/^HIDI-/i, "");

  return tx.customerInvoice.upsert({
    where: { orderId: order.id },
    update: {},
    create: {
      orderId: order.id,
      invoiceNumber,
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      shippingPaise: order.shippingPaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
    },
  });
}
