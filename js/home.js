document.addEventListener("DOMContentLoaded", async function () {
  const status = document.getElementById("catalog-status");
  const featuredGrid = document.getElementById("featured-grid");
  const categoryGrid = document.getElementById("category-grid");
  try {
    const [featuredResult, categoryResult, totals, inStock] = await Promise.all([
      window.ShopCraftAPI.products({ featured: "true", pageSize: "4", sort: "rating" }),
      window.ShopCraftAPI.request("/api/categories"),
      window.ShopCraftAPI.products({ page: "1", pageSize: "1" }),
      window.ShopCraftAPI.products({ inStock: "true", page: "1", pageSize: "1" }),
    ]);
    const featured = featuredResult.data || [];
    const categories = categoryResult.data || [];
    document.getElementById("stat-products").textContent = totals.total;
    document.getElementById("stat-categories").textContent = categories.length;
    document.getElementById("stat-instock").textContent = inStock.total;
    document.getElementById("stat-featured").textContent = featuredResult.total;
    featuredGrid.innerHTML = featured.length ? featured.map(renderProductCard).join("") : '<p class="text-muted">No featured products are available.</p>';
    categoryGrid.innerHTML = categories.map(category => `
      <a href="products.html?category=${encodeURIComponent(category.name)}" class="category-card" aria-label="${escapeHtml(category.name)} products">
        <div class="category-card-label"><div>${escapeHtml(category.name)}</div><div class="category-card-count">${Number(category.count || 0)} items</div></div>
      </a>
    `).join("");
    if (status) status.textContent = "";
    featuredGrid.addEventListener("click", event => {
      const add = event.target.closest(".card-add-btn");
      const wish = event.target.closest(".card-wishlist-btn");
      if (add) {
        const product = featured.find(item => Number(item.id) === Number(add.dataset.id));
        if (!product || product.stock < 1) return;
        addToCart(product.id, 1);
        showToast(`${product.name} added to cart!`);
      }
      if (wish) {
        const productId = Number(wish.dataset.id);
        const saved = toggleWishlist(productId);
        wish.classList.toggle("is-saved", saved);
        wish.setAttribute("aria-pressed", String(saved));
        showToast(saved ? "Saved to your wishlist" : "Removed from your wishlist");
      }
    });
  } catch (error) {
    document.getElementById("stat-products").textContent = "—";
    document.getElementById("stat-categories").textContent = "—";
    document.getElementById("stat-instock").textContent = "—";
    document.getElementById("stat-featured").textContent = "—";
    featuredGrid.innerHTML = "";
    categoryGrid.innerHTML = "";
    if (status) status.textContent = `The live store is unavailable. ${error.message} Check the API and database configuration.`;
  }
});

function renderProductCard(product) {
  const saved = getWishlist().includes(Number(product.id));
  return `
    <article class="product-card">
      <a href="product.html?id=${Number(product.id)}" class="product-card-link" aria-label="View ${escapeHtml(product.name)}">
        <div class="card-img">${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>
        <div class="card-info"><div class="card-category">${escapeHtml(product.category)}</div><div class="card-name">${escapeHtml(product.name)}</div><div class="card-rating"><span class="star" aria-hidden="true">★</span> ${Number(product.rating || 0).toFixed(1)} (${Number(product.reviewCount || 0)})</div></div>
      </a>
      <div class="card-footer"><div class="card-price">${formatCurrency(product.price)}</div><div class="card-actions"><button class="card-wishlist-btn ${saved ? "is-saved" : ""}" data-id="${Number(product.id)}" aria-label="${saved ? "Remove from" : "Add to"} wishlist" aria-pressed="${saved}">♡</button>${product.stock > 0 ? `<button class="card-add-btn" data-id="${Number(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart">+</button>` : `<span class="out-of-stock-badge">Out of stock</span>`}</div></div>
    </article>`;
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
