import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma, databaseEnabled } from "../db.js";
import {
  clearRefreshCookieOptions, createSession, hashToken, refreshCookieOptions,
  requireAuth, safeUser, signAccess, signRefresh, verifyRefresh,
} from "../auth.js";
import { loginSchema, parse, registerSchema } from "../validation.js";
import { getAppOrigin, isAllowedRequestOrigin } from "../config.js";
import { rotateRefreshRecord } from "../session.js";

const router = Router();
const sameOrigin = (req, res, next) => {
  const expectedOrigin = getAppOrigin();
  if (!isAllowedRequestOrigin(req.get("origin"), expectedOrigin)) return res.status(403).json({ error: "Request origin is not allowed." });
  return next();
};

router.post("/register", async (req, res, next) => {
  try {
    if (!databaseEnabled) return res.status(503).json({ error: "Account services need PostgreSQL configuration." });
    const input = parse(registerSchema, req.body);
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "An account with this email already exists." });
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 12),
        cart: { create: {} },
        wishlist: { create: {} },
      },
    });
    return res.status(201).json(await createSession(res, user));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "An account with this email already exists." });
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    if (!databaseEnabled) return res.status(503).json({ error: "Account services need PostgreSQL configuration." });
    const input = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    return res.json(await createSession(res, user));
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", sameOrigin, async (req, res, next) => {
  try {
    if (!databaseEnabled) return res.status(503).json({ error: "Account services need PostgreSQL configuration." });
    const raw = req.cookies.shopcraft_refresh;
    if (!raw) return res.status(401).json({ error: "No active session." });
    let payload;
    try {
      payload = verifyRefresh(raw);
    } catch {
      res.clearCookie("shopcraft_refresh", clearRefreshCookieOptions);
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    const now = new Date();
    const nextRefreshToken = signRefresh({ id: payload.sub });
    const user = await prisma.$transaction(tx => rotateRefreshRecord(tx, {
      tokenHash: hashToken(raw),
      userId: payload.sub,
      now,
      nextTokenHash: hashToken(nextRefreshToken),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    }));
    if (!user) {
      // A concurrent tab may already have rotated this cookie. Do not clear
      // the winner's replacement token from the losing request's response.
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    res.cookie("shopcraft_refresh", nextRefreshToken, refreshCookieOptions);
    return res.json({ accessToken: signAccess(user), user: safeUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", sameOrigin, async (req, res, next) => {
  try {
    const raw = req.cookies.shopcraft_refresh;
    if (databaseEnabled && raw) {
      await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(raw) } });
    }
    res.clearCookie("shopcraft_refresh", clearRefreshCookieOptions);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "Customer not found." });
    return res.json({ user: safeUser(user) });
  } catch (error) {
    return next(error);
  }
});

export default router;
