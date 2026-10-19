import { Router } from "express";
import { prisma, databaseEnabled } from "../db.js";
import { requireAuth } from "../auth.js";
import { addressSchema, guestCartSchema, parse } from "../validation.js";

const router = Router();
const productInclude = { product: { include: { category: true } } };

async function ensureCart(userId) {
  return prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
}

async function ensureWishlist(userId) {
  return prisma.wishlist.upsert({ where: { userId }, create: { userId }, update: {} });
}

router.get("/cart", requireAuth, async (req, res, next) => {
  try {
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id }, include: { items: { include: productInclude } } });
    return res.json({ items: cart?.items.map(item => ({ productId: item.productId, quantity: item.quantity, product: item.product })) || [] });
  } catch (error) {
    return next(error);
  }
});

router.post("/cart/items", requireAuth, async (req, res, next) => {
  try {
    const input = parse(guestCartSchema.shape.items.element, req.body);
    const [cart, product] = await Promise.all([
      ensureCart(req.user.id),
      prisma.product.findFirst({ where: { id: input.productId, active: true } }),
    ]);
    if (!product || product.stock < input.quantity) return res.status(409).json({ error: product ? `Only ${product.stock} left in stock.` : "This product is no longer available." });
    const existing = await prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: input.productId } } });
    const quantity = (existing?.quantity || 0) + input.quantity;
    if (quantity > product.stock) return res.status(409).json({ error: `Only ${product.stock} available; your cart already has ${existing.quantity}.` });
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: input.productId } },
      create: { cartId: cart.id, productId: input.productId, quantity },
      update: { quantity },
    });
    return res.status(existing ? 200 : 201).json({ item: { productId: product.id, quantity } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/cart/items/:productId", requireAuth, async (req, res, next) => {
  try {
    const productId = Number.parseInt(req.params.productId, 10);
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ error: "Invalid product or quantity." });
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    const item = cart && await prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } }, include: { product: true } });
    if (!item) return res.status(404).json({ error: "Cart item not found." });
    if (quantity > item.product.stock) return res.status(409).json({ error: `Only ${item.product.stock} left in stock.` });
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return res.json({ productId, quantity });
  } catch (error) {
    return next(error);
  }
});

router.delete("/cart/items/:productId", requireAuth, async (req, res, next) => {
  try {
    const productId = Number.parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Invalid product ID." });
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post("/cart/merge", requireAuth, async (req, res, next) => {
  try {
    const { items } = parse(guestCartSchema, req.body);
    const cart = await ensureCart(req.user.id);

    const productIds = [...new Set(items.map((item) => item.productId))];

    // Fetch products and existing cart items in parallel.
    const [products, existingItems] = await Promise.all([
      prisma.product.findMany({
        where: {
          id: { in: productIds },
          active: true,
        },
      }),
      prisma.cartItem.findMany({
        where: {
          cartId: cart.id,
          productId: { in: productIds },
        },
      }),
    ]);

    const productMap = new Map(
      products.map((product) => [product.id, product])
    );

    const existingMap = new Map(
      existingItems.map((item) => [item.productId, item])
    );

    let syncedCount = 0;
    const operations = [];

    for (const input of items) {
      const product = productMap.get(input.productId);

      if (!product || product.stock < 1) {
        continue;
      }

      const existing = existingMap.get(input.productId);

      // Preserve the larger quantity without double-counting.
      const quantity = Math.min(
        product.stock,
        Math.max(existing?.quantity || 0, input.quantity)
      );

      syncedCount += quantity;

      operations.push(
        prisma.cartItem.upsert({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: input.productId,
            },
          },
          create: {
            cartId: cart.id,
            productId: input.productId,
            quantity,
          },
          update: {
            quantity,
          },
        })
      );
    }

    // Execute cart updates together in one transaction.
    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }

    const saved = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: productInclude,
        },
      },
    });

    return res.json({
      items: saved.items,
      syncedCount,
      skippedCount: items.length - operations.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/wishlist", requireAuth, async (req, res, next) => {
  try {
    const wishlist = await prisma.wishlist.findUnique({ where: { userId: req.user.id }, include: { items: { include: productInclude } } });
    return res.json({ items: wishlist?.items || [] });
  } catch (error) {
    return next(error);
  }
});

router.post("/wishlist/items", requireAuth, async (req, res, next) => {
  try {
    const productId = Number(req.body?.productId);
    if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ error: "Invalid product ID." });
    const product = await prisma.product.findFirst({ where: { id: productId, active: true } });
    if (!product) return res.status(404).json({ error: "Product not found." });
    const wishlist = await ensureWishlist(req.user.id);
    await prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
      create: { wishlistId: wishlist.id, productId },
      update: {},
    });
    return res.status(201).json({ productId });
  } catch (error) {
    return next(error);
  }
});

router.post("/wishlist/merge", requireAuth, async (req, res, next) => {
  try {
    const productIds = Array.isArray(req.body?.productIds) ? [...new Set(req.body.productIds.map(Number).filter(Number.isInteger))].slice(0, 100) : [];
    const wishlist = await ensureWishlist(req.user.id);
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true }, select: { id: true } });
    const validIds = products.map(product => product.id);
    const operations = validIds.map(productId => prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
      create: { wishlistId: wishlist.id, productId },
      update: {},
    }));
    if (operations.length) await prisma.$transaction(operations);
    return res.json({ syncedCount: validIds.length, skippedCount: productIds.length - validIds.length });
  } catch (error) {
    return next(error);
  }
});

router.delete("/wishlist/items/:productId", requireAuth, async (req, res, next) => {
  try {
    const productId = Number.parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Invalid product ID." });
    const wishlist = await prisma.wishlist.findUnique({ where: { userId: req.user.id } });
    if (wishlist) await prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productId } });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, name: true, createdAt: true } });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

router.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Name must be between 2 and 100 characters." });
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { name }, select: { id: true, email: true, name: true } });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

router.get("/addresses", requireAuth, async (req, res, next) => {
  try {
    return res.json({ data: await prisma.address.findMany({ where: { userId: req.user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }) });
  } catch (error) {
    return next(error);
  }
});

router.post("/addresses", requireAuth, async (req, res, next) => {
  try {
    const input = parse(addressSchema, req.body);
    const address = await prisma.$transaction(async tx => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      const existingCount = await tx.address.count({ where: { userId: req.user.id } });
      return tx.address.create({ data: { ...input, isDefault: input.isDefault ?? existingCount === 0, userId: req.user.id } });
    });
    return res.status(201).json({ address });
  } catch (error) {
    return next(error);
  }
});

router.patch("/addresses/:id", requireAuth, async (req, res, next) => {
  try {
    const input = parse(addressSchema.partial(), req.body);
    const owned = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!owned) return res.status(404).json({ error: "Address not found." });
    const address = await prisma.$transaction(async tx => {
      if (input.isDefault) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id: owned.id }, data: input });
    });
    return res.json({ address });
  } catch (error) {
    return next(error);
  }
});

router.delete("/addresses/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    return result.count ? res.status(204).end() : res.status(404).json({ error: "Address not found." });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders", requireAuth, async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { items: true, shipment: true, payment: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ data: orders });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: true, shipment: true, payment: { select: { status: true, failureMessage: true } } },
    });
    return order ? res.json({ order }) : res.status(404).json({ error: "Order not found." });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: true, payment: true },
    });
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (order.status !== "PENDING_PAYMENT") return res.status(409).json({ error: "This order can no longer be cancelled online." });
    if (order.paymentStatus === "SUCCEEDED") return res.status(409).json({ error: "Paid orders require support to arrange a cancellation or refund." });
    const cancelled = await prisma.$transaction(async tx => {
      const changed = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED", paymentStatus: "FAILED" },
      });
      if (changed.count !== 1) return null;
      for (const item of order.items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      if (order.payment) await tx.payment.update({ where: { id: order.payment.id }, data: { status: "FAILED" } });
      return true;
    });
    return cancelled ? res.json({ status: "CANCELLED" }) : res.status(409).json({ error: "The order has already changed status." });
  } catch (error) {
    return next(error);
  }
});

export default router;
