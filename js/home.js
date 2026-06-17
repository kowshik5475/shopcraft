// ── Home Page ─────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {

  // Stats
  const inStock = PRODUCTS.filter(p => p.stock > 0).length;
  const featured = PRODUCTS.filter(p => p.featured).length;
  document.getElementById("stat-products").textContent = PRODUCTS.length;
  document.getElementById("stat-categories").textContent = CATEGORIES.length;
  document.getElementById("stat-instock").textContent = inStock;
  document.getElementById("stat-featured").textContent = featured;

  // Featured grid
  const featuredGrid = document.getElementById("featured-grid");
  const featuredProducts = PRODUCTS.filter(p => p.featured).slice(0, 4);
  featuredGrid.innerHTML = featuredProducts.map(p => renderProductCard(p)).join("");
  featuredGrid.addEventListener("click", function (e) {
    const btn = e.target.closest(".card-add-btn");
    if (!btn) return;
    e.preventDefault();
    const id = parseInt(btn.dataset.id);
    const product = PRODUCTS.find(p => p.id === id);
    if (product && product.stock > 0) {
      addToCart(id, 1);
      showToast(product.name + " added to cart!");
    }
  });

  // Category grid
  const categoryGrid = document.getElementById("category-grid");
  const categoryCounts = {};
  PRODUCTS.forEach(p => { categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1; });
  categoryGrid.innerHTML = CATEGORIES.map(cat => `
    <a href="products.html?category=${encodeURIComponent(cat)}"
       class="category-card"
       aria-label="${cat} — ${categoryCounts[cat]} items">
      <div class="category-card-label">
        <div>${cat}</div>
        <div class="category-card-count">${categoryCounts[cat]} items</div>
      </div>
    </a>
  `).join("");

});

function renderProductCard(p) {
  const stars = "★".repeat(Math.round(p.rating)) + "☆".repeat(5 - Math.round(p.rating));
  return `
    <a href="product.html?id=${p.id}" class="product-card" aria-label="${p.name}, ${formatCurrency(p.price)}">
      <div class="card-img">
        <img src="${p.imageUrl}" alt="${p.name}" loading="lazy" />
      </div>
      <div class="card-info">
        <div class="card-category">${p.category}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-footer">
          <div>
            <div class="card-price">${formatCurrency(p.price)}</div>
            <div class="card-rating"><span class="star" aria-hidden="true">★</span> ${p.rating.toFixed(1)} (${p.reviewCount})</div>
          </div>
          ${p.stock > 0
            ? `<button class="card-add-btn" data-id="${p.id}" aria-label="Add ${p.name} to cart" title="Add to cart">+</button>`
            : `<span class="out-of-stock-badge">Out of stock</span>`}
        </div>
      </div>
    </a>
  `;
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
