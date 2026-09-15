import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const items = [
  { name: "Mahira Indigo Kurta Set", slug: "mahira-indigo-kurta-set", color: "Indigo", pricePaise: 189000, collections: ["new-arrivals", "work-edit"] },
  { name: "Aara Sage Work Kurta", slug: "aara-sage-work-kurta", color: "Sage", pricePaise: 129000, collections: ["new-arrivals", "work-edit", "everyday"] },
  { name: "Meher Wine Co-ord", slug: "meher-wine-coord", color: "Wine", pricePaise: 169000, collections: ["new-arrivals", "occasion"] },
  { name: "Sana Sand Kurta Set", slug: "sana-sand-kurta-set", color: "Sand", pricePaise: 149000, collections: ["new-arrivals", "everyday"] },
] as const;

async function main() {
  const category = await prisma.category.upsert({
    where: { slug: "ethnic-wear" },
    update: {},
    create: { name: "Ethnic Wear", slug: "ethnic-wear", position: 1 },
  });

  const collectionDefs = [
    ["New Arrivals", "new-arrivals", "Fresh HIDI pieces, added in small considered edits."],
    ["Work Edit", "work-edit", "Polished Indian wear for meetings, commutes and everything after."],
    ["Everyday", "everyday", "Easy silhouettes designed for repeat wear."],
    ["Occasion", "occasion", "Elevated colour and detail, without the noise."],
  ] as const;
  const collectionMap = new Map<string, string>();
  for (let i = 0; i < collectionDefs.length; i++) {
    const [name, slug, description] = collectionDefs[i];
    const collection = await prisma.collection.upsert({
      where: { slug }, update: { name, description, active: true, position: i + 1 },
      create: { name, slug, description, position: i + 1 },
    });
    collectionMap.set(slug, collection.id);
  }

  for (const item of items) {
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { categoryId: category.id, status: "ACTIVE" },
      create: {
        name: item.name,
        slug: item.slug,
        categoryId: category.id,
        status: "ACTIVE",
        featuredRank: 10,
        shortDescription: "A refined HIDI everyday piece.",
        description: "Designed around real routines, clean lines and comfortable repeat wear.",
        images: { create: [{ url: `/products/${item.slug}-1.jpg`, alt: item.name, position: 1 }] },
      },
    });

    for (const collectionSlug of item.collections) {
      const collectionId = collectionMap.get(collectionSlug)!;
      await prisma.productCollection.upsert({
        where: { productId_collectionId: { productId: product.id, collectionId } },
        update: {}, create: { productId: product.id, collectionId },
      });
    }

    for (const size of ["M", "L", "XL", "XXL"]) {
      const sku = `HIDI-${item.slug.slice(0, 8).toUpperCase()}-${item.color.toUpperCase()}-${size}`;
      const variant = await prisma.productVariant.upsert({
        where: { sku },
        update: { pricePaise: item.pricePaise, mrpPaise: item.pricePaise, active: true },
        create: {
          productId: product.id, sku, size, color: item.color,
          mrpPaise: item.pricePaise, pricePaise: item.pricePaise,
        },
      });
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        update: {},
        create: { variantId: variant.id, onHand: 12, reserved: 0, safetyStock: 1 },
      });
    }
  }
}

main().finally(() => prisma.$disconnect());
