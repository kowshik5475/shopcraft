document.addEventListener("DOMContentLoaded", async function () {
  const localInStock = PRODUCTS.filter(product => product.stock > 0).length;
  document.getElementById("stat-products").textContent = PRODUCTS.length;
  document.getElementById("stat-categories").textContent = CATEGORIES.length;
  document.getElementById("stat-instock").textContent = localInStock;
  document.getElementById("stat-featured").textContent = PRODUCTS.filter(product => product.featured).length;

  let categories = CATEGORIES.map(name => ({ name, count: PRODUCTS.filter(product => product.category === name).length }));
  let featured = PRODUCTS.filter(product => product.featured).slice(0, 4);
  try {
    const [catalog, categoryResult, totals] = await Promise.all([
      window.ShopCraftAPI.products({ featured: "true", pageSize: "4", sort: "rating" }),
      window.ShopCraftAPI.request("/api/categories"),
      window.ShopCraftAPI.products({ page: "1", pageSize: "1" }),
    ]);
    featured = catalog.data;
      categories = categoryResult.data;
    document.getElementById("stat-products").textContent = totals.total;
    document.getElementById("stat-categories").textContent = categories.length;
    document.getElementById("stat-featured").textContent = catalog.total;
  } catch {
    const status = document.getElementById("catalog-status");
    if (status) status.textContent = "Showing the bundled demo catalog. Configure the API and database for persistent store data.";
  }

  const featuredGrid = document.getElementById("featured-grid");
  featuredGrid.innerHTML = featured.map(renderProductCard).join("");
  featuredGrid.addEventListener("click", event => {
    const add = event.target.closest(".card-add-btn");
    const wish = event.target.closest(".card-wishlist-btn");
    if (add) {
      const productId = Number(add.dataset.id);
      const product = featured.find(item => Number(item.id) === productId) || PRODUCTS.find(item => item.id === productId);
      if (product?.stock > 0) {
        addToCart(productId, 1);
        showToast(`${product.name} added to cart!`);
      }
    }
    if (wish) {
      const productId = Number(wish.dataset.id);
      const saved = toggleWishlist(productId);
      wish.classList.toggle("is-saved", saved);
      wish.setAttribute("aria-pressed", String(saved));
      showToast(saved ? "Saved to your wishlist" : "Removed from your wishlist");
    }
  });

  const categoryGrid = document.getElementById("category-grid");
  categoryGrid.innerHTML = categories.map(category => `
    <a href="products.html?category=${encodeURIComponent(category.name)}" class="category-card" aria-label="${escapeHtml(category.name)} products">
      <div class="category-card-label"><div>${escapeHtml(category.name)}</div><div class="category-card-count">${Number(category.count || 0)} items</div></div>
    </a>
  `).join("");
});

function renderProductCard(product) {
  const saved = getWishlist().includes(Number(product.id));
  return `
    <article class="product-card">
      <a href="product.html?id=${Number(product.id)}" class="product-card-link" aria-label="View ${escapeHtml(product.name)}">
        <div class="card-img">${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>
        <div class="card-info">
          <div class="card-category">${escapeHtml(product.category)}</div>
          <div class="card-name">${escapeHtml(product.name)}</div>
          <div class="card-rating"><span class="star" aria-hidden="true">★</span> ${Number(product.rating || 0).toFixed(1)} (${Number(product.reviewCount || 0)})</div>
        </div>
      </a>
      <div class="card-footer">
        <div class="card-price">${formatCurrency(product.price)}</div>
        <div class="card-actions">
          <button class="card-wishlist-btn ${saved ? "is-saved" : ""}" data-id="${Number(product.id)}" aria-label="${saved ? "Remove from" : "Add to"} wishlist" aria-pressed="${saved}">♡</button>
          ${product.stock > 0 ? `<button class="card-add-btn" data-id="${Number(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart">+</button>` : `<span class="out-of-stock-badge">Out of stock</span>`}
        </div>
      </div>
    </article>
  `;
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
