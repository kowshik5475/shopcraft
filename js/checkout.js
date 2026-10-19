let activeOrder;
let currentLines = [];

document.addEventListener("DOMContentLoaded", async () => {
  const message = document.getElementById("checkout-message");
  const session = await window.ShopCraftAPI.restoreSession();
  let cart = getCart();
  if (session?.user) {
    try {
      const saved = await window.ShopCraftAPI.cart();
      cart = saved.items.map(item => ({ productId: item.productId, quantity: item.quantity }));
      localStorage.setItem("sc_cart", JSON.stringify(cart));
    } catch (error) {
      message.textContent = `Unable to load your account cart from the live API: ${error.message}`;
      document.getElementById("prepare-payment").disabled = true;
      return;
    }
  }
  const items = await Promise.all(cart.map(async item => {
    try {
      const result = await window.ShopCraftAPI.product(item.productId);
      if (result.product) return { product: normalizeShopCraftProduct(result.product), quantity: item.quantity };
    } catch (error) {
      if (error.status === 404) return null;
      return new Error(error.message || "Product API unavailable");
    }
    return null;
  }));
  const availableItems = items.filter(Boolean);

  if (items.some(item => item instanceof Error)) {
    message.textContent = "Unable to load product details from the live store API. Check the backend and database connection.";
    document.getElementById("prepare-payment").disabled = true;
    return;
  }

  if (!cart.length) {
    message.innerHTML = 'Your cart is empty. <a href="products.html">Browse the catalog</a>.';
    document.getElementById("prepare-payment").disabled = true;
    return;
  }
  if (!availableItems.length) {
    message.innerHTML = 'Your cart items are no longer available. <a href="cart.html">Return to your cart</a> to remove them.';
    document.getElementById("prepare-payment").disabled = true;
    return;
  }

  currentLines = availableItems;
  renderSummary(availableItems);
  const signinPrompt = document.getElementById("signin-prompt");
  if (!session?.user) {
    signinPrompt.hidden = false;
    document.getElementById("prepare-payment").disabled = true;
  } else {
    await fillDefaultAddress();
  }

  const hasUnavailableItems = items.some((item, index) => !item || item.product.stock < cart[index].quantity);
  if (hasUnavailableItems) {
    message.innerHTML = 'At least one item or quantity is no longer available. <a href="cart.html">Review your cart</a> before continuing.';
    document.getElementById("prepare-payment").disabled = true;
  }

  const config = await window.ShopCraftAPI.publicConfig().catch(() => null);
  if (!config?.databaseConfigured) {
    showConfig("Checkout requires the live PostgreSQL database. No local or demo orders are available.");
    document.getElementById("prepare-payment").disabled = true;
  }

  document.getElementById("checkout-form").addEventListener("submit", beginCheckout);
  document.getElementById("pay-success").addEventListener("click", () => submitPayment("success"));
  document.getElementById("pay-failure").addEventListener("click", () => submitPayment("failure"));
});

function renderSummary(items) {
  const container = document.getElementById("checkout-items");
  let subtotal = 0;
  container.innerHTML = items.map(({ product, quantity }) => {
    subtotal += Number(product.price) * quantity;
    return `<div class="checkout-summary-line"><span>${escapeHtml(product.name)} × ${quantity}</span><strong>${formatCurrency(product.price * quantity)}</strong></div>`;
  }).join("");
  const shipping = subtotal >= 150 ? 0 : 12;
  document.getElementById("checkout-subtotal").textContent = formatCurrency(subtotal);
  document.getElementById("checkout-shipping").textContent = shipping ? formatCurrency(shipping) : "Complimentary";
  document.getElementById("checkout-total").textContent = formatCurrency(subtotal + shipping);
}

async function fillDefaultAddress() {
  try {
    const { data } = await window.ShopCraftAPI.addresses();
    const address = data.find(item => item.isDefault) || data[0];
    if (!address) return;
    for (const key of ["recipientName", "line1", "line2", "city", "state", "postalCode", "country"]) {
      const input = document.querySelector(`[name="${key}"]`);
      if (input && address[key]) input.value = address[key];
    }
  } catch { /* The customer can enter an address directly. */ }
}

async function beginCheckout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = document.getElementById("prepare-payment");
  const message = document.getElementById("checkout-message");
  const configNote = document.getElementById("payment-config-note");
  if (!window.ShopCraftAPI.accessTokenReady) {
    document.getElementById("signin-prompt").hidden = false;
    return;
  }
  submit.disabled = true;
  message.textContent = "Checking current prices and stock…";
  configNote.hidden = true;
  const data = new FormData(form);
  const shippingAddress = {
    recipientName: String(data.get("recipientName") || "").trim(),
    line1: String(data.get("line1") || "").trim(),
    line2: String(data.get("line2") || "").trim() || undefined,
    city: String(data.get("city") || "").trim(),
    state: String(data.get("state") || "").trim(),
    postalCode: String(data.get("postalCode") || "").trim(),
    country: String(data.get("country") || "US").trim().toUpperCase(),
  };
  const items = currentLines.map(line => ({ productId: Number(line.product.id), quantity: Number(line.quantity) }));
  const signature = JSON.stringify({ items, shippingAddress });
  let idempotencyKey = sessionStorage.getItem("sc_checkout_key");
  if (sessionStorage.getItem("sc_checkout_signature") !== signature || !idempotencyKey) {
    idempotencyKey = crypto.randomUUID();
    sessionStorage.setItem("sc_checkout_key", idempotencyKey);
    sessionStorage.setItem("sc_checkout_signature", signature);
  }

  try {
    const created = await window.ShopCraftAPI.createPayment({ items, shippingAddress, idempotencyKey });
    activeOrder = created;
    document.getElementById("payment-box").classList.remove("is-hidden");
    submit.hidden = true;
    message.textContent = `Order ${created.orderNumber} is ready for simulated payment. No money will be charged.`;
    document.getElementById("payment-message").textContent = "Choose a test outcome below. This is not a real payment.";
  } catch (error) {
    message.textContent = error.message;
    if (error.restartCheckout) {
      sessionStorage.removeItem("sc_checkout_key");
      sessionStorage.removeItem("sc_checkout_signature");
      submit.textContent = "Start a new payment attempt";
    }
    submit.disabled = false;
    if (!error.restartCheckout) submit.textContent = "Retry price and stock check";
  }
}

async function submitPayment(outcome) {
  if (!activeOrder) return;
  const successButton = document.getElementById("pay-success");
  const failureButton = document.getElementById("pay-failure");
  const message = document.getElementById("payment-message");
  successButton.disabled = true;
  failureButton.disabled = true;
  message.textContent = "Recording simulated payment outcome…";
  try {
    const result = await window.ShopCraftAPI.simulatePayment(activeOrder.orderId, outcome);
    message.textContent = result.notice || "Simulated payment recorded. No money was charged.";
    if (result.status === "SUCCEEDED") {
      const returnUrl = `${location.origin}/order-confirmation.html?orderId=${encodeURIComponent(activeOrder.orderId)}`;
      location.href = returnUrl;
      return;
    }
    sessionStorage.removeItem("sc_checkout_key");
    sessionStorage.removeItem("sc_checkout_signature");
    document.getElementById("checkout-message").textContent = "Simulated payment failed. No money was charged, and reserved stock was released. Return to your cart to try again.";
    document.getElementById("payment-box").classList.add("is-hidden");
    document.getElementById("prepare-payment").hidden = false;
    document.getElementById("prepare-payment").disabled = false;
  } catch (error) {
    message.textContent = error.message || "Could not record the simulated payment.";
    successButton.disabled = false;
    failureButton.disabled = false;
  }
}

function showConfig(message) {
  const note = document.getElementById("payment-config-note");
  note.textContent = message;
  note.hidden = false;
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
