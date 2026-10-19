document.addEventListener("DOMContentLoaded", async () => {
  const orderId = new URLSearchParams(location.search).get("orderId");
  const title = document.getElementById("confirmation-title");
  const text = document.getElementById("confirmation-message");
  const details = document.getElementById("confirmation-details");
  const status = document.getElementById("confirmation-status");
  if (!orderId) {
    title.textContent = "We couldn’t find that order.";
    text.textContent = "Open your order history to check recent purchases.";
    return;
  }
  await window.ShopCraftAPI.restoreSession();
  if (!window.ShopCraftAPI.accessTokenReady) {
    title.textContent = "Sign in to view your order.";
    text.innerHTML = '<a href="account.html">Log in to your ShopCraft account</a> to view its payment and delivery status.';
    return;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const { order } = await window.ShopCraftAPI.order(orderId);
      if (order.status === "CANCELLED" || order.status === "REFUNDED") {
        title.textContent = order.status === "REFUNDED" ? "Your payment was refunded." : "This order was cancelled.";
        if (order.paymentStatus === "SUCCEEDED") {
          text.textContent = "The payment was received but the order was cancelled. Please contact store support about the refund.";
        } else if (order.paymentStatus === "PROCESSING") {
          text.textContent = "The order was cancelled and the payment refund is processing.";
        } else {
          text.textContent = "No order will be fulfilled. You can return to your cart and try again.";
        }
        return;
      }
      if (order.paymentStatus === "SUCCEEDED") {
        title.textContent = "Your order is confirmed.";
        text.textContent = "Your simulated payment was recorded successfully. No real money was charged. We’ll update your order history when shipment details are added.";
        details.innerHTML = `<div class="order-card"><strong>${escapeHtml(order.orderNumber)}</strong><p>${order.items.length} line items · Total $${(order.totalCents / 100).toFixed(2)}</p><span class="tag">Confirmed</span></div>`;
        try {
          const savedCart = await window.ShopCraftAPI.cart();
          localStorage.setItem("sc_cart", JSON.stringify((savedCart.items || []).map(item => ({ productId: item.productId, quantity: item.quantity }))));
          window.dispatchEvent(new Event("shopcraft:cart"));
        } catch {
          const remaining = getCart().map(item => {
            const purchased = order.items.find(line => line.productId === item.productId);
            return purchased ? { ...item, quantity: item.quantity - purchased.quantity } : item;
          }).filter(item => item.quantity > 0);
          saveCart(remaining);
        }
        sessionStorage.removeItem("sc_checkout_key");
        sessionStorage.removeItem("sc_checkout_signature");
        return;
      }
      if (order.paymentStatus === "FAILED") {
        title.textContent = "Payment needs another attempt.";
        text.textContent = "The simulated payment failed. No money was charged and the order was not confirmed.";
        details.innerHTML = `<div class="order-card"><strong>${escapeHtml(order.orderNumber)}</strong><p>Payment status: failed. Retry from checkout or cancel the pending order in order history.</p><a class="btn btn-primary" href="checkout.html">Return to checkout</a></div>`;
        return;
      }
      status.textContent = "Waiting for the simulated payment result.";
      title.textContent = "We’re confirming your payment.";
      text.textContent = `Order ${order.orderNumber} is not confirmed until the simulated payment outcome is recorded by ShopCraft.`;
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  status.textContent = "The confirmation is taking longer than expected. Check order history in a moment; this page does not assume payment succeeded.";
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
