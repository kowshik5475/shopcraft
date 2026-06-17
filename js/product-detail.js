// ── Product Detail Page ───────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get("id") || "0");
  const product = PRODUCTS.find(p => p.id === id);

  const root = document.getElementById("product-detail-root");

  if (!product) {
    root.innerHTML = `
      <div style="text-align:center;padding:80px 0;">
        <h2>Product Not Found</h2>
        <p class="text-muted" style="margin:16px 0 24px;">The item you're looking for doesn't exist.</p>
        <a href="products.html" class="btn btn-primary">Return to Catalog</a>
      </div>`;
    return;
  }

  // Update page title + meta
  document.title = product.name + " | ShopCraft";
  document.querySelector("meta[name=description]").setAttribute("content", product.description);

  let qty = 1;

  function renderQty() {
    document.getElementById("qty-val").textContent = qty;
    document.getElementById("qty-dec").disabled = qty <= 1;
    document.getElementById("qty-inc").disabled = qty >= product.stock;
    document.getElementById("qty-available").textContent = product.stock + " available";
  }

  root.innerHTML = `
    <div class="detail-grid">
      <div class="detail-img">
        <img src="${product.imageUrl}" alt="${product.name}" loading="lazy" />
      </div>
      <div>
        <div class="detail-category">${product.category}</div>
        <h1 class="detail-name">${product.name}</h1>
        <div class="detail-price-row">
          <div class="detail-price" aria-label="Price: ${formatCurrency(product.price)}">${formatCurrency(product.price)}</div>
          ${product.rating > 0 ? `
          <div class="detail-rating">
            <span class="star" aria-hidden="true">★</span>
            <strong>${product.rating.toFixed(1)}</strong>
            <span aria-label="${product.reviewCount} reviews">(${product.reviewCount} reviews)</span>
          </div>` : ""}
        </div>
        <p class="detail-desc">${product.description}</p>
        <hr class="detail-divider" />
        ${product.stock > 0 ? `
        <div class="qty-row">
          <span class="qty-label" id="qty-label">Quantity</span>
          <div class="qty-control" role="group" aria-labelledby="qty-label">
            <button class="qty-btn" id="qty-dec" aria-label="Decrease quantity" disabled>−</button>
            <span class="qty-display" id="qty-val" aria-live="polite">1</span>
            <button class="qty-btn" id="qty-inc" aria-label="Increase quantity">+</button>
          </div>
          <span class="qty-available text-muted" id="qty-available">${product.stock} available</span>
        </div>
        <button class="btn btn-primary btn-lg add-to-cart-btn" id="atc-btn" aria-label="Add to cart">
          🛍 Add to Cart
        </button>` : `
        <div class="out-of-stock-box" role="status">
          <p>Out of Stock</p>
          <p class="text-muted" style="font-size:.875rem;">This item is currently unavailable.</p>
        </div>`}
        <div class="perks" aria-label="Shipping and return details">
          <div class="perk"><span class="perk-icon">🚚</span><div><div class="perk-title">Free Shipping</div><div class="perk-desc">On orders over $150</div></div></div>
          <div class="perk"><span class="perk-icon">🛡</span><div><div class="perk-title">Quality Guarantee</div><div class="perk-desc">30-day return policy</div></div></div>
        </div>
      </div>
    </div>
  `;

  if (product.stock > 0) {
    renderQty();
    document.getElementById("qty-dec").addEventListener("click", () => { if (qty > 1) { qty--; renderQty(); } });
    document.getElementById("qty-inc").addEventListener("click", () => { if (qty < product.stock) { qty++; renderQty(); } });
    document.getElementById("atc-btn").addEventListener("click", function () {
      addToCart(product.id, qty);
      showToast(qty + " × " + product.name + " added to cart!");
      this.textContent = "✓ Added!";
      setTimeout(() => { this.innerHTML = "🛍 Add to Cart"; }, 1500);
    });
  }
});

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
