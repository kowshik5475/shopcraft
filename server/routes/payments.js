import { Router } from "express";
import crypto from "node:crypto";
import Stripe from "stripe";
import { prisma, databaseEnabled } from "../db.js";
import { requireAuth } from "../auth.js";
import { parse, checkoutSchema } from "../validation.js";
import { calculateOrderAmounts, paymentIntentMatchesOrder } from "../commerce.js";

const router = Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const toOrderNumber = () => `SC-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

router.post("/create", requireAuth, async (req, res, next) => {
  try {
    if (!databaseEnabled) return res.status(503).json({ error: "Checkout requires PostgreSQL. Configure DATABASE_URL and run migrations." });
    if (!stripe) return res.status(503).json({ error: "Stripe test checkout is not configured. Add STRIPE_SECRET_KEY to the backend environment." });
    const input = parse(checkoutSchema, req.body);
    const quantities = new Map();
    for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
    const lines = [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    if (lines.some(line => line.quantity > 99)) return res.status(400).json({ error: "A product quantity cannot exceed 99." });

    let order = await prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId: req.user.id, idempotencyKey: input.idempotencyKey } },
      include: { payment: true },
    });
    if (order && ["CANCELLED", "REFUNDED"].includes(order.status)) {
      return res.status(409).json({ error: "This payment attempt was cancelled. Start a new checkout attempt.", restartCheckout: true });
    }
    if (order?.payment?.providerPaymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(order.payment.providerPaymentIntentId);
      if (intent.status === "canceled") {
        return res.status(409).json({ error: "This payment attempt was cancelled. Start a new checkout attempt.", restartCheckout: true });
      }
      return res.json({ orderId: order.id, orderNumber: order.orderNumber, clientSecret: intent.client_secret, totalCents: order.totalCents, reused: true });
    }
    if (order) return res.status(409).json({ error: "This checkout attempt could not be resumed. Start a new checkout." });

    const products = await prisma.product.findMany({ where: { id: { in: lines.map(line => line.productId) }, active: true } });
    const byId = new Map(products.map(product => [product.id, product]));
    const resolved = lines.map(line => {
      const product = byId.get(line.productId);
      if (!product) {
        const error = new Error("One or more products are no longer available.");
        error.statusCode = 409;
        throw error;
      }
      if (product.stock < line.quantity) {
        const error = new Error(`Only ${product.stock} left in stock for ${product.name}.`);
        error.statusCode = 409;
        throw error;
      }
      return { ...line, product, priceCents: product.priceCents };
    });
    const amounts = calculateOrderAmounts(resolved);

    order = await prisma.$transaction(async tx => {
      for (const line of resolved) {
        const reserved = await tx.product.updateMany({
          where: { id: line.productId, active: true, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (reserved.count !== 1) {
          const fresh = await tx.product.findUnique({ where: { id: line.productId } });
          const error = new Error(`Only ${fresh?.stock || 0} left in stock for ${line.product.name}.`);
          error.statusCode = 409;
          throw error;
        }
      }
      return tx.order.create({
        data: {
          orderNumber: toOrderNumber(),
          userId: req.user.id,
          idempotencyKey: input.idempotencyKey,
          ...amounts,
          shippingAddress: input.shippingAddress,
          stockReservedUntil: new Date(Date.now() + 30 * 60 * 1000),
          items: {
            create: resolved.map(line => ({
              productId: line.productId,
              productName: line.product.name,
              unitPriceCents: line.priceCents,
              quantity: line.quantity,
            })),
          },
          payment: {
            create: {
              amountCents: amounts.totalCents,
              currency: "usd",
            },
          },
        },
        include: { payment: true },
      });
    });

    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: order.totalCents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: { orderId: order.id, orderNumber: order.orderNumber, userId: req.user.id },
        },
        { idempotencyKey: `shopcraft-${order.id}` },
      );
      await prisma.payment.update({
        where: { orderId: order.id },
        data: { providerPaymentIntentId: intent.id },
      });
      return res.status(201).json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientSecret: intent.client_secret,
        totalCents: order.totalCents,
      });
    } catch (error) {
      await prisma.$transaction(async tx => {
        for (const line of resolved) await tx.product.update({ where: { id: line.productId }, data: { stock: { increment: line.quantity } } });
        await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", paymentStatus: "FAILED" } });
        await tx.payment.update({ where: { orderId: order.id }, data: { status: "FAILED", failureMessage: "Payment setup could not be completed." } });
      });
      return next(error);
    }
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "This checkout attempt was already submitted. Refresh your order summary." });
    return next(error);
  }
});

router.post("/verify", requireAuth, async (req, res, next) => {
  try {
    const orderId = String(req.body?.orderId || "");
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { payment: true },
    });
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (!stripe || !order.payment?.providerPaymentIntentId) return res.status(503).json({ error: "Payment verification is unavailable." });
    const intent = await stripe.paymentIntents.retrieve(order.payment.providerPaymentIntentId);
    if (intent.status !== "succeeded") return res.status(202).json({ status: intent.status, orderStatus: order.status, paymentStatus: order.paymentStatus });
    // Payment fulfillment is webhook-driven. This endpoint reports Stripe's
    // status but never marks an order paid from a browser request.
    return res.status(202).json({ status: intent.status, orderStatus: order.status, paymentStatus: order.paymentStatus, awaitingWebhook: order.paymentStatus !== "SUCCEEDED" });
  } catch (error) {
    return next(error);
  }
});

export async function stripeWebhook(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send("Stripe webhook is not configured.");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send("Invalid webhook signature.");
  }

  try {
    let lateSuccessToRefund = null;
    await prisma.$transaction(async tx => {
      await tx.webhookEvent.create({ data: { providerEventId: event.id, eventType: event.type } });
      if (!event.type.startsWith("payment_intent.") && event.type !== "charge.refunded") return;
      const intent = event.data.object;
      const paymentIntentId = event.type === "charge.refunded" ? intent.payment_intent : intent.id;
      const payment = await tx.payment.findFirst({
        where: {
          OR: [
            ...(paymentIntentId ? [{ providerPaymentIntentId: paymentIntentId }] : []),
            ...(intent.metadata?.orderId ? [{ orderId: intent.metadata.orderId }] : []),
          ],
        },
        include: { order: true },
      });
      if (!payment) return;

      if (event.type === "charge.refunded" && intent.amount_refunded >= intent.amount) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
        await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "REFUNDED", status: "REFUNDED" } });
      } else if (event.type === "payment_intent.succeeded") {
        if (!paymentIntentMatchesOrder(intent, payment, payment.order)) {
          throw new Error("Stripe PaymentIntent amount or currency did not match the ShopCraft order.");
        }
        const confirmed = await tx.order.updateMany({
          where: { id: payment.orderId, status: "PENDING_PAYMENT" },
          data: { paymentStatus: "SUCCEEDED", status: "CONFIRMED" },
        });
        if (confirmed.count !== 1) {
          if (payment.order.status === "CANCELLED") lateSuccessToRefund = { paymentId: payment.id, orderId: payment.orderId, intentId: intent.id };
          return;
        }
        await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", failureMessage: null } });
        const cart = await tx.cart.findUnique({ where: { userId: payment.order.userId } });
        if (cart) {
          const quantities = await tx.orderItem.findMany({ where: { orderId: payment.orderId }, select: { productId: true, quantity: true } });
          for (const line of quantities) {
            const cartItem = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: line.productId } } });
            if (!cartItem) continue;
            if (cartItem.quantity > line.quantity) {
              await tx.cartItem.update({ where: { id: cartItem.id }, data: { quantity: cartItem.quantity - line.quantity } });
            } else {
              await tx.cartItem.delete({ where: { id: cartItem.id } });
            }
          }
        }
      } else if (event.type === "payment_intent.payment_failed") {
        // Stripe may deliver events out of order. Do not let a stale failed
        // attempt overwrite a Payment row after a later success confirmed the
        // order. The order transition is the guard for the matching payment
        // transition, keeping both statuses consistent.
        const failed = await tx.order.updateMany({
          where: { id: payment.orderId, status: "PENDING_PAYMENT", paymentStatus: { not: "SUCCEEDED" } },
          data: { paymentStatus: "FAILED" },
        });
        if (failed.count === 1) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "FAILED", failureMessage: intent.last_payment_error?.message?.slice(0, 240) || "Payment was not completed." },
          });
        }
      } else if (event.type === "payment_intent.canceled" && payment.order.status === "PENDING_PAYMENT") {
        const cancelled = await tx.order.updateMany({
          where: { id: payment.orderId, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED", paymentStatus: "FAILED" },
        });
        if (cancelled.count === 1) {
          const items = await tx.orderItem.findMany({ where: { orderId: payment.orderId } });
          for (const item of items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
          await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        }
      }
    });
    if (lateSuccessToRefund) {
      const refund = await stripe.refunds.create(
        { payment_intent: lateSuccessToRefund.intentId, reason: "requested_by_customer" },
        { idempotencyKey: `shopcraft-late-success-refund-${event.id}` },
      );
      if (refund.status === "succeeded") {
        await prisma.$transaction([
          prisma.payment.update({ where: { id: lateSuccessToRefund.paymentId }, data: { status: "REFUNDED" } }),
          prisma.order.update({ where: { id: lateSuccessToRefund.orderId }, data: { paymentStatus: "REFUNDED", status: "REFUNDED" } }),
        ]);
      } else if (refund.status === "pending") {
        await prisma.$transaction([
          prisma.payment.update({ where: { id: lateSuccessToRefund.paymentId }, data: { status: "PROCESSING" } }),
          prisma.order.update({ where: { id: lateSuccessToRefund.orderId }, data: { paymentStatus: "PROCESSING" } }),
        ]);
      } else if (refund.status === "failed") {
        await prisma.$transaction([
          prisma.payment.update({ where: { id: lateSuccessToRefund.paymentId }, data: { status: "SUCCEEDED" } }),
          prisma.order.update({ where: { id: lateSuccessToRefund.orderId }, data: { paymentStatus: "SUCCEEDED" } }),
        ]);
        console.error(`Stripe refund needs manual handling for cancelled order ${lateSuccessToRefund.orderId}.`);
      }
    }
    return res.json({ received: true });
  } catch (error) {
    if (error.code === "P2002") return res.json({ received: true, duplicate: true });
    await prisma.webhookEvent.deleteMany({ where: { providerEventId: event.id } }).catch(() => {});
    console.error("Stripe webhook processing failed:", error.message);
    return res.status(500).json({ error: "Webhook processing failed." });
  }
}

export default router;
