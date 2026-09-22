import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

type VariantBreakupInput = { variantId?: string; quantity?: number };

type CreateVendorInput = {
  name?: string;
  gstin?: string;
  city?: string;
  state?: string;
  contactName?: string;
  phone?: string;
  email?: string;
};

type SaveVendorProductInput = {
  vendorId?: string;
  productId?: string;
  vendorStyleCode?: string;
  vendorProductName?: string;
  hsn?: string;
  defaultUnitCostPaise?: number | null;
  packPattern?: VariantBreakupInput[];
};

type CreatePurchaseOrderInput = {
  vendorId?: string;
  orderDate?: string;
  expectedAt?: string;
  note?: string;
  lines?: Array<{
    vendorProductId?: string;
    productId?: string;
    vendorStyleCode?: string;
    description?: string;
    orderedQuantity?: number;
    unitCostPaise?: number | null;
    hsn?: string;
    variants?: VariantBreakupInput[];
  }>;
};

type CreateInvoiceInput = {
  vendorId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  purchaseReference?: string;
  purchaseOrderId?: string;
  originalFilename?: string;
  documentUrl?: string;
  rawText?: string;
  subtotalPaise?: number | null;
  taxPaise?: number | null;
  totalPaise?: number | null;
  note?: string;
  lines?: Array<{
    rawDescription?: string;
    vendorStyleCode?: string;
    hsn?: string;
    invoiceQuantity?: number;
    unitCostPaise?: number | null;
    amountPaise?: number | null;
    purchaseOrderLineId?: string;
    explicitVariants?: VariantBreakupInput[];
    manualVariants?: VariantBreakupInput[];
  }>;
};

function text(value: unknown, label: string, max = 160, required = false) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new BadRequestException(label + " is required");
  if (result.length > max) throw new BadRequestException(label + " is too long");
  return result || null;
}

function vendorStyle(value: unknown, required = false) {
  const result = text(value, "Vendor dress code", 120, required);
  return result ? result.replace(/\s+/g, " ").toUpperCase() : null;
}

function normalizedVendorName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function looseVendorName(value: string) {
  return normalizedVendorName(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token)
    .join(" ");
}

async function nextVendorNumber(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('hidi_vendor_number_seq') AS value
  `;
  const value = Number(rows[0]?.value ?? 0);
  if (!Number.isSafeInteger(value) || value < 10001) throw new Error("Unable to allocate vendor number");
  return String(value);
}

function nonNegativeInt(value: unknown, label: string, nullable = false) {
  if ((value === null || value === undefined || value === "") && nullable) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new BadRequestException(label + " must be a whole number of zero or more");
  return number;
}

function positiveInt(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new BadRequestException(label + " must be a positive whole number");
  return number;
}

@Injectable()
export class AdminProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [vendors, vendorProducts, purchaseOrders, invoices, products] = await Promise.all([
      this.prisma.vendor.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
      this.prisma.vendorProduct.findMany({
        where: { active: true },
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          product: {
            select: {
              id: true,
              internalCode: true,
              internalName: true,
              name: true,
              slug: true,
              status: true,
              variants: {
                orderBy: [{ color: "asc" }, { size: "asc" }],
                select: { id: true, sku: true, color: true, size: true, active: true },
              },
            },
          },
          packPattern: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: { variant: { select: { id: true, sku: true, color: true, size: true } } },
          },
        },
        orderBy: [{ vendor: { name: "asc" } }, { vendorStyleCode: "asc" }],
      }),
      this.prisma.purchaseOrder.findMany({
        take: 100,
        orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              vendorProduct: {
                select: {
                  id: true,
                  vendorStyleCode: true,
                  product: { select: { id: true, internalCode: true, internalName: true, name: true } },
                },
              },
              product: { select: { id: true, internalCode: true, internalName: true, name: true } },
              invoiceLines: { select: { invoiceQuantity: true } },
              receiptLines: { select: { acceptedQuantity: true, rejectedQuantity: true } },
              variants: {
                orderBy: { variant: { size: "asc" } },
                include: { variant: { select: { id: true, sku: true, color: true, size: true } } },
              },
            },
          },
        },
      }),
      this.prisma.vendorInvoice.findMany({
        take: 100,
        orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          lines: {
            orderBy: { createdAt: "asc" },
            include: {
              vendorProduct: {
                select: {
                  id: true,
                  vendorStyleCode: true,
                  product: { select: { id: true, internalCode: true, name: true } },
                },
              },
              expectedVariants: {
                orderBy: { variant: { size: "asc" } },
                include: { variant: { select: { id: true, sku: true, color: true, size: true } } },
              },
              receiptLines: {
                select: { variantId: true, acceptedQuantity: true, rejectedQuantity: true },
              },
            },
          },
        },
      }),
      this.prisma.product.findMany({
        where: { status: { not: "ARCHIVED" } },
        take: 1000,
        orderBy: { name: "asc" },
        select: {
          id: true,
          internalCode: true,
          internalName: true,
          name: true,
          slug: true,
          status: true,
          variants: {
            where: { active: true },
            orderBy: [{ color: "asc" }, { size: "asc" }],
            select: { id: true, sku: true, color: true, size: true, mrpPaise: true, pricePaise: true },
          },
        },
      }),
    ]);

    return {
      vendors,
      vendorProducts,
      purchaseOrders: purchaseOrders.map((po) => ({
        ...po,
        orderedQuantity: po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0),
        invoicedQuantity: po.lines.reduce(
          (sum, line) => sum + line.invoiceLines.reduce((n, row) => n + row.invoiceQuantity, 0),
          0,
        ),
        receivedQuantity: po.lines.reduce(
          (sum, line) => sum + line.receiptLines.reduce((n, row) => n + row.acceptedQuantity, 0),
          0,
        ),
      })),
      products,
      invoices: invoices.map((invoice) => ({
        ...invoice,
        invoiceQuantity: invoice.lines.reduce((sum, line) => sum + line.invoiceQuantity, 0),
        acceptedQuantity: invoice.lines.reduce(
          (sum, line) => sum + line.receiptLines.reduce((n, row) => n + row.acceptedQuantity, 0),
          0,
        ),
        rejectedQuantity: invoice.lines.reduce(
          (sum, line) => sum + line.receiptLines.reduce((n, row) => n + row.rejectedQuantity, 0),
          0,
        ),
      })),
    };
  }

  async createVendor(input: CreateVendorInput) {
    const name = text(input?.name, "Vendor name", 120, true)!;
    const normalizedName = normalizedVendorName(name);

    const candidates = await this.prisma.vendor.findMany({
      where: { active: true },
      include: {
        _count: { select: { products: true, invoices: true, purchaseOrders: true } },
      },
      take: 1000,
    });
    const loose = looseVendorName(name);
    const matching = candidates
      .filter((candidate) => looseVendorName(candidate.name) === loose)
      .sort((a, b) => {
        const scoreA = a._count.products * 100 + a._count.invoices * 10 + a._count.purchaseOrders;
        const scoreB = b._count.products * 100 + b._count.invoices * 10 + b._count.purchaseOrders;
        return scoreB - scoreA;
      });
    if (matching.length) {
      const { _count: _ignore, ...existing } = matching[0];
      return { ...existing, reused: true };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.vendor.findUnique({ where: { normalizedName } });
        if (replay) return { ...replay, reused: true };

        const code = await nextVendorNumber(tx);
        const vendor = await tx.vendor.create({
          data: {
            code,
            name,
            normalizedName,
            gstin: text(input.gstin, "GSTIN", 30),
            city: text(input.city, "City", 80),
            state: text(input.state, "State", 80),
            contactName: text(input.contactName, "Contact name", 100),
            phone: text(input.phone, "Phone", 30),
            email: text(input.email, "Email", 160),
          },
        });
        return { ...vendor, reused: false };
      }, { isolationLevel: "Serializable" });
    } catch (error: any) {
      if (error?.code === "P2002") {
        const replay = await this.prisma.vendor.findUnique({ where: { normalizedName } });
        if (replay) return { ...replay, reused: true };
      }
      throw error;
    }
  }

  async saveVendorProduct(input: SaveVendorProductInput) {
    const vendorId = text(input?.vendorId, "Vendor", 80, true)!;
    const productId = text(input?.productId, "HIDI product", 80, true)!;
    const vendorStyleCode = vendorStyle(input?.vendorStyleCode, true)!;
    const pattern = this.validateBreakup(input.packPattern ?? [], "Pack pattern", false);

    return this.prisma.$transaction(async (tx) => {
      const [vendor, product] = await Promise.all([
        tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true } }),
        tx.product.findUnique({
          where: { id: productId },
          select: { id: true, internalCode: true, name: true, variants: { select: { id: true } } },
        }),
      ]);
      if (!vendor) throw new NotFoundException("Vendor not found");
      if (!product) throw new NotFoundException("HIDI product not found");

      const allowedVariants = new Set(product.variants.map((variant) => variant.id));
      if (pattern.some((entry) => !allowedVariants.has(entry.variantId))) {
        throw new BadRequestException("Pack pattern can use only variants belonging to the selected HIDI product");
      }

      const existing = await tx.vendorProduct.findUnique({
        where: { vendorId_vendorStyleCode: { vendorId, vendorStyleCode } },
        include: { product: { select: { internalCode: true, name: true } } },
      });

      if (existing && existing.productId !== productId) {
        throw new ConflictException(
          "Vendor style " +
            vendorStyleCode +
            " is already mapped to " +
            existing.product.internalCode +
            " · " +
            existing.product.name +
            ". Reuse the existing HIDI product instead of creating duplicate inventory.",
        );
      }

      const vendorProduct = existing
        ? await tx.vendorProduct.update({
            where: { id: existing.id },
            data: {
              hidiStyleCode: product.internalCode,
              vendorProductName: text(input.vendorProductName, "Vendor product name", 160),
              hsn: text(input.hsn, "HSN", 30),
              defaultUnitCostPaise: nonNegativeInt(input.defaultUnitCostPaise, "Default purchase cost", true),
              active: true,
            },
          })
        : await tx.vendorProduct.create({
            data: {
              vendorId,
              productId,
              vendorStyleCode,
              hidiStyleCode: product.internalCode,
              vendorProductName: text(input.vendorProductName, "Vendor product name", 160),
              hsn: text(input.hsn, "HSN", 30),
              defaultUnitCostPaise: nonNegativeInt(input.defaultUnitCostPaise, "Default purchase cost", true),
            },
          });

      await tx.vendorPackPattern.deleteMany({ where: { vendorProductId: vendorProduct.id } });
      if (pattern.length) {
        await tx.vendorPackPattern.createMany({
          data: pattern.map((entry, position) => ({
            vendorProductId: vendorProduct.id,
            variantId: entry.variantId,
            quantity: entry.quantity,
            position,
          })),
        });
      }

      return tx.vendorProduct.findUnique({
        where: { id: vendorProduct.id },
        include: {
          vendor: true,
          product: { include: { variants: { orderBy: [{ color: "asc" }, { size: "asc" }] } } },
          packPattern: {
            orderBy: { position: "asc" },
            include: { variant: true },
          },
        },
      });
    });
  }

  async resolveMaterial(vendorIdValue: string, vendorStyleValue: string) {
    const vendorId = text(vendorIdValue, "Vendor", 80, true)!;
    const vendorStyleCode = vendorStyle(vendorStyleValue, true)!;
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, code: true, name: true } });
    if (!vendor) throw new NotFoundException("Vendor not found");

    const mapping = await this.prisma.vendorProduct.findUnique({
      where: { vendorId_vendorStyleCode: { vendorId, vendorStyleCode } },
      include: {
        product: {
          select: {
            id: true,
            internalCode: true,
            name: true,
            slug: true,
            variants: {
              where: { active: true },
              orderBy: [{ color: "asc" }, { size: "asc" }],
              select: { id: true, sku: true, color: true, size: true, active: true },
            },
          },
        },
      },
    });

    return { vendor, vendorStyleCode, mapped: Boolean(mapping), mapping };
  }

  async createPurchaseOrder(input: CreatePurchaseOrderInput, actor?: string) {
    const vendorId = text(input?.vendorId, "Vendor", 80, true)!;
    const orderDate = new Date(String(input?.orderDate ?? ""));
    if (Number.isNaN(orderDate.getTime())) throw new BadRequestException("PO date is invalid");
    const expectedAt = input?.expectedAt ? new Date(String(input.expectedAt)) : null;
    if (expectedAt && Number.isNaN(expectedAt.getTime())) throw new BadRequestException("Expected delivery date is invalid");
    if (!Array.isArray(input?.lines) || input.lines.length === 0) throw new BadRequestException("Add at least one PO material");
    if (input.lines.length > 500) throw new BadRequestException("Purchase order can contain at most 500 lines");
    const inputLines = input.lines;

    return this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
      if (!vendor) throw new NotFoundException("Vendor not found");

      const prepared = [];
      for (let index = 0; index < inputLines.length; index += 1) {
        const raw = inputLines[index];
        const productId = text(raw.productId, "HIDI material", 80, true)!;
        const style = vendorStyle(raw.vendorStyleCode, true)!;
        const orderedQuantity = positiveInt(raw.orderedQuantity, "PO quantity");
        const mapping = await tx.vendorProduct.findUnique({
          where: { vendorId_vendorStyleCode: { vendorId, vendorStyleCode: style } },
          select: { id: true, productId: true },
        });
        if (!mapping) {
          throw new BadRequestException("Resolve vendor material " + style + " to a HIDI material before creating the PO");
        }
        if (mapping.productId !== productId) {
          throw new ConflictException("Vendor material " + style + " is already mapped to another HIDI material");
        }

        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true, variants: { where: { active: true }, select: { id: true } } },
        });
        if (!product) throw new NotFoundException("HIDI material not found");

        const variants = this.validateBreakup(raw.variants ?? [], "PO size quantities", true);
        this.assertBreakupTotal(variants, orderedQuantity, "PO size quantities");
        const allowed = new Set(product.variants.map((variant) => variant.id));
        if (variants.some((entry) => !allowed.has(entry.variantId))) {
          throw new BadRequestException("PO size quantities contain a size that does not belong to the selected HIDI material");
        }

        prepared.push({
          lineNumber: index + 10,
          vendorProductId: mapping.id,
          productId,
          vendorStyleCode: style,
          description: text(raw.description, "PO line description", 500),
          orderedQuantity,
          unitCostPaise: nonNegativeInt(raw.unitCostPaise, "PO unit cost", true),
          hsn: text(raw.hsn, "HSN", 30),
          variants,
        });
      }

      const day = orderDate.toISOString().slice(0, 10).replaceAll("-", "");
      const poNumber = "HIDI-PO-" + day + "-" + randomUUID().slice(0, 6).toUpperCase();

      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          vendorId,
          orderDate,
          expectedAt,
          status: "OPEN",
          note: text(input.note, "PO note", 2000),
          createdBy: actor?.trim() || "HIDI Admin",
        },
      });

      for (const row of prepared) {
        const line = await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: po.id,
            lineNumber: row.lineNumber,
            vendorProductId: row.vendorProductId,
            productId: row.productId,
            vendorStyleCode: row.vendorStyleCode,
            description: row.description,
            orderedQuantity: row.orderedQuantity,
            unitCostPaise: row.unitCostPaise,
            hsn: row.hsn,
          },
        });
        await tx.purchaseOrderVariant.createMany({
          data: row.variants.map((entry) => ({
            purchaseOrderLineId: line.id,
            variantId: entry.variantId,
            orderedQuantity: entry.quantity,
          })),
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id: po.id },
        include: {
          vendor: true,
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              product: {
                select: {
                  id: true,
                  internalCode: true,
                  internalName: true,
                  name: true,
                  variants: {
                    where: { active: true },
                    orderBy: [{ color: "asc" }, { size: "asc" }],
                    select: { id: true, sku: true, color: true, size: true },
                  },
                },
              },
              vendorProduct: true,
              variants: {
                orderBy: { variant: { size: "asc" } },
                include: { variant: true },
              },
            },
          },
        },
      });
    });
  }

  async createInvoice(input: CreateInvoiceInput) {
    const vendorId = text(input?.vendorId, "Vendor", 80, true)!;
    const invoiceNumber = text(input?.invoiceNumber, "Invoice number", 120, true)!;
    const invoiceDate = new Date(String(input?.invoiceDate ?? ""));
    if (Number.isNaN(invoiceDate.getTime())) throw new BadRequestException("Invoice date is invalid");
    if (!Array.isArray(input?.lines) || input.lines.length === 0) {
      throw new BadRequestException("Add at least one vendor invoice line");
    }
    if (input.lines.length > 500) throw new BadRequestException("Vendor invoice can contain at most 500 lines");
    const invoiceLines = input.lines;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
        if (!vendor) throw new NotFoundException("Vendor not found");

        const purchaseOrderId = text(input.purchaseOrderId, "Purchase order", 80);
        const purchaseOrder = purchaseOrderId
          ? await tx.purchaseOrder.findFirst({
              where: { id: purchaseOrderId, vendorId, status: { not: "CANCELLED" } },
              include: {
                lines: {
                  select: {
                    id: true,
                    vendorStyleCode: true,
                    productId: true,
                    orderedQuantity: true,
                    variants: { select: { variantId: true, orderedQuantity: true } },
                    invoiceLines: { select: { invoiceQuantity: true } },
                  },
                },
              },
            })
          : null;
        if (purchaseOrderId && !purchaseOrder) {
          throw new BadRequestException("Purchase order does not belong to this vendor or is cancelled");
        }

        const invoice = await tx.vendorInvoice.create({
          data: {
            vendorId,
            invoiceNumber,
            invoiceDate,
            purchaseReference: text(input.purchaseReference, "Purchase reference", 120),
            purchaseOrderId: purchaseOrder?.id ?? null,
            originalFilename: text(input.originalFilename, "Original filename", 255),
            documentUrl: text(input.documentUrl, "Document URL", 1000),
            rawText: text(input.rawText, "Raw invoice text", 200000),
            subtotalPaise: nonNegativeInt(input.subtotalPaise, "Subtotal", true),
            taxPaise: nonNegativeInt(input.taxPaise, "Tax", true),
            totalPaise: nonNegativeInt(input.totalPaise, "Invoice total", true),
            note: text(input.note, "Invoice note", 2000),
            status: "MAPPING",
          },
        });

        let allMapped = true;
        for (const rawLine of invoiceLines) {
          const quantity = positiveInt(rawLine.invoiceQuantity, "Invoice quantity");
          const styleCode = vendorStyle(rawLine.vendorStyleCode);
          const mapping = styleCode
            ? await tx.vendorProduct.findUnique({
                where: { vendorId_vendorStyleCode: { vendorId, vendorStyleCode: styleCode } },
                include: { packPattern: { orderBy: { position: "asc" } } },
              })
            : null;

          const requestedPoLineId = text(rawLine.purchaseOrderLineId, "PO line", 80);
          const poLine = requestedPoLineId && purchaseOrder
            ? purchaseOrder.lines.find((candidate) => candidate.id === requestedPoLineId)
            : purchaseOrder && styleCode
              ? purchaseOrder.lines.find((candidate) => vendorStyle(candidate.vendorStyleCode) === styleCode)
              : null;
          if (requestedPoLineId && !poLine) throw new BadRequestException("Invoice line does not belong to the selected PO");
          if (poLine) {
            const alreadyInvoiced = poLine.invoiceLines.reduce((sum, row) => sum + row.invoiceQuantity, 0);
            const remaining = Math.max(0, poLine.orderedQuantity - alreadyInvoiced);
            if (quantity > remaining) {
              throw new BadRequestException(
                "Invoice quantity " + quantity + " exceeds remaining PO quantity " + remaining + " for material " + (styleCode ?? poLine.vendorStyleCode),
              );
            }
          }

          const line = await tx.vendorInvoiceLine.create({
            data: {
              vendorInvoiceId: invoice.id,
              vendorProductId: mapping?.id ?? null,
              purchaseOrderLineId: poLine?.id ?? null,
              rawDescription: text(rawLine.rawDescription, "Invoice description", 500, true)!,
              vendorStyleCode: styleCode,
              hsn: text(rawLine.hsn, "HSN", 30) ?? mapping?.hsn ?? null,
              invoiceQuantity: quantity,
              unitCostPaise: nonNegativeInt(rawLine.unitCostPaise, "Unit cost", true) ?? mapping?.defaultUnitCostPaise ?? null,
              amountPaise: nonNegativeInt(rawLine.amountPaise, "Line amount", true),
              mappingConfirmed: Boolean(mapping),
            },
          });

          const explicit = this.validateBreakup(rawLine.explicitVariants ?? [], "Invoice size breakup", false);
          const manual = this.validateBreakup(rawLine.manualVariants ?? [], "Staff size breakup", false);
          if (explicit.length && manual.length) throw new BadRequestException("Use either invoice sizes or staff size breakup, not both");
          const breakup = explicit.length ? explicit : manual;
          const breakupSource = explicit.length ? "EXPLICIT_INVOICE" : "MANUAL";
          if (breakup.length) {
            if (!mapping) {
              allMapped = false;
              continue;
            }
            const mappedProduct = await tx.vendorProduct.findUnique({
              where: { id: mapping.id },
              include: { product: { select: { variants: { select: { id: true } } } } },
            });
            const allowed = new Set(mappedProduct?.product.variants.map((variant) => variant.id) ?? []);
            if (breakup.some((entry) => !allowed.has(entry.variantId))) {
              throw new BadRequestException("Explicit invoice size breakup contains a variant outside the mapped HIDI product");
            }
            this.assertBreakupTotal(breakup, quantity, explicit.length ? "Invoice size breakup" : "Staff size breakup");
            await tx.vendorInvoiceExpectedVariant.createMany({
              data: breakup.map((entry) => ({
                invoiceLineId: line.id,
                variantId: entry.variantId,
                expectedQuantity: entry.quantity,
                source: breakupSource,
              })),
            });
            await tx.vendorInvoiceLine.update({
              where: { id: line.id },
              data: { breakupSource, mappingConfirmed: Boolean(mapping) },
            });
          } else if (poLine?.variants?.length && quantity === poLine.orderedQuantity) {
            await tx.vendorInvoiceExpectedVariant.createMany({
              data: poLine.variants.map((entry) => ({
                invoiceLineId: line.id,
                variantId: entry.variantId,
                expectedQuantity: entry.orderedQuantity,
                source: "MANUAL",
              })),
            });
            await tx.vendorInvoiceLine.update({
              where: { id: line.id },
              data: { breakupSource: "MANUAL", mappingConfirmed: Boolean(mapping) },
            });
          } else if (mapping?.packPattern.length) {
            const packTotal = mapping.packPattern.reduce((sum, entry) => sum + entry.quantity, 0);
            if (packTotal > 0 && quantity % packTotal === 0) {
              const multiplier = quantity / packTotal;
              await tx.vendorInvoiceExpectedVariant.createMany({
                data: mapping.packPattern.map((entry) => ({
                  invoiceLineId: line.id,
                  variantId: entry.variantId,
                  expectedQuantity: entry.quantity * multiplier,
                  source: "PACK_PATTERN",
                })),
              });
              await tx.vendorInvoiceLine.update({
                where: { id: line.id },
                data: { breakupSource: "PACK_PATTERN", mappingConfirmed: true },
              });
            } else {
              allMapped = false;
            }
          } else {
            allMapped = false;
          }
        }

        await tx.vendorInvoice.update({
          where: { id: invoice.id },
          data: { status: allMapped ? "AWAITING_STOCK" : "MAPPING" },
        });

        return this.invoice(tx, invoice.id);
      });
    } catch (error: any) {
      if (error?.code === "P2002") throw new ConflictException("This vendor invoice number already exists for the selected vendor");
      throw error;
    }
  }

  async setInvoiceLineBreakup(
    invoiceLineId: string,
    input: { vendorProductId?: string; variants?: VariantBreakupInput[] },
  ) {
    const variants = this.validateBreakup(input?.variants ?? [], "Expected size breakup", true);

    return this.prisma.$transaction(async (tx) => {
      const line = await tx.vendorInvoiceLine.findUnique({
        where: { id: invoiceLineId },
        include: { vendorInvoice: true },
      });
      if (!line) throw new NotFoundException("Vendor invoice line not found");

      const vendorProductId = text(input?.vendorProductId, "Vendor product mapping", 80) ?? line.vendorProductId;
      if (!vendorProductId) throw new BadRequestException("Map this invoice line to a vendor product first");

      const mapping = await tx.vendorProduct.findFirst({
        where: { id: vendorProductId, vendorId: line.vendorInvoice.vendorId },
        include: { product: { select: { variants: { select: { id: true } } } } },
      });
      if (!mapping) throw new BadRequestException("Vendor product mapping does not belong to this invoice vendor");

      const allowed = new Set(mapping.product.variants.map((variant) => variant.id));
      if (variants.some((entry) => !allowed.has(entry.variantId))) {
        throw new BadRequestException("Expected breakup can use only variants from the mapped HIDI product");
      }
      this.assertBreakupTotal(variants, line.invoiceQuantity, "Expected size breakup");

      await tx.vendorInvoiceExpectedVariant.deleteMany({ where: { invoiceLineId } });
      await tx.vendorInvoiceExpectedVariant.createMany({
        data: variants.map((entry) => ({
          invoiceLineId,
          variantId: entry.variantId,
          expectedQuantity: entry.quantity,
          source: "MANUAL",
        })),
      });
      await tx.vendorInvoiceLine.update({
        where: { id: invoiceLineId },
        data: {
          vendorProductId,
          mappingConfirmed: true,
          breakupSource: "MANUAL",
        },
      });

      await this.refreshInvoiceStatus(tx, line.vendorInvoiceId);
      return this.invoice(tx, line.vendorInvoiceId);
    });
  }

  async traceOrder(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        customerInvoice: true,
        items: {
          orderBy: { id: "asc" },
          include: {
            stockAllocations: {
              include: {
                stockLot: {
                  include: {
                    receiptLine: {
                      include: {
                        receipt: {
                          include: {
                            vendorInvoice: { include: { vendor: true, purchaseOrder: { select: { poNumber: true } } } },
                            purchaseOrder: { select: { poNumber: true } },
                          },
                        },
                      },
                    },
                    vendorInvoiceLine: {
                      include: {
                        vendorProduct: {
                          include: { vendor: true, product: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    return {
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      customerInvoice: order.customerInvoice,
      items: order.items.map((item) => ({
        orderItemId: item.id,
        productName: item.productName,
        sku: item.sku,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        sources: item.stockAllocations.map((allocation) => {
          const lot = allocation.stockLot;
          const receipt = lot.receiptLine.receipt;
          const invoiceLine = lot.vendorInvoiceLine;
          const vendorInvoice = receipt.vendorInvoice;
          return {
            quantity: allocation.quantity,
            lotCode: lot.lotCode,
            grn: receipt.receiptNumber,
            receivedAt: receipt.receivedAt,
            vendor: vendorInvoice?.vendor?.name ?? invoiceLine?.vendorProduct?.vendor?.name ?? receipt.supplierName,
            vendorCode: vendorInvoice?.vendor?.code ?? invoiceLine?.vendorProduct?.vendor?.code ?? null,
            vendorInvoiceNumber: vendorInvoice?.invoiceNumber ?? receipt.invoiceNumber,
            vendorInvoiceDate: vendorInvoice?.invoiceDate ?? null,
            purchaseOrderNumber: vendorInvoice?.purchaseOrder?.poNumber ?? receipt.purchaseOrder?.poNumber ?? receipt.purchaseOrderNumber,
            purchaseReference: vendorInvoice?.purchaseReference ?? receipt.purchaseOrderNumber,
            vendorStyleCode: invoiceLine?.vendorStyleCode ?? invoiceLine?.vendorProduct?.vendorStyleCode ?? null,
            hidiProductCode: invoiceLine?.vendorProduct?.product?.internalCode ?? null,
            hidiProduct: invoiceLine?.vendorProduct?.product?.name ?? item.productName,
          };
        }),
      })),
    };
  }

  private validateBreakup(values: VariantBreakupInput[], label: string, required: boolean) {
    if (!Array.isArray(values)) throw new BadRequestException(label + " must be a list");
    const result = values
      .map((entry) => ({
        variantId: text(entry?.variantId, label + " variant", 80, true)!,
        quantity: positiveInt(entry?.quantity, label + " quantity"),
      }));
    if (required && result.length === 0) throw new BadRequestException(label + " is required");
    const seen = new Set<string>();
    for (const row of result) {
      if (seen.has(row.variantId)) throw new BadRequestException(label + " contains the same variant more than once");
      seen.add(row.variantId);
    }
    return result;
  }

  private assertBreakupTotal(values: Array<{ quantity: number }>, expected: number, label: string) {
    const total = values.reduce((sum, row) => sum + row.quantity, 0);
    if (total !== expected) {
      throw new BadRequestException(label + " totals " + total + " but invoice quantity is " + expected);
    }
  }

  private async refreshInvoiceStatus(tx: Prisma.TransactionClient, invoiceId: string) {
    const invoice = await tx.vendorInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: {
          include: {
            expectedVariants: true,
            receiptLines: true,
          },
        },
      },
    });
    if (!invoice) return;

    const mapped = invoice.lines.every(
      (line) =>
        line.mappingConfirmed &&
        line.expectedVariants.reduce((sum, row) => sum + row.expectedQuantity, 0) === line.invoiceQuantity,
    );
    if (!mapped) {
      await tx.vendorInvoice.update({ where: { id: invoiceId }, data: { status: "MAPPING" } });
      return;
    }

    const invoiced = invoice.lines.reduce((sum, line) => sum + line.invoiceQuantity, 0);
    const received = invoice.lines.reduce(
      (sum, line) => sum + line.receiptLines.reduce((n, row) => n + row.acceptedQuantity + row.rejectedQuantity, 0),
      0,
    );
    const accepted = invoice.lines.reduce(
      (sum, line) => sum + line.receiptLines.reduce((n, row) => n + row.acceptedQuantity, 0),
      0,
    );

    const status =
      received === 0
        ? "AWAITING_STOCK"
        : received < invoiced
          ? "PARTIALLY_RECEIVED"
          : accepted === invoiced
            ? "RECONCILED"
            : "RECEIVED";

    await tx.vendorInvoice.update({ where: { id: invoiceId }, data: { status } });
  }

  private invoice(tx: Prisma.TransactionClient, invoiceId: string) {
    return tx.vendorInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        receipts: { orderBy: { receivedAt: "asc" } },
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            vendorProduct: {
              include: {
                product: { select: { id: true, name: true, slug: true } },
              },
            },
            expectedVariants: {
              orderBy: [{ variant: { color: "asc" } }, { variant: { size: "asc" } }],
              include: { variant: true },
            },
            receiptLines: {
              include: {
                receipt: { select: { id: true, receiptNumber: true, receivedAt: true, status: true } },
                variant: { select: { id: true, sku: true, color: true, size: true } },
              },
            },
          },
        },
      },
    });
  }
}
