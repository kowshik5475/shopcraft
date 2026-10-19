document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("wishlist-grid");
  const status = document.getElementById("wishlist-status");
  await window.ShopCraftAPI.restoreSession();

  let remoteWishlist = [];
  if (window.ShopCraftAPI.accessTokenReady) {
    try {
      const result = await window.ShopCraftAPI.wishlist();
      remoteWishlist = result.items || [];
      saveWishlist(result.items.map(item => item.productId));
    } catch (error) {
      status.textContent = `Unable to load your saved items from the live API: ${error.message}`;
      grid.innerHTML = `<div class="wishlist-empty" style="grid-column:1/-1"><h2>Wishlist unavailable</h2><p>Check the API and database connection, then retry.</p><button class="btn btn-primary" id="retry-wishlist">Retry</button></div>`;
      document.getElementById("retry-wishlist")?.addEventListener("click", () => location.reload());
      return;
    }
  }
  const liveProducts = new Map(remoteWishlist.map(item => [item.productId, normalizeShopCraftProduct(item.product)]));
  try {
    await Promise.all(getWishlist().map(async id => {
      if (liveProducts.has(id)) return;
      try {
        const result = await window.ShopCraftAPI.product(id);
        if (result.product) liveProducts.set(id, normalizeShopCraftProduct(result.product));
      } catch (error) {
        if (error.status === 404) liveProducts.set(id, unavailableWishlistProduct(id));
        else throw error;
      }
    }));
  } catch (error) {
    status.textContent = `Unable to load product details from the live API: ${error.message}`;
    grid.innerHTML = `<div class="wishlist-empty" style="grid-column:1/-1"><h2>Wishlist unavailable</h2><p>Check the API and database connection, then retry.</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
    return;
  }
  window.ShopCraftLiveProducts = liveProducts;

  function render() {
    const saved = getWishlist();
    const products = saved.map(id => liveProducts.get(id)).filter(Boolean);
    status.textContent = window.ShopCraftAPI.accessTokenReady ? "Saved to your account." : "Saved on this device. Sign in to sync across devices.";
    if (!products.length) {
      grid.innerHTML = `<div class="wishlist-empty" style="grid-column:1/-1"><h2>Your wishlist is waiting</h2><p>Save a few pieces to compare them later.</p><a class="btn btn-primary" href="products.html">Browse the catalog</a></div>`;
      return;
    }
    grid.innerHTML = products.map(product => `
      <article class="product-card">
        <a href="product.html?id=${product.id}" class="product-card-link">
          <div class="card-img">${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>
          <div class="card-info"><div class="card-category">${escapeHtml(product.category)}</div><div class="card-name">${escapeHtml(product.name)}</div><div class="card-price">${formatCurrency(product.price)}</div></div>
        </a>
        <div class="card-footer"><button class="btn btn-primary btn-sm" data-add="${product.id}" ${product.stock < 1 ? "disabled" : ""}>${product.stock < 1 ? "Out of stock" : "Add to cart"}</button><button class="btn btn-ghost btn-sm" data-remove="${product.id}">Remove</button></div>
      </article>`).join("");
    grid.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => {
      const product = liveProducts.get(Number(button.dataset.add));
      if (!product) return;
      addToCart(product.id);
      toggleWishlist(product.id);
      showToast("Moved to your cart");
      render();
    }));
    grid.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
      toggleWishlist(Number(button.dataset.remove));
      showToast("Removed from saved items");
      render();
    }));
  }

  render();
  window.addEventListener("shopcraft:wishlist", render);
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function unavailableWishlistProduct(id) {
  return { id, name: "This product is no longer available", price: 0, stock: 0, imageUrl: "", category: "", rating: 0, reviewCount: 0 };
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
