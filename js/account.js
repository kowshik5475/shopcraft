document.addEventListener("DOMContentLoaded", async () => {
  const authPanel = document.getElementById("auth-panel");
  const accountPanel = document.getElementById("account-panel");
  const form = document.getElementById("auth-form");
  const tabs = [...document.querySelectorAll("[data-auth-mode]")];
  let authMode = "login";

  function message(element, text, success = false) {
    element.textContent = text;
    element.classList.toggle("success", success);
  }

  function setMode(mode) {
    authMode = mode;
    const registration = mode === "register";
    document.getElementById("name-field").hidden = !registration;
    document.getElementById("password-note").hidden = !registration;
    document.querySelector("#auth-form [name=password]").autocomplete = registration ? "new-password" : "current-password";
    document.getElementById("auth-submit").textContent = registration ? "Create account" : "Log in";
    tabs.forEach(tab => {
      const active = tab.dataset.authMode === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    message(document.getElementById("auth-message"), "");
  }
  tabs.forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.authMode)));

  async function renderAccount(user) {
    authPanel.hidden = Boolean(user);
    accountPanel.hidden = !user;
    if (!user) return;
    document.getElementById("customer-name").textContent = user.name;
    document.getElementById("customer-email").textContent = user.email;
    document.getElementById("profile-name").value = user.name;
    await loadAddresses();
  }

  async function loadAddresses() {
    const target = document.getElementById("address-list");
    try {
      const { data } = await window.ShopCraftAPI.addresses();
      if (!data.length) {
        target.innerHTML = '<p class="text-muted">No saved addresses yet.</p>';
        return;
      }
      target.innerHTML = data.map(address => `
        <article class="address-card">
          <div class="inline-actions" style="justify-content:space-between">
            <strong>${escapeHtml(address.label || address.recipientName)}</strong>
            ${address.isDefault ? '<span class="tag">Default</span>' : ""}
            <button class="btn btn-ghost btn-sm" data-delete-address="${escapeHtml(address.id)}" type="button">Remove</button>
          </div>
          <p>${escapeHtml(address.recipientName)} · ${escapeHtml(address.line1)}${address.line2 ? `, ${escapeHtml(address.line2)}` : ""}</p>
          <p>${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.postalCode)} · ${escapeHtml(address.country)}</p>
        </article>`).join("");
      target.querySelectorAll("[data-delete-address]").forEach(button => button.addEventListener("click", async () => {
        if (!confirm("Remove this saved address?")) return;
        try {
          await window.ShopCraftAPI.deleteAddress(button.dataset.deleteAddress);
          await loadAddresses();
          showToast("Address removed");
        } catch (error) { showToast(error.message); }
      }));
    } catch (error) {
      target.innerHTML = `<p class="text-muted">${escapeHtml(error.message)}</p>`;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = document.getElementById("auth-submit");
    const data = new FormData(form);
    const payload = {
      email: String(data.get("email") || "").trim(),
      password: String(data.get("password") || ""),
      ...(authMode === "register" ? { name: String(data.get("name") || "").trim() } : {}),
    };
    submit.disabled = true;
    message(document.getElementById("auth-message"), authMode === "register" ? "Creating your account…" : "Signing you in…");
    try {
      const result = authMode === "register"
        ? await window.ShopCraftAPI.register(payload)
        : await window.ShopCraftAPI.login(payload);
      form.reset();
      await renderAccount(result.user);
      message(document.getElementById("auth-message"), "");
      showToast(result.syncedCount ? `${result.syncedCount} cart/wishlist item${result.syncedCount === 1 ? "" : "s"} synced to your account` : `Welcome, ${result.user.name.split(" ")[0]}`);
      const params = new URLSearchParams(location.search);
      if (params.get("return") === "checkout") setTimeout(() => { location.href = "checkout.html"; }, 350);
      if (params.get("return") === "product" && /^\d+$/.test(params.get("productId") || "")) {
        setTimeout(() => { location.href = `product.html?id=${encodeURIComponent(params.get("productId"))}`; }, 350);
      }
    } catch (error) {
      message(document.getElementById("auth-message"), error.message);
      showToast(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await window.ShopCraftAPI.logout();
      await renderAccount(null);
      showToast("You’ve been signed out");
    } catch (error) { showToast(error.message); }
  });

  document.getElementById("profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = document.getElementById("profile-name");
    try {
      const result = await window.ShopCraftAPI.updateProfile(input.value.trim());
      document.getElementById("customer-name").textContent = result.user.name;
      message(document.getElementById("profile-message"), "Profile updated.", true);
    } catch (error) {
      message(document.getElementById("profile-message"), error.message);
    }
  });

  document.getElementById("address-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = Object.fromEntries(data.entries());
    input.isDefault = data.get("isDefault") === "on";
    input.country = String(input.country || "US").toUpperCase();
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await window.ShopCraftAPI.saveAddress(input);
      form.reset();
      form.querySelector("[name=country]").value = "US";
      message(document.getElementById("address-message"), "Address saved.", true);
      await loadAddresses();
    } catch (error) {
      message(document.getElementById("address-message"), error.message);
    } finally {
      submit.disabled = false;
    }
  });

  const health = await window.ShopCraftAPI.request("/api/health").catch(() => null);
  if (!health || health.database !== "connected") document.getElementById("account-config").hidden = false;
  const session = await window.ShopCraftAPI.restoreSession();
  await renderAccount(session?.user || null);
  window.addEventListener("shopcraft:session", event => renderAccount(event.detail.user));
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}
