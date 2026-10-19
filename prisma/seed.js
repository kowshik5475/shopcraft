import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const productsFile = fileURLToPath(new URL("../data/products.js", import.meta.url));

async function loadLegacyProducts() {
  const source = await readFile(productsFile, "utf8");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(`${source}\nmodule.exports = { PRODUCTS, CATEGORIES };`, sandbox, { timeout: 1000 });
  return sandbox.module.exports;
}

async function main() {
  const { PRODUCTS, CATEGORIES } = await loadLegacyProducts();
  const categoryIds = new Map();
  for (const name of CATEGORIES) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const category = await prisma.category.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
    categoryIds.set(name, category.id);
  }

  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        name: product.name,
        description: product.description,
        priceCents: Math.round(product.price * 100),
        imageUrl: product.imageUrl,
        ...(product.badge !== undefined ? { badge: product.badge } : {}),
        featured: product.featured,
        active: true,
        categoryId: categoryIds.get(product.category),
      },
      create: {
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: Math.round(product.price * 100),
        imageUrl: product.imageUrl,
        stock: product.stock,
        rating: product.rating,
        reviewCount: product.reviewCount,
        badge: product.badge || null,
        featured: product.featured,
        categoryId: categoryIds.get(product.category),
      },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories and ${PRODUCTS.length} ShopCraft products.`);
}

main()
  .catch(error => {
    console.error("ShopCraft seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
