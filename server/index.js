import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseEnabled, disconnectDatabase, prisma } from "./db.js";
import authRoutes from "./routes/auth.js";
import productRoutes, { categoryRouter } from "./routes/products.js";
import customerRoutes from "./routes/customer.js";
import paymentRoutes from "./routes/payments.js";
import maintenanceRoutes from "./routes/maintenance.js";
import { getAppOrigin } from "./config.js";

const app = express();
const port = Number(process.env.API_PORT || process.env.PORT || 3000);
const origin = getAppOrigin();
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin, credentials: true }));
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", apiLimiter);

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ ok: true, database: "connected", mode: "database-connected" });
  } catch {
    return res.status(503).json({ ok: false, database: "unavailable", mode: "database-configured" });
  }
});
app.get("/api/config", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    databaseConfigured: databaseEnabled,
    paymentMode: "simulated",
    realPaymentsEnabled: false,
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/categories", categoryRouter);
app.use("/api/products", productRoutes);
app.use("/api", customerRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/maintenance", maintenanceRoutes);

app.use((error, req, res, _next) => {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(JSON.stringify({ requestId: req.requestId, status, message: error.message }));
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : error.message || "Something went wrong.",
    ...(error.details ? { details: error.details } : {}),
    requestId: req.requestId,
  });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticFiles = express.static(root, { index: "index.html", dotfiles: "deny", maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 });
app.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) return next();
  const pathname = req.path;
  const allowed =
    pathname === "/" ||
    /^\/(?:index|products|product|cart|account|wishlist|orders|checkout|order-confirmation)\.html$/.test(pathname) ||
    /^\/css\/styles\.css$/.test(pathname) ||
    /^\/js\/[a-zA-Z0-9_-]+\.js$/.test(pathname);
  if (!allowed) return next();
  return staticFiles(req, res, next);
});
app.get("*", (_req, res) => res.sendFile(path.join(root, "index.html")));

if (!databaseEnabled) {
  throw new Error("DATABASE_URL is required. Demo mode is disabled; configure PostgreSQL before starting ShopCraft.");
}

try {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
} catch (error) {
  console.error("ShopCraft startup failed: PostgreSQL is not reachable or not configured.");
  await disconnectDatabase();
  throw error;
}

const server = app.listen(port, () => console.log(`ShopCraft listening on ${port}; PostgreSQL connected`));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    server.close();
    await disconnectDatabase();
    process.exit(0);
  });
}
