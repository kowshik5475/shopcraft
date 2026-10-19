// ── Cart utilities (localStorage-backed) ──────────────────────────────────────

function getCart() {
  try {
    const value = JSON.parse(localStorage.getItem("sc_cart") || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
      Number.isInteger(Number(item.productId)) && Number(item.productId) > 0 &&
      Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0 && Number(item.quantity) <= 99
    ).map(item => ({ productId: Number(item.productId), quantity: Number(item.quantity) }));
  }
  catch { return []; }
}

function saveCart(items) {
  localStorage.setItem("sc_cart", JSON.stringify(items));
  updateCartBadge();
  window.dispatchEvent(new Event("shopcraft:cart"));
}

function addToCart(productId, quantity = 1) {
  const items = getCart();
  const existing = items.find(i => i.productId === productId);
  const previous = JSON.stringify(items);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, 99);
  } else {
    items.push({ productId, quantity });
  }
  saveCart(items);
  if (window.ShopCraftAPI?.accessTokenReady) {
    window.ShopCraftAPI.addToCart(productId, quantity).catch(error => {
      localStorage.setItem("sc_cart", previous);
      updateCartBadge();
      showCartToast(error.message);
    });
  }
}

function removeFromCart(productId) {
  saveCart(getCart().filter(i => i.productId !== productId));
  if (window.ShopCraftAPI?.accessTokenReady) window.ShopCraftAPI.removeCartItem(productId).catch(error => showCartToast(error.message));
}

function updateQuantity(productId, quantity) {
  if (quantity < 1) { removeFromCart(productId); return; }
  const items = getCart();
  const item = items.find(i => i.productId === productId);
  if (item) {
    const previousQuantity = item.quantity;
    item.quantity = quantity;
    saveCart(items);
    if (window.ShopCraftAPI?.accessTokenReady) {
      window.ShopCraftAPI.updateCart(productId, quantity).catch(error => {
        const latest = getCart().find(entry => entry.productId === productId);
        if (latest) latest.quantity = previousQuantity;
        saveCart(getCart());
        showCartToast(error.message);
      });
    }
  }
}

function clearCart() {
  const items = getCart();
  saveCart([]);
  if (window.ShopCraftAPI?.accessTokenReady) {
    Promise.all(items.map(item => window.ShopCraftAPI.removeCartItem(item.productId))).catch(error => showCartToast(error.message));
  }
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

function getWishlist() {
  try {
    const ids = JSON.parse(localStorage.getItem("sc_wishlist") || "[]");
    return Array.isArray(ids) ? [...new Set(ids.map(Number).filter(id => Number.isInteger(id) && id > 0))] : [];
  } catch { return []; }
}

function normalizeShopCraftProduct(value) {
  const product = value?.product || value || {};
  let imageUrl = "";
  try {
    const url = new URL(product.imageUrl || "", location.href);
    if (["https:", "http:"].includes(url.protocol)) imageUrl = url.href;
  } catch { /* Untrusted image URLs are omitted. */ }
  return {
    ...product,
    id: Number(product.id ?? value?.productId),
    category: typeof product.category === "string" ? product.category : product.category?.name || "",
    price: Number(product.price ?? Number(product.priceCents || 0) / 100),
    stock: product.active === false ? 0 : Number(product.stock || 0),
    imageUrl,
    rating: Number(product.rating || 0),
    reviewCount: Number(product.reviewCount || 0),
  };
}

function saveWishlist(ids) {
  localStorage.setItem("sc_wishlist", JSON.stringify([...new Set(ids.map(Number))]));
  updateWishlistBadge();
  window.dispatchEvent(new Event("shopcraft:wishlist"));
}

function toggleWishlist(productId) {
  const ids = getWishlist();
  if (ids.includes(Number(productId))) {
    saveWishlist(ids.filter(id => id !== Number(productId)));
    if (window.ShopCraftAPI?.accessTokenReady) window.ShopCraftAPI.removeWishlistItem(productId).catch(error => showCartToast(error.message));
    return false;
  }
  saveWishlist([...ids, Number(productId)]);
  if (window.ShopCraftAPI?.accessTokenReady) window.ShopCraftAPI.addToWishlist(productId).catch(error => showCartToast(error.message));
  return true;
}

function updateWishlistBadge() {
  const badge = document.getElementById("wishlist-badge");
  if (!badge) return;
  const count = getWishlist().length;
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
}

function showCartToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// Init badge on every page load
document.addEventListener("DOMContentLoaded", () => {
  updateCartBadge();
  updateWishlistBadge();
});
window.addEventListener("shopcraft:cart", updateCartBadge);
window.addEventListener("shopcraft:wishlist", updateWishlistBadge);
