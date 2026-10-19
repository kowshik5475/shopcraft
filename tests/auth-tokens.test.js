import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = "access-test-secret-".padEnd(40, "a");
process.env.JWT_REFRESH_SECRET = "refresh-test-secret-".padEnd(40, "b");

const { signAccess, signRefresh, verifyAccess, verifyRefresh } = await import("../server/auth.js");
const jwt = (await import("jsonwebtoken")).default;

test("access and refresh tokens are short-lived, typed, and audience-separated", () => {
  const user = { id: "customer-1", email: "shopper@example.com" };
  const access = verifyAccess(signAccess(user));
  const refresh = verifyRefresh(signRefresh(user));

  assert.equal(access.sub, user.id);
  assert.equal(access.kind, "access");
  assert.equal(access.aud, "shopcraft-api");
  assert.ok(access.exp - access.iat <= 15 * 60);
  assert.equal(refresh.sub, user.id);
  assert.equal(refresh.kind, "refresh");
  assert.equal(refresh.aud, "shopcraft-refresh");
  assert.ok(refresh.exp - refresh.iat <= 30 * 24 * 60 * 60);
  assert.throws(() => verifyAccess(signRefresh(user)));
  assert.throws(() => verifyRefresh(signAccess(user)));
});

test("token verification rejects expired tokens and tokens without exp", () => {
  const expired = jwt.sign(
    { sub: "customer-1", kind: "access" },
    process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", expiresIn: -1, issuer: "shopcraft", audience: "shopcraft-api" },
  );
  const withoutExpiry = jwt.sign(
    { sub: "customer-1", kind: "access" },
    process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", issuer: "shopcraft", audience: "shopcraft-api", noTimestamp: true },
  );
  assert.throws(() => verifyAccess(expired));
  assert.throws(() => verifyAccess(withoutExpiry));
});
