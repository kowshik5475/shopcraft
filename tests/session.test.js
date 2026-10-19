import test from "node:test";
import assert from "node:assert/strict";
import { rotateRefreshRecord } from "../server/session.js";

function createFakeDatabase() {
  const refreshRows = new Map([
    ["old-hash", { tokenHash: "old-hash", userId: "customer-1", expiresAt: new Date("2030-01-01T00:00:00Z") }],
  ]);
  const user = { id: "customer-1", email: "shopper@example.com", name: "Shopper" };
  return {
    refreshRows,
    tx: {
      refreshToken: {
        deleteMany: async ({ where }) => {
          const row = refreshRows.get(where.tokenHash);
          if (!row || row.userId !== where.userId || row.expiresAt <= where.expiresAt.gt) return { count: 0 };
          refreshRows.delete(where.tokenHash);
          return { count: 1 };
        },
        create: async ({ data }) => {
          refreshRows.set(data.tokenHash, data);
          return data;
        },
      },
      user: { findUnique: async ({ where }) => where.id === user.id ? user : null },
    },
  };
}

test("only one simultaneous request can rotate the same refresh token", async () => {
  const { tx, refreshRows } = createFakeDatabase();
  const request = () => rotateRefreshRecord(tx, {
    tokenHash: "old-hash",
    userId: "customer-1",
    now: new Date("2026-10-19T00:00:00Z"),
    nextTokenHash: `next-${Math.random()}`,
    expiresAt: new Date("2026-11-18T00:00:00Z"),
  });

  const results = await Promise.all([request(), request()]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(refreshRows.has("old-hash"), false);
  assert.equal(refreshRows.size, 1);
});

test("refresh rotation is bound to the owning user and an unexpired database row", async () => {
  const { tx, refreshRows } = createFakeDatabase();
  const wrongOwner = await rotateRefreshRecord(tx, {
    tokenHash: "old-hash",
    userId: "customer-2",
    now: new Date("2026-10-19T00:00:00Z"),
    nextTokenHash: "wrong-owner-next",
    expiresAt: new Date("2026-11-18T00:00:00Z"),
  });
  assert.equal(wrongOwner, null);
  assert.equal(refreshRows.has("old-hash"), true);

  const expired = await rotateRefreshRecord(tx, {
    tokenHash: "old-hash",
    userId: "customer-1",
    now: new Date("2031-01-01T00:00:00Z"),
    nextTokenHash: "expired-next",
    expiresAt: new Date("2031-02-01T00:00:00Z"),
  });
  assert.equal(expired, null);
  assert.equal(refreshRows.has("old-hash"), true);
});
