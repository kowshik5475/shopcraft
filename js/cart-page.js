// ── Cart Page ─────────────────────────────────────────────────────────────────

function renderCart() {
  const items = getCart();
  const root = document.getElementById("cart-root");

  if (!items.length) {
    root.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon" aria-hidden="true">🛍</div>
        <h2>Your cart is empty</h2>
        <p class="text-muted">Looks like you haven't added anything yet.</p>
        <a href="products.html" class="btn btn-primary btn-lg">Continue Shopping</a>
      </div>`;
    return;
  }

  // Enrich items with product data
  const enriched = items.map(i => {
    const product = window.ShopCraftLiveProducts?.get(i.productId) || unavailableCartProduct(i.productId);
    return { ...i, product };
  });

  const subtotalCents = enriched.reduce((sum, i) => sum + Math.round(i.product.price * 100) * i.quantity, 0);
  const subtotal = subtotalCents / 100;
  const shipping = subtotalCents >= 15000 ? 0 : subtotalCents > 0 ? 12 : 0;
  const itemCount = enriched.reduce((sum, i) => sum + i.quantity, 0);

  document.title = "Your Cart (" + itemCount + ") | ShopCraft";

  root.innerHTML = `
    <div class="cart-heading-row">
      <h1>Your Cart</h1>
      <button class="btn btn-ghost btn-sm" id="clear-cart-btn" aria-label="Clear all items from cart">Clear Cart</button>
    </div>
    <div class="cart-layout">
      <div>
        <div class="cart-table-head" aria-hidden="true">
          <span>Product</span>
          <span>Quantity</span>
          <span style="text-align:right">Total</span>
        </div>
        <ul class="cart-items" aria-label="Cart items" id="cart-items-list">
          ${enriched.map(i => renderCartItem(i)).join("")}
        </ul>
      </div>
      <aside>
        <div class="order-summary" aria-label="Order summary">
          <h2>Order Summary</h2>
          <div class="summary-row"><span>Subtotal (${itemCount} ${itemCount === 1 ? "item" : "items"})</span><span>${formatCurrency(subtotal)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>${shipping ? formatCurrency(shipping) : "Complimentary"}</span></div>
          <div class="summary-row"><span>Taxes</span><span>Not calculated</span></div>
          <hr class="summary-divider" />
          <div class="summary-total"><span>Estimated Total</span><span>${formatCurrency(subtotal + shipping)}</span></div>
          <a href="checkout.html" class="btn btn-primary btn-lg checkout-btn" aria-label="Proceed to checkout">
            Proceed to Checkout →
          </a>
          <a href="products.html" class="continue-link">Continue Shopping</a>
        </div>
      </aside>
    </div>
  `;

  // Event: clear cart
  document.getElementById("clear-cart-btn").addEventListener("click", function () {
    if (confirm("Clear all items from your cart?")) {
      clearCart(); renderCart();
    }
  });

  // Event: item actions (delegated)
  document.getElementById("cart-items-list").addEventListener("click", function (e) {
    const removeBtn = e.target.closest(".cart-item-remove");
    const decBtn = e.target.closest(".cart-qty-btn[data-action='dec']");
    const incBtn = e.target.closest(".cart-qty-btn[data-action='inc']");

    if (removeBtn) {
      removeFromCart(parseInt(removeBtn.dataset.id));
      renderCart();
    } else if (decBtn) {
      const id = parseInt(decBtn.dataset.id);
      const item = getCart().find(i => i.productId === id);
      if (item) { updateQuantity(id, item.quantity - 1); renderCart(); }
    } else if (incBtn) {
      const id = parseInt(incBtn.dataset.id);
      const item = getCart().find(i => i.productId === id);
      const product = window.ShopCraftLiveProducts?.get(id);
      if (item && product && item.quantity < product.stock) { updateQuantity(id, item.quantity + 1); renderCart(); }
    }
  });
}

function renderCartItem(i) {
  const name = escapeCartHtml(i.product.name);
  const imageUrl = escapeCartHtml(i.product.imageUrl);
  return `
    <li class="cart-item" data-id="${i.productId}">
      <div class="cart-item-info">
        <a href="product.html?id=${i.product.id}" class="cart-item-img" aria-label="View ${name}">
          <img src="${imageUrl}" alt="${name}" loading="lazy" />
        </a>
        <div>
          <a href="product.html?id=${i.product.id}" class="cart-item-name">${name}</a>
          <div class="cart-item-price">${formatCurrency(i.product.price)}</div>
          <button class="cart-item-remove" data-id="${i.productId}" aria-label="Remove ${name} from cart">✕ Remove</button>
        </div>
      </div>
      <div>
        <div class="cart-qty" role="group" aria-label="Quantity for ${name}">
          <button class="cart-qty-btn" data-action="dec" data-id="${i.productId}" ${i.quantity <= 1 ? "disabled" : ""} aria-label="Decrease quantity">−</button>
          <span class="cart-qty-val" aria-live="polite">${i.quantity}</span>
          <button class="cart-qty-btn" data-action="inc" data-id="${i.productId}" ${i.quantity >= i.product.stock ? "disabled" : ""} aria-label="Increase quantity">+</button>
        </div>
      </div>
      <div class="cart-line-total">${formatCurrency(i.product.price * i.quantity)}</div>
    </li>
  `;
}

function escapeCartHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function initializeCart() {
  await window.ShopCraftAPI?.restoreSession();
  if (window.ShopCraftAPI?.accessTokenReady) {
    try {
      const saved = await window.ShopCraftAPI.cart();
      localStorage.setItem("sc_cart", JSON.stringify((saved.items || []).map(item => ({ productId: item.productId, quantity: item.quantity }))));
      updateCartBadge();
    } catch (error) {
      document.getElementById("cart-root").innerHTML = `<div class="empty-cart"><h2>Cart unavailable</h2><p class="text-muted">${escapeCartHtml(error.message)} Check the API and database connection.</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
      return;
    }
  }
  const liveProducts = new Map();
  try {
    await Promise.all(getCart().map(async item => {
      try {
        const result = await window.ShopCraftAPI.product(item.productId);
        if (result.product) liveProducts.set(item.productId, normalizeShopCraftProduct(result.product));
      } catch (error) {
        if (error.status === 404) liveProducts.set(item.productId, unavailableCartProduct(item.productId));
        else throw error;
      }
    }));
  } catch (error) {
    document.getElementById("cart-root").innerHTML = `<div class="empty-cart"><h2>Cart unavailable</h2><p class="text-muted">${escapeCartHtml(error.message)} Check the API and database connection.</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
    return;
  }
  window.ShopCraftLiveProducts = liveProducts;
  renderCart();
}

function unavailableCartProduct(id) {
  return { id, name: "This product is no longer available", price: 0, stock: 0, imageUrl: "", category: "", rating: 0, reviewCount: 0 };
}

document.addEventListener("DOMContentLoaded", initializeCart);
