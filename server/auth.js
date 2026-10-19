import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { getJwtSecrets, getRefreshCookieOptions } from "./config.js";

const { access: accessSecret, refresh: refreshSecret } = getJwtSecrets();
const refreshDays = 30;
const issuer = "shopcraft";

export const refreshCookieOptions = getRefreshCookieOptions();

export const clearRefreshCookieOptions = { ...refreshCookieOptions, maxAge: undefined };
export const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");
export const safeUser = user => ({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt });
export const signAccess = user => jwt.sign(
  { sub: user.id, email: user.email, kind: "access" },
  accessSecret,
  { algorithm: "HS256", expiresIn: "15m", issuer, audience: "shopcraft-api" },
);
export const signRefresh = user => jwt.sign(
  { sub: user.id, kind: "refresh" },
  refreshSecret,
  { algorithm: "HS256", expiresIn: `${refreshDays}d`, issuer, audience: "shopcraft-refresh" },
);

function verifyTypedToken(token, secret, audience, kind) {
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer, audience });
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.kind !== kind ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Invalid session token.");
  }
  return payload;
}

export const verifyAccess = token => verifyTypedToken(token, accessSecret, "shopcraft-api", "access");
export const verifyRefresh = token => verifyTypedToken(token, refreshSecret, "shopcraft-refresh", "refresh");

export async function createSession(res, user) {
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
    },
  });
  res.cookie("shopcraft_refresh", refreshToken, refreshCookieOptions);
  return { accessToken, user: safeUser(user) };
}

export function requireAuth(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = verifyAccess(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "Your session expired. Please sign in again." });
  }
}
