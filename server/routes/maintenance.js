import { Router } from "express";
import crypto from "node:crypto";
import { prisma, databaseEnabled } from "../db.js";

const router = Router();

function authorized(req) {
  const expected = process.env.SHOPCRAFT_CRON_SECRET || "";
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || suppliedBytes.length !== expectedBytes.length) return false;
  return crypto.timingSafeEqual(suppliedBytes, expectedBytes);
}

router.post("/expire-orders", async (req, res, next) => {
  try {
    if (!authorized(req)) return res.status(process.env.SHOPCRAFT_CRON_SECRET ? 401 : 503).json({ error: "Order cleanup is not authorized or configured." });
    if (!databaseEnabled) return res.status(503).json({ error: "Order cleanup requires PostgreSQL." });
    const now = new Date();
    const pending = await prisma.order.findMany({
      where: { status: "PENDING_PAYMENT", stockReservedUntil: { lte: now } },
      include: { items: true, payment: true },
      orderBy: { stockReservedUntil: "asc" },
      take: 100,
    });
    let releasedOrders = 0;
    for (const order of pending) {
      const released = await prisma.$transaction(async tx => {
        const changed = await tx.order.updateMany({
          where: { id: order.id, status: "PENDING_PAYMENT", stockReservedUntil: { lte: now } },
          data: { status: "CANCELLED", paymentStatus: "FAILED" },
        });
        if (changed.count !== 1) return false;
        for (const item of order.items) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
        if (order.payment) await tx.payment.update({ where: { id: order.payment.id }, data: { status: "FAILED" } });
        return true;
      });
      if (released) releasedOrders += 1;
    }
    return res.json({ examined: pending.length, released: releasedOrders });
  } catch (error) {
    return next(error);
  }
});

export default router;
