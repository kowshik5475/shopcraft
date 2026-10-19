import test from "node:test";
import assert from "node:assert/strict";
import {
  getAppOrigin,
  getJwtSecrets,
  getRefreshCookieOptions,
  isAllowedRequestOrigin,
} from "../server/config.js";

const validSecrets = {
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
};

test("JWT configuration rejects missing, short, placeholder, and equal secrets", () => {
  assert.throws(() => getJwtSecrets({}), /JWT_ACCESS_SECRET/);
  assert.throws(() => getJwtSecrets({
    JWT_ACCESS_SECRET: "short",
    JWT_REFRESH_SECRET: "b".repeat(40),
  }), /JWT_ACCESS_SECRET/);
  assert.throws(() => getJwtSecrets({
    JWT_ACCESS_SECRET: "replace-with-a-long-random-secret-value",
    JWT_REFRESH_SECRET: "b".repeat(40),
  }), /JWT_ACCESS_SECRET/);
  assert.throws(() => getJwtSecrets({
    JWT_ACCESS_SECRET: "a".repeat(40),
    JWT_REFRESH_SECRET: "a".repeat(40),
  }), /must be different/);
  assert.deepEqual(getJwtSecrets(validSecrets), {
    access: validSecrets.JWT_ACCESS_SECRET,
    refresh: validSecrets.JWT_REFRESH_SECRET,
  });
});

test("production origin requires an exact HTTPS origin", () => {
  assert.equal(getAppOrigin({ APP_ORIGIN: "https://shop.example.com", NODE_ENV: "production" }), "https://shop.example.com");
  assert.throws(() => getAppOrigin({ NODE_ENV: "production" }), /APP_ORIGIN/);
  assert.throws(() => getAppOrigin({ APP_ORIGIN: "http://shop.example.com", NODE_ENV: "production" }), /HTTPS/);
  assert.throws(() => getAppOrigin({ APP_ORIGIN: "https://shop.example.com/store", NODE_ENV: "production" }), /exact origin/);
  assert.equal(getAppOrigin({}), "http://localhost:3000");
});

test("refresh cookie defaults to Lax and rejects insecure SameSite=None", () => {
  assert.deepEqual(getRefreshCookieOptions({ NODE_ENV: "production" }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  assert.throws(() => getRefreshCookieOptions({ COOKIE_SAME_SITE: "none" }), /COOKIE_SECURE/);
  assert.equal(getRefreshCookieOptions({ COOKIE_SAME_SITE: "none", COOKIE_SECURE: "true" }).secure, true);
});

test("cookie-auth endpoints accept only the exact configured origin", () => {
  assert.equal(isAllowedRequestOrigin("https://shop.example.com", "https://shop.example.com"), true);
  assert.equal(isAllowedRequestOrigin("https://attacker.example", "https://shop.example.com"), false);
  assert.equal(isAllowedRequestOrigin(undefined, "https://shop.example.com"), false);
});
