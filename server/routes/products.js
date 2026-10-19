import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { publicProduct, toCents } from "../catalog.js";
import { requireAuth } from "../auth.js";
import { parse, reviewSchema } from "../validation.js";

const router = Router();
export const categoryRouter = Router();
const getPage = value => Math.max(1, Number.parseInt(value || "1", 10) || 1);
const catalogCache = new Map();
const CACHE_TTL_MS = 15_000;

function getCached(key) {
  const entry = catalogCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    catalogCache.delete(key);
    return null;
  }
  catalogCache.delete(key);
  catalogCache.set(key, entry);
  return entry.value;
}

function setCached(key, value, ttl = CACHE_TTL_MS) {
  if (catalogCache.size >= 100) catalogCache.delete(catalogCache.keys().next().value);
  catalogCache.set(key, { value, expiresAt: Date.now() + ttl });
}

async function listCategories(_req, res, next) {
  try {
    const cached = getCached("categories");
    if (cached) return res.json(cached);
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: { where: { active: true } } } } } });
    const result = { data: categories.map(category => ({ id: category.id, name: category.name, slug: category.slug, count: category._count.products })) };
    setCached("categories", result, 5 * 60_000);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

router.get("/categories", listCategories);
categoryRouter.get("/", listCategories);

router.get("/", async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    if (search.length > 120 || category.length > 100) return res.status(400).json({ error: "Search or category value is too long." });
    const page = getPage(req.query.page);
    const pageSize = Math.min(Math.max(getPage(req.query.pageSize || "12"), 1), 60);
    const minPrice = req.query.minPrice !== undefined ? toCents(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice !== undefined ? toCents(req.query.maxPrice) : undefined;
    if ((minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
        (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
        (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)) {
      return res.status(400).json({ error: "Invalid product price range." });
    }
    const inStock = req.query.inStock === "true";
    const featured = req.query.featured === "true";
    const sort = String(req.query.sort || "newest");
    const cacheKey = JSON.stringify({ search, category, page, pageSize, minPrice, maxPrice, inStock, featured, sort });
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);


    const where = {
      active: true,
      ...(category ? { category: { name: { equals: category, mode: "insensitive" } } } : {}),
      ...(minPrice !== undefined || maxPrice !== undefined ? {
        priceCents: {
          ...(minPrice !== undefined ? { gte: minPrice } : {}),
          ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
        },
      } : {}),
      ...(inStock ? { stock: { gt: 0 } } : {}),
      ...(featured ? { featured: true } : {}),
    };
    const orderBy = sort === "price_asc" ? { priceCents: "asc" }
      : sort === "price_desc" ? { priceCents: "desc" }
      : sort === "name" ? { name: "asc" }
      : sort === "rating" ? { rating: "desc" }
      : sort === "popularity" ? { reviewCount: "desc" }
      : { createdAt: "desc" };

    if (search) {
      const filters = [
        Prisma.sql`p."active" = true`,
        Prisma.sql`to_tsvector('english', coalesce(p."name",'') || ' ' || coalesce(p."description",'')) @@ websearch_to_tsquery('english', ${search})`,
      ];
      if (category) filters.push(Prisma.sql`lower(c."name") = lower(${category})`);
      if (minPrice !== undefined) filters.push(Prisma.sql`p."priceCents" >= ${minPrice}`);
      if (maxPrice !== undefined) filters.push(Prisma.sql`p."priceCents" <= ${maxPrice}`);
      if (inStock) filters.push(Prisma.sql`p."stock" > 0`);
      if (featured) filters.push(Prisma.sql`p."featured" = true`);
      const condition = Prisma.join(filters, " AND ");
      const orderSql = sort === "price_asc" ? Prisma.sql`p."priceCents" ASC`
        : sort === "price_desc" ? Prisma.sql`p."priceCents" DESC`
        : sort === "name" ? Prisma.sql`p."name" ASC`
        : sort === "rating" ? Prisma.sql`p."rating" DESC`
        : sort === "popularity" ? Prisma.sql`p."reviewCount" DESC`
        : Prisma.sql`p."createdAt" DESC`;
      const [idRows, countRows] = await prisma.$transaction([
        prisma.$queryRaw(Prisma.sql`
          SELECT p."id" FROM "Product" p
          JOIN "Category" c ON c."id" = p."categoryId"
          WHERE ${condition}
          ORDER BY ${orderSql}, p."id" ASC
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
        `),
        prisma.$queryRaw(Prisma.sql`
          SELECT COUNT(*)::int AS "total" FROM "Product" p
          JOIN "Category" c ON c."id" = p."categoryId"
          WHERE ${condition}
        `),
      ]);
      const ids = idRows.map(row => row.id);
      const pageRows = ids.length
        ? await prisma.product.findMany({ where: { id: { in: ids } }, include: { category: true } })
        : [];
      const byId = new Map(pageRows.map(product => [product.id, product]));
      const result = {
        data: ids.map(id => publicProduct(byId.get(id))),
        total: Number(countRows[0]?.total || 0),
        page,
        pageSize,
        source: "database",
      };
      setCached(cacheKey, result);
      return res.json(result);
    }

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({ where, include: { category: true }, orderBy: [orderBy, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.product.count({ where }),
    ]);
    const result = { data: rows.map(publicProduct), total, page, pageSize, source: "database" };
    setCached(cacheKey, result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/related", async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid product ID." });
    const current = await prisma.product.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: "Product not found." });
    const rows = await prisma.product.findMany({ where: { active: true, categoryId: current.categoryId, id: { not: id } }, include: { category: true }, orderBy: { rating: "desc" }, take: 4 });
    return res.json({ data: rows.map(publicProduct) });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/reviews", async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid product ID." });
    const reviews = await prisma.review.findMany({ where: { productId: id }, select: { id: true, rating: true, title: true, body: true, verified: true, createdAt: true, user: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
    return res.json({ data: reviews });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/reviews", requireAuth, async (req, res, next) => {
  try {
    const productId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Invalid product ID." });
    const input = parse(reviewSchema, req.body);
    const purchased = await prisma.orderItem.findFirst({
      where: { productId, order: { userId: req.user.id, paymentStatus: "SUCCEEDED" } },
    });
    if (!purchased) return res.status(403).json({ error: "Reviews are available to customers who purchased this item." });
    const review = await prisma.review.create({ data: { ...input, productId, userId: req.user.id, verified: true } });
    const aggregate = await prisma.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: { rating: true } });
    await prisma.product.update({ where: { id: productId }, data: { rating: aggregate._avg.rating || 0, reviewCount: aggregate._count.rating } });
    return res.status(201).json({ review });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "You have already reviewed this product." });
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid product ID." });
    const product = await prisma.product.findFirst({ where: { id, active: true }, include: { category: true } });
    return product ? res.json({ product: publicProduct(product) }) : res.status(404).json({ error: "Product not found." });
  } catch (error) {
    return next(error);
  }
});

export default router;
