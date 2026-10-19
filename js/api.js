const API_BASE = String(window.SHOPCRAFT_API_BASE || "").replace(/\/$/, "");
let accessToken = null;
let currentUser = null;
let refreshPromise = null;

async function rawRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

async function request(path, options = {}, retry = true) {
  let response;
  try {
    response = await rawRequest(path, options);
  } catch {
    throw new Error("ShopCraft’s API is unavailable. Check your connection and try again.");
  }

  if (response.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const session = await restoreSession();
    if (session?.accessToken) return request(path, options, false);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = data.details;
    error.restartCheckout = data.restartCheckout === true;
    throw error;
  }
  return data;
}

async function restoreSession() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await rawRequest("/api/auth/refresh", { method: "POST" });
      if (!response.ok) {
        accessToken = null;
        currentUser = null;
        window.dispatchEvent(new CustomEvent("shopcraft:session", { detail: { user: null } }));
        return null;
      }
      const data = await response.json();
      accessToken = data.accessToken;
      currentUser = data.user;
      window.dispatchEvent(new CustomEvent("shopcraft:session", { detail: { user: currentUser } }));
      await syncGuestState();
      return data;
    } catch {
      accessToken = null;
      currentUser = null;
      window.dispatchEvent(new CustomEvent("shopcraft:session", { detail: { user: null } }));
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function syncGuestState() {
  if (!accessToken) return { syncedCount: 0 };
  const guestCart = readJson("sc_cart", []);
  const guestWishlist = readJson("sc_wishlist", []);
  const [cartResult, wishlistResult] = await Promise.allSettled([
    request("/api/cart/merge", { method: "POST", body: JSON.stringify({ items: guestCart }) }),
    request("/api/wishlist/merge", { method: "POST", body: JSON.stringify({ productIds: guestWishlist }) }),
  ]);
  let syncedCount = 0;
  if (cartResult.status === "fulfilled") {
    syncedCount += cartResult.value.syncedCount || 0;
    const items = (cartResult.value.items || []).map(item => ({ productId: item.productId, quantity: item.quantity }));
    localStorage.setItem("sc_cart", JSON.stringify(items));
    window.dispatchEvent(new Event("shopcraft:cart"));
  }
  if (wishlistResult.status === "fulfilled") {
    syncedCount += wishlistResult.value.syncedCount || 0;
    const wishlist = await request("/api/wishlist").catch(() => ({ items: [] }));
    localStorage.setItem("sc_wishlist", JSON.stringify((wishlist.items || []).map(item => item.productId)));
    window.dispatchEvent(new Event("shopcraft:wishlist"));
  }
  return { syncedCount };
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

async function authenticate(path, body) {
  const result = await request(path, { method: "POST", body: JSON.stringify(body) }, false);
  accessToken = result.accessToken;
  currentUser = result.user;
  const sync = await syncGuestState();
  window.dispatchEvent(new CustomEvent("shopcraft:session", { detail: { user: currentUser } }));
  return { ...result, syncedCount: sync.syncedCount };
}

window.ShopCraftAPI = {
  get user() { return currentUser; },
  get accessTokenReady() { return Boolean(accessToken); },
  request,
  restoreSession,
  syncGuestState,
  register: body => authenticate("/api/auth/register", body),
  login: body => authenticate("/api/auth/login", body),
  async logout() {
    try { await request("/api/auth/logout", { method: "POST" }, false); }
    finally {
      accessToken = null;
      currentUser = null;
      window.dispatchEvent(new CustomEvent("shopcraft:session", { detail: { user: null } }));
    }
  },
  products: params => request(`/api/products?${new URLSearchParams(params || {})}`),
  publicConfig: () => request("/api/config"),
  product: id => request(`/api/products/${encodeURIComponent(id)}`),
  related: id => request(`/api/products/${encodeURIComponent(id)}/related`),
  reviews: id => request(`/api/products/${encodeURIComponent(id)}/reviews`),
  submitReview: (id, body) => request(`/api/products/${encodeURIComponent(id)}/reviews`, { method: "POST", body: JSON.stringify(body) }),
  cart: () => request("/api/cart"),
  addToCart: (productId, quantity = 1) => request("/api/cart/items", { method: "POST", body: JSON.stringify({ productId, quantity }) }),
  updateCart: (productId, quantity) => request(`/api/cart/items/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeCartItem: productId => request(`/api/cart/items/${encodeURIComponent(productId)}`, { method: "DELETE" }),
  wishlist: () => request("/api/wishlist"),
  addToWishlist: productId => request("/api/wishlist/items", { method: "POST", body: JSON.stringify({ productId }) }),
  removeWishlistItem: productId => request(`/api/wishlist/items/${encodeURIComponent(productId)}`, { method: "DELETE" }),
  profile: () => request("/api/profile"),
  updateProfile: name => request("/api/profile", { method: "PATCH", body: JSON.stringify({ name }) }),
  addresses: () => request("/api/addresses"),
  saveAddress: body => request("/api/addresses", { method: "POST", body: JSON.stringify(body) }),
  deleteAddress: id => request(`/api/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }),
  orders: () => request("/api/orders"),
  order: id => request(`/api/orders/${encodeURIComponent(id)}`),
  cancelOrder: id => request(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  createPayment: body => request("/api/payments/create", { method: "POST", body: JSON.stringify(body) }),
  verifyPayment: orderId => request("/api/payments/verify", { method: "POST", body: JSON.stringify({ orderId }) }),
};

window.ShopCraftAPI.restoreSession();
