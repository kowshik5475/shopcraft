import { Router } from "express";
import crypto from "node:crypto";
import { prisma, databaseEnabled } from "../db.js";
import { requireAuth } from "../auth.js";
import { parse, checkoutSchema } from "../validation.js";
import { calculateOrderAmounts } from "../commerce.js";

const router = Router();
const toOrderNumber = () => `SC-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

// This is an explicitly simulated student-project payment flow. No money is charged.
router.post("/create", requireAuth, async (req, res, next) => {
  try {
    if (!databaseEnabled) return res.status(503).json({ error: "Checkout requires PostgreSQL. Configure DATABASE_URL and run migrations." });
    const input = parse(checkoutSchema, req.body);
    const quantities = new Map();
    for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
    const lines = [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    if (lines.some(line => line.quantity > 99)) return res.status(400).json({ error: "A product quantity cannot exceed 99." });

    const existing = await prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId: req.user.id, idempotencyKey: input.idempotencyKey } },
      include: { payment: true },
    });
    if (existing) {
      if (["CANCELLED", "REFUNDED"].includes(existing.status)) return res.status(409).json({ error: "This checkout attempt ended. Start a new checkout.", restartCheckout: true });
      return res.json({ orderId: existing.id, orderNumber: existing.orderNumber, totalCents: existing.totalCents, paymentStatus: existing.paymentStatus, simulated: true, reused: true });
    }

    const products = await prisma.product.findMany({ where: { id: { in: lines.map(line => line.productId) }, active: true } });
    const byId = new Map(products.map(product => [product.id, product]));
    const resolved = lines.map(line => {
      const product = byId.get(line.productId);
      if (!product) { const error = new Error("One or more products are no longer available."); error.statusCode = 409; throw error; }
      if (product.stock < line.quantity) { const error = new Error(`Only ${product.stock} left in stock for ${product.name}.`); error.statusCode = 409; throw error; }
      return { ...line, product, priceCents: product.priceCents };
    });
    const amounts = calculateOrderAmounts(resolved);
    const order = await prisma.$transaction(async tx => {
      for (const line of resolved) {
        const reserved = await tx.product.updateMany({ where: { id: line.productId, active: true, stock: { gte: line.quantity } }, data: { stock: { decrement: line.quantity } } });
        if (reserved.count !== 1) { const fresh = await tx.product.findUnique({ where: { id: line.productId } }); const error = new Error(`Only ${fresh?.stock || 0} left in stock for ${line.product.name}.`); error.statusCode = 409; throw error; }
      }
      return tx.order.create({ data: {
        orderNumber: toOrderNumber(), userId: req.user.id, idempotencyKey: input.idempotencyKey,
        ...amounts, shippingAddress: input.shippingAddress,
        stockReservedUntil: new Date(Date.now() + 30 * 60 * 1000),
        items: { create: resolved.map(line => ({ productId: line.productId, productName: line.product.name, unitPriceCents: line.priceCents, quantity: line.quantity })) },
        payment: { create: { amountCents: amounts.totalCents, currency: "usd", provider: "simulated" } },
      }, include: { payment: true } });
    });
    return res.status(201).json({ orderId: order.id, orderNumber: order.orderNumber, totalCents: order.totalCents, paymentStatus: order.paymentStatus, simulated: true, notice: "SIMULATED PAYMENT ONLY — no money has been charged." });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "This checkout attempt was already submitted. Refresh your order summary." });
    return next(error);
  }
});

router.post("/simulate", requireAuth, async (req, res, next) => {
  try {
    if (!databaseEnabled) return res.status(503).json({ error: "Simulated checkout requires PostgreSQL." });
    const orderId = String(req.body?.orderId || "");
    const outcome = String(req.body?.outcome || "");
    if (!orderId || !["success", "failure"].includes(outcome)) return res.status(400).json({ error: "Provide orderId and outcome 'success' or 'failure'." });
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, userId: req.user.id }, include: { items: true, payment: true } });
      if (!order) return { status: 404, body: { error: "Order not found." } };
      if (order.paymentStatus === "SUCCEEDED" && order.status === "CONFIRMED") return { status: 200, body: { simulated: true, status: "SUCCEEDED", orderStatus: "CONFIRMED", orderNumber: order.orderNumber, notice: "This simulated payment was already completed. No money was charged." } };
      if (order.status !== "PENDING_PAYMENT" || order.paymentStatus !== "REQUIRES_PAYMENT") return { status: 409, body: { error: "This order is no longer awaiting simulated payment." } };
      if (!order.payment) return { status: 409, body: { error: "Payment record not found for this order." } };
      if (outcome === "success") {
        const changed = await tx.order.updateMany({ where: { id: order.id, userId: req.user.id, status: "PENDING_PAYMENT", paymentStatus: "REQUIRES_PAYMENT" }, data: { status: "CONFIRMED", paymentStatus: "SUCCEEDED" } });
        if (changed.count !== 1) return { status: 409, body: { error: "Order status changed. Refresh and try again." } };
        await tx.payment.update({ where: { id: order.payment.id }, data: { status: "SUCCEEDED", failureMessage: null, provider: "simulated" } });
        return { status: 200, body: { simulated: true, status: "SUCCEEDED", orderStatus: "CONFIRMED", orderNumber: order.orderNumber, notice: "SIMULATED SUCCESS — no real payment was processed." } };
      }
      const changed = await tx.order.updateMany({ where: { id: order.id, userId: req.user.id, status: "PENDING_PAYMENT", paymentStatus: "REQUIRES_PAYMENT" }, data: { status: "CANCELLED", paymentStatus: "FAILED" } });
      if (changed.count !== 1) return { status: 409, body: { error: "Order status changed. Refresh and try again." } };
      for (const item of order.items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      await tx.payment.update({ where: { id: order.payment.id }, data: { status: "FAILED", failureMessage: "Simulated payment failure; no money was charged.", provider: "simulated" } });
      return { status: 200, body: { simulated: true, status: "FAILED", orderStatus: "CANCELLED", orderNumber: order.orderNumber, notice: "SIMULATED FAILURE — no real payment was processed; reserved stock was released." } };
    });
    return res.status(result.status).json(result.body);
  } catch (error) { return next(error); }
});

router.post("/verify", requireAuth, async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: String(req.body?.orderId || ""), userId: req.user.id }, include: { payment: true } });
    if (!order) return res.status(404).json({ error: "Order not found." });
    return res.json({ simulated: true, orderStatus: order.status, paymentStatus: order.paymentStatus, notice: "This project uses simulated payments only. No money is charged." });
  } catch (error) { return next(error); }
});

export default router;
