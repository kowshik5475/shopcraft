const ORDER_STEPS = ["PENDING_PAYMENT", "CONFIRMED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
const ORDER_LABELS = ["Placed", "Confirmed", "Shipped", "Out for delivery", "Delivered"];

document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("orders-list");
  const status = document.getElementById("orders-status");
  const session = await window.ShopCraftAPI.restoreSession();
  if (!session?.user) {
    status.innerHTML = 'Please <a href="account.html">sign in</a> to see your orders.';
    list.innerHTML = "";
    return;
  }
  try {
    const result = await window.ShopCraftAPI.orders();
    if (!result.data.length) {
      list.innerHTML = '<div class="orders-empty"><h2>No orders yet</h2><p>Your purchases will appear here after checkout.</p><a class="btn btn-primary" href="products.html">Explore the catalog</a></div>';
      return;
    }
    list.innerHTML = result.data.map(renderOrder).join("");
    bindCancelButtons(list);
  } catch (error) {
    status.textContent = error.message;
  }
});

function renderOrder(order) {
  const orderTotal = (Number(order.totalCents) / 100).toFixed(2);
  const current = ORDER_STEPS.indexOf(order.status);
  const timeline = ORDER_LABELS.map((label, index) => `<span class="${index <= current && current >= 0 ? "done" : ""}">${escapeHtml(label)}</span>`).join("<span aria-hidden=\"true\">→</span>");
  const trackingUrl = order.shipment?.trackingUrl ? safeUrl(order.shipment.trackingUrl) : "";
  const shipment = order.shipment
    ? `<p>Carrier: ${escapeHtml(order.shipment.carrier || "Not specified")}${order.shipment.trackingNumber ? ` · Tracking ${escapeHtml(order.shipment.trackingNumber)}` : ""}</p>${trackingUrl ? `<a class="btn btn-outline btn-sm" href="${trackingUrl}" target="_blank" rel="noopener">Open carrier tracking</a>` : ""}`
    : `<p>Carrier tracking has not been added to this order.</p>`;
  const items = order.items.map(item => `<li>${escapeHtml(item.productName)} × ${item.quantity} — $${(item.unitPriceCents * item.quantity / 100).toFixed(2)}</li>`).join("");
  return `<article class="order-card">
    <div class="inline-actions" style="justify-content:space-between">
      <div><strong>Order ${escapeHtml(order.orderNumber)}</strong><p>${new Date(order.createdAt).toLocaleDateString()}</p></div>
      <span class="tag order-status">${escapeHtml(order.status.replaceAll("_", " ").toLowerCase())}</span>
    </div>
    <div class="order-timeline" aria-label="Order status timeline">${timeline}</div>
    <ul>${items}</ul>
    <p><strong>Total: $${orderTotal}</strong> · Payment ${escapeHtml(order.paymentStatus.replaceAll("_", " ").toLowerCase())}</p>
    ${shipment}
    ${order.status === "PENDING_PAYMENT" ? `<button class="btn btn-outline btn-sm" data-cancel-order="${escapeHtml(order.id)}">Cancel pending order</button>` : ""}
  </article>`;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? escapeHtml(url.href) : "";
  } catch { return ""; }
}

function bindCancelButtons(list) {
  list.querySelectorAll("[data-cancel-order]").forEach(button => button.addEventListener("click", async () => {
    if (!confirm("Cancel this unpaid order and release its reserved items?")) return;
    button.disabled = true;
    try {
      await window.ShopCraftAPI.cancelOrder(button.dataset.cancelOrder);
      showToast("Order cancelled");
      const updated = await window.ShopCraftAPI.orders();
      list.innerHTML = updated.data.map(renderOrder).join("");
      bindCancelButtons(list);
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
