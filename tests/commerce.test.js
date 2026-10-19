import test from "node:test";
import assert from "node:assert/strict";
import { calculateOrderAmounts, mergeCartQuantity } from "../server/commerce.js";
import { checkoutSchema, parse, registerSchema } from "../server/validation.js";

test("guest cart merge keeps the larger quantity and respects available stock", () => {
  assert.equal(mergeCartQuantity(2, 3, 10), 3);
  assert.equal(mergeCartQuantity(5, 1, 10), 5);
  assert.equal(mergeCartQuantity(5, 99, 7), 7);
  assert.equal(mergeCartQuantity(0, 2, 0), 0);
});

test("checkout totals are integer cents with complimentary threshold shipping", () => {
  assert.deepEqual(calculateOrderAmounts([
    { priceCents: 24999, quantity: 1 },
    { priceCents: 6400, quantity: 2 },
  ]), {
    subtotalCents: 37799,
    shippingCents: 0,
    taxCents: 0,
    discountCents: 0,
    totalCents: 37799,
  });
  assert.equal(calculateOrderAmounts([{ priceCents: 3800, quantity: 1 }]).totalCents, 5000);
});



test("checkout validates addresses and rejects invalid quantities", () => {
  const valid = {
    items: [{ productId: 1, quantity: 2 }],
    shippingAddress: {
      recipientName: "Shopper Name",
      line1: "45 Market Street",
      city: "Portland",
      state: "Oregon",
      postalCode: "97201",
      country: "US",
    },
    idempotencyKey: "checkout-key-123456",
  };
  assert.equal(parse(checkoutSchema, valid).items[0].quantity, 2);
  assert.throws(() => parse(checkoutSchema, { ...valid, items: [{ productId: 1, quantity: 0 }] }), /check the submitted information/i);
});

test("registration enforces the documented password strength rules", () => {
  assert.equal(parse(registerSchema, { email: "test@example.com", name: "Test User", password: "StrongPass123" }).email, "test@example.com");
  assert.throws(() => parse(registerSchema, { email: "test@example.com", name: "Test User", password: "weakpass" }));
});

