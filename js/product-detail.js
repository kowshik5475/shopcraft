document.addEventListener("DOMContentLoaded", async function () {
  const params = new URLSearchParams(window.location.search);
  const id = Number.parseInt(params.get("id") || "0", 10);
  const root = document.getElementById("product-detail-root");
  let product;
  try {
    product = (await window.ShopCraftAPI.product(id)).product;
  } catch (error) {
    if (error.status === 404) product = null;
    else product = PRODUCTS.find(item => item.id === id);
  }

  if (!product) {
    root.innerHTML = `<div class="empty-cart"><h2>Product not found</h2><p class="text-muted">The item you’re looking for isn’t available.</p><a href="products.html" class="btn btn-primary">Return to catalog</a></div>`;
    return;
  }

  document.title = `${product.name} | ShopCraft`;
  document.querySelector("meta[name=description]")?.setAttribute("content", product.description);
  const saved = getWishlist().includes(Number(product.id));
  root.innerHTML = `
    <div class="detail-grid">
      <div class="detail-img"><img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>
      <div>
        <div class="detail-category">${escapeHtml(product.category)} ${product.badge ? `<span class="tag">${escapeHtml(product.badge)}</span>` : ""}</div>
        <h1 class="detail-name">${escapeHtml(product.name)}</h1>
        <div class="detail-price-row">
          <div class="detail-price">${formatCurrency(product.price)}</div>
          <div class="detail-rating"><span class="star" aria-hidden="true">★</span><strong>${Number(product.rating || 0).toFixed(1)}</strong><span>(${Number(product.reviewCount || 0)} reviews)</span></div>
        </div>
        <p class="detail-desc">${escapeHtml(product.description)}</p>
        <hr class="detail-divider" />
        ${product.stock > 0 ? `
          <div class="qty-row">
            <span class="qty-label" id="qty-label">Quantity</span>
            <div class="qty-control" role="group" aria-labelledby="qty-label">
              <button class="qty-btn" id="qty-dec" aria-label="Decrease quantity" disabled>−</button>
              <span class="qty-display" id="qty-val" aria-live="polite">1</span>
              <button class="qty-btn" id="qty-inc" aria-label="Increase quantity">+</button>
            </div>
            <span class="qty-available text-muted" id="qty-available">${Number(product.stock)} available</span>
          </div>
          <div class="detail-actions">
            <button class="btn btn-primary btn-lg add-to-cart-btn" id="atc-btn">🛍 Add to Cart</button>
            <button class="btn btn-outline btn-lg wishlist-detail-btn ${saved ? "is-saved" : ""}" id="wishlist-detail-btn" aria-pressed="${saved}">${saved ? "♥ Saved" : "♡ Save"}</button>
          </div>` : `<div class="out-of-stock-box" role="status"><p>Out of stock</p><p class="text-muted">This item is currently unavailable.</p></div>`}
        <div class="perks" aria-label="Shipping and return details">
          <div class="perk"><span class="perk-icon">🚚</span><div><div class="perk-title">Free Shipping</div><div class="perk-desc">On orders over $150</div></div></div>
          <div class="perk"><span class="perk-icon">🛡</span><div><div class="perk-title">Quality Guarantee</div><div class="perk-desc">30-day return policy</div></div></div>
        </div>
        <section class="review-summary" aria-label="Customer reviews">
          <h2>Customer reviews</h2>
          <div id="review-list"><p class="text-muted">Reviews from verified customers will appear here.</p></div>
          <div id="review-submit-slot"></div>
        </section>
      </div>
    </div>
  `;

  if (product.stock > 0) {
    let quantity = 1;
    const renderQuantity = () => {
      document.getElementById("qty-val").textContent = quantity;
      document.getElementById("qty-dec").disabled = quantity <= 1;
      document.getElementById("qty-inc").disabled = quantity >= product.stock;
    };
    document.getElementById("qty-dec").addEventListener("click", () => { if (quantity > 1) quantity -= 1; renderQuantity(); });
    document.getElementById("qty-inc").addEventListener("click", () => { if (quantity < product.stock) quantity += 1; renderQuantity(); });
    document.getElementById("atc-btn").addEventListener("click", () => {
      addToCart(product.id, quantity);
      showToast(`${quantity} × ${product.name} added to cart`);
    });
    document.getElementById("wishlist-detail-btn").addEventListener("click", event => {
      const isSaved = toggleWishlist(product.id);
      event.currentTarget.classList.toggle("is-saved", isSaved);
      event.currentTarget.setAttribute("aria-pressed", String(isSaved));
      event.currentTarget.textContent = isSaved ? "♥ Saved" : "♡ Save";
      showToast(isSaved ? "Saved to your wishlist" : "Removed from your wishlist");
    });
  }

  try {
    const [reviews, related] = await Promise.all([
      window.ShopCraftAPI.reviews(id),
      window.ShopCraftAPI.related(id),
    ]);
    renderReviews(reviews.data || []);
    const session = await window.ShopCraftAPI.restoreSession();
    const reviewSlot = document.getElementById("review-submit-slot");
    reviewSlot.innerHTML = session?.user
      ? `<form id="review-form" class="review-form"><h3>Write a review</h3><p class="cart-summary-note">Only customers with a completed purchase can submit a verified review.</p><label class="form-label">Rating<select name="rating" required><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Fine</option><option value="2">2 — Poor</option><option value="1">1 — Bad</option></select></label><label class="form-label">Title<input name="title" maxlength="120" /></label><label class="form-label">Review<textarea name="body" rows="4" maxlength="2000"></textarea></label><div class="form-message" id="review-message" role="status" aria-live="polite"></div><button class="btn btn-outline" type="submit">Submit review</button></form>`
      : `<p class="cart-summary-note"><a href="account.html?return=product&productId=${Number(product.id)}">Sign in</a> to write a review after purchase.</p>`;
    document.getElementById("review-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const feedback = document.getElementById("review-message");
      try {
        await window.ShopCraftAPI.submitReview(id, {
          rating: Number(data.get("rating")),
          title: String(data.get("title") || "").trim() || undefined,
          body: String(data.get("body") || "").trim() || undefined,
        });
        feedback.textContent = "Thank you. Your verified review was submitted.";
        feedback.classList.add("success");
        form.reset();
        const updated = await window.ShopCraftAPI.reviews(id);
        renderReviews(updated.data || []);
      } catch (error) {
        feedback.textContent = error.message;
      }
    });
    if (related.data?.length) {
      document.getElementById("related-grid").innerHTML = related.data.map(renderRelated).join("");
      document.getElementById("related-section").hidden = false;
    }
  } catch { /* Recommendations and live reviews are optional without API access. */ }
});

function renderReviews(reviews) {
  const list = document.getElementById("review-list");
  if (!reviews.length) {
    list.innerHTML = '<p class="text-muted">No written reviews yet.</p>';
    return;
  }
  list.innerHTML = reviews.map(review => `<article class="review-card"><div class="review-title"><strong>${escapeHtml(review.title || "Customer review")}</strong><span>${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span></div><p>${escapeHtml(review.body || "")}</p><small>${escapeHtml(review.user?.name || "ShopCraft customer")} · ${review.verified ? "Verified purchase" : "Customer"}</small></article>`).join("");
}

function renderRelated(product) {
  return `<article class="product-card">
    <a href="product.html?id=${Number(product.id)}" class="product-card-link">
      <div class="card-img">${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>
      <div class="card-info"><div class="card-category">${escapeHtml(product.category)}</div><div class="card-name">${escapeHtml(product.name)}</div><div class="card-rating"><span class="star">★</span> ${Number(product.rating || 0).toFixed(1)} (${Number(product.reviewCount || 0)})</div></div>
    </a>
    <div class="card-footer"><div class="card-price">${formatCurrency(product.price)}</div><a class="btn btn-outline btn-sm" href="product.html?id=${Number(product.id)}">View</a></div>
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
