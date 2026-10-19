let checkoutStripe;
let checkoutElements;
let paymentElement;
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
    } catch { /* Continue with the local cart and let the server validate checkout. */ }
  }
  const items = await Promise.all(cart.map(async item => {
    try {
      const result = await window.ShopCraftAPI.product(item.productId);
      if (result.product) return { product: normalizeShopCraftProduct(result.product), quantity: item.quantity };
    } catch (error) {
      if (error.status === 404) return null;
    }
    const product = PRODUCTS.find(entry => entry.id === Number(item.productId));
    return product ? { product, quantity: item.quantity } : null;
  }));
  const availableItems = items.filter(Boolean);

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
    showConfig("Checkout is unavailable until PostgreSQL is configured, migrated, and seeded. This local demo will not simulate an order.");
    document.getElementById("prepare-payment").disabled = true;
  } else if (!config.stripePublishableKey || typeof window.Stripe !== "function") {
    showConfig("Stripe sandbox checkout needs STRIPE_PUBLISHABLE_KEY configured on the backend and Stripe.js available in this browser.");
    document.getElementById("prepare-payment").disabled = true;
  }

  document.getElementById("checkout-form").addEventListener("submit", beginCheckout);
  document.getElementById("pay-now").addEventListener("click", submitPayment);
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
    const config = await window.ShopCraftAPI.publicConfig();
    if (!config.stripePublishableKey) throw new Error("The order is awaiting a configured Stripe publishable key. Please do not submit payment again; contact the store administrator.");
    checkoutStripe = window.Stripe(config.stripePublishableKey);
    checkoutElements = checkoutStripe.elements({ clientSecret: created.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#2c2c2c", borderRadius: "6px", fontFamily: "Inter, system-ui, sans-serif" } } });
    paymentElement = checkoutElements.create("payment");
    paymentElement.mount("#payment-element");
    document.getElementById("payment-box").classList.remove("is-hidden");
    submit.hidden = true;
    message.textContent = `Order ${created.orderNumber} is ready. Complete the secure sandbox payment below.`;
    document.getElementById("payment-message").textContent = "";
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

async function submitPayment() {
  if (!checkoutStripe || !checkoutElements || !activeOrder) return;
  const button = document.getElementById("pay-now");
  const message = document.getElementById("payment-message");
  button.disabled = true;
  message.textContent = "Confirming your payment…";
  const returnUrl = `${location.origin}/order-confirmation.html?orderId=${encodeURIComponent(activeOrder.orderId)}`;
  const result = await checkoutStripe.confirmPayment({
    elements: checkoutElements,
    confirmParams: { return_url: returnUrl },
    redirect: "if_required",
  });
  button.disabled = false;
  if (result.error) {
    message.textContent = result.error.message || "Payment was not completed. Check your payment details and try again.";
    return;
  }
  if (["succeeded", "processing"].includes(result.paymentIntent?.status)) {
    message.textContent = "Payment sent for verification. Waiting for the order confirmation…";
    try { await window.ShopCraftAPI.verifyPayment(activeOrder.orderId); } catch { /* Stripe webhook remains the source of truth. */ }
    location.href = returnUrl;
    return;
  }
  message.textContent = "Payment needs another attempt. Check the payment details and try again.";
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
