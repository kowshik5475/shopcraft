export function mergeCartQuantity(savedQuantity, guestQuantity, stock) {
  const saved = Math.max(0, Math.trunc(Number(savedQuantity) || 0));
  const guest = Math.max(0, Math.trunc(Number(guestQuantity) || 0));
  const available = Math.max(0, Math.trunc(Number(stock) || 0));
  return Math.min(available, Math.max(saved, guest));
}

export function calculateOrderAmounts(items, shippingThresholdCents = 15000, shippingFeeCents = 1200) {
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const shippingCents = subtotalCents >= shippingThresholdCents ? 0 : shippingFeeCents;
  const taxCents = 0;
  const discountCents = 0;
  return {
    subtotalCents,
    shippingCents,
    taxCents,
    discountCents,
    totalCents: subtotalCents + shippingCents + taxCents - discountCents,
  };
}

export function paymentIntentMatchesOrder(intent, payment, order) {
  const expectedCurrency = String(order.currency || payment.currency || "").toLowerCase();
  return (
    typeof intent?.id === "string" &&
    (!payment.providerPaymentIntentId || payment.providerPaymentIntentId === intent.id) &&
    Number.isInteger(intent.amount) &&
    intent.amount === order.totalCents &&
    intent.amount === payment.amountCents &&
    Number.isInteger(intent.amount_received) &&
    intent.amount_received === order.totalCents &&
    String(intent.currency || "").toLowerCase() === expectedCurrency &&
    String(payment.currency || "").toLowerCase() === expectedCurrency
  );
}
