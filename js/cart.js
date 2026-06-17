// ── Cart utilities (localStorage-backed) ──────────────────────────────────────

function getCart() {
  try { return JSON.parse(localStorage.getItem("sc_cart") || "[]"); }
  catch { return []; }
}

function saveCart(items) {
  localStorage.setItem("sc_cart", JSON.stringify(items));
  updateCartBadge();
}

function addToCart(productId, quantity = 1) {
  const items = getCart();
  const existing = items.find(i => i.productId === productId);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, 99);
  } else {
    items.push({ productId, quantity });
  }
  saveCart(items);
}

function removeFromCart(productId) {
  saveCart(getCart().filter(i => i.productId !== productId));
}

function updateQuantity(productId, quantity) {
  if (quantity < 1) { removeFromCart(productId); return; }
  const items = getCart();
  const item = items.find(i => i.productId === productId);
  if (item) { item.quantity = quantity; saveCart(items); }
}

function clearCart() {
  saveCart([]);
}

function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

function updateCartBadge() {
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
}

function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// Init badge on every page load
document.addEventListener("DOMContentLoaded", updateCartBadge);
