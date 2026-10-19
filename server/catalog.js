import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const sourcePath = fileURLToPath(new URL("../data/products.js", import.meta.url));
let cached;

export async function getLocalCatalog() {
  if (cached) return cached;
  const source = await readFile(sourcePath, "utf8");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(`${source}\nmodule.exports = { PRODUCTS, CATEGORIES };`, sandbox, { timeout: 1000 });
  cached = sandbox.module.exports;
  return cached;
}

export function publicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.priceCents != null ? product.priceCents / 100 : product.price),
    category: typeof product.category === "string" ? product.category : product.category?.name || "",
    description: product.description,
    imageUrl: product.imageUrl,
    stock: product.stock,
    rating: product.rating,
    reviewCount: product.reviewCount,
    badge: product.badge || null,
    featured: product.featured,
  };
}

export function toCents(value) {
  return Math.round(Number(value) * 100);
}
