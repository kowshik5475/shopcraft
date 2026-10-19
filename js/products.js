// Product catalog data is always loaded from the live API.
const PAGE_SIZE = 12;
let currentPage = Math.max(1, Number(new URLSearchParams(location.search).get("page")) || 1);
let renderRequest = 0;
let searchTimeout = null;
let liveCatalogProducts = new Map();

function getState() {
  const params = new URLSearchParams(location.search);
  const searchInput = document.getElementById("search-input");
  const categoryInput = document.getElementById("category-filter");
  const sortInput = document.getElementById("sort-filter");
  const minInput = document.getElementById("min-price");
  const maxInput = document.getElementById("max-price");
  return {
    search: searchInput ? searchInput.value : params.get("search") || "",
    category: categoryInput ? categoryInput.value : params.get("category") || "",
    sort: sortInput ? sortInput.value : params.get("sort") || "newest",
    minPrice: minInput ? minInput.value : params.get("minPrice") || "",
    maxPrice: maxInput ? maxInput.value : params.get("maxPrice") || "",
    featured: params.get("featured") === "true",
    inStock: document.getElementById("instock-toggle")?.getAttribute("aria-pressed") === "true",
  };
}

document.addEventListener("DOMContentLoaded", async function () {
  const params = new URLSearchParams(location.search);
  const catSelect = document.getElementById("category-filter");
  try {
    const result = await window.ShopCraftAPI.request("/api/categories");
    const categories = result.data.map(category => category.name);
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      catSelect.appendChild(option);
    });
  } catch (error) {
    showCatalogUnavailable(error);
    return;
  }

  if (params.get("category")) catSelect.value = params.get("category");
  if (params.get("sort")) document.getElementById("sort-filter").value = params.get("sort");
  if (params.get("search")) document.getElementById("search-input").value = params.get("search");
  if (params.get("minPrice")) document.getElementById("min-price").value = params.get("minPrice");
  if (params.get("maxPrice")) document.getElementById("max-price").value = params.get("maxPrice");

  document.getElementById("search-input").addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; render(); }, 300);
  });
  for (const id of ["category-filter", "sort-filter", "min-price", "max-price"]) {
    document.getElementById(id).addEventListener("change", () => { currentPage = 1; render(); });
  }
  document.getElementById("instock-toggle").addEventListener("click", function () {
    const pressed = this.getAttribute("aria-pressed") === "true";
    this.setAttribute("aria-pressed", String(!pressed));
    this.classList.toggle("active", !pressed);
    currentPage = 1;
    render();
  });

  const grid = document.getElementById("product-grid");
  grid.addEventListener("click", function (event) {
    const add = event.target.closest(".card-add-btn");
    const wish = event.target.closest(".card-wishlist-btn");
    if (add) {
      const id = Number(add.dataset.id);
      const product = liveCatalogProducts.get(id);
      if (!product || product.stock < 1) return;
      addToCart(id, 1);
      showToast(`${product.name} added to cart!`);
      add.textContent = "✓";
      setTimeout(() => { add.textContent = "+"; }, 1200);
    }
    if (wish) {
      const saved = toggleWishlist(Number(wish.dataset.id));
      wish.classList.toggle("is-saved", saved);
      wish.setAttribute("aria-pressed", String(saved));
      wish.setAttribute("aria-label", saved ? "Remove from wishlist" : "Add to wishlist");
      showToast(saved ? "Saved to your wishlist" : "Removed from your wishlist");
    }
  });
  render();
});

async function render() {
  const requestId = ++renderRequest;
  const state = getState();
  const params = {
    page: currentPage,
    pageSize: PAGE_SIZE,
    sort: state.sort,
    ...(state.search ? { search: state.search } : {}),
    ...(state.category ? { category: state.category } : {}),
    ...(state.minPrice ? { minPrice: state.minPrice } : {}),
    ...(state.maxPrice ? { maxPrice: state.maxPrice } : {}),
    ...(state.inStock ? { inStock: "true" } : {}),
    ...(state.featured ? { featured: "true" } : {}),
  };

  const grid = document.getElementById("product-grid");
  const count = document.getElementById("results-count");
  const noResults = document.getElementById("no-results");
  const status = document.getElementById("catalog-status");
  grid.setAttribute("aria-busy", "true");
  if (status) status.textContent = "Updating products…";

  let data;
  try {
    data = await window.ShopCraftAPI.products(params);
  } catch (error) {
    if (requestId !== renderRequest) return;
    grid.innerHTML = "";
    count.textContent = "Catalog unavailable";
    noResults.classList.add("hidden");
    if (status) status.textContent = `Unable to load products from the store API. ${error.message} Check the database connection and try again.`;
    grid.setAttribute("aria-busy", "false");
    document.getElementById("pagination").replaceChildren();
    return;
  }
  if (requestId !== renderRequest) return;

  const records = data.data || [];
  liveCatalogProducts = new Map(records.map(product => [Number(product.id), product]));
  const total = Number(data.total ?? records.length);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  count.textContent = `${total} product${total === 1 ? "" : "s"}${state.category ? ` in ${state.category}` : ""}`;
  grid.innerHTML = records.map(renderProductCard).join("");
  noResults.classList.toggle("hidden", records.length > 0);
  if (records.length === 0) noResults.classList.remove("hidden");
  grid.setAttribute("aria-busy", "false");
  if (status) status.textContent = "";
  renderChips(state);
  renderPagination(currentPage, totalPages);
}

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
          ${product.stock > 0
            ? `<button class="card-add-btn" data-id="${Number(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart" title="Add to cart">+</button>`
            : `<span class="out-of-stock-badge">Out of stock</span>`}
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderChips(state) {
  const container = document.getElementById("active-filters");
  const chips = [
    ...(state.search ? [["Search", state.search, () => { document.getElementById("search-input").value = ""; }] ] : []),
    ...(state.category ? [["Category", state.category, () => { document.getElementById("category-filter").value = ""; }]] : []),
    ...(state.minPrice ? [["Min price", `$${state.minPrice}`, () => { document.getElementById("min-price").value = ""; }]] : []),
    ...(state.maxPrice ? [["Max price", `$${state.maxPrice}`, () => { document.getElementById("max-price").value = ""; }]] : []),
    ...(state.featured ? [["Collection", "Featured", () => { history.replaceState(null, "", "products.html"); }]] : []),
    ...(state.inStock ? [["Availability", "In stock", () => {
      const toggle = document.getElementById("instock-toggle");
      toggle.setAttribute("aria-pressed", "false");
      toggle.classList.remove("active");
    }]] : []),
  ];
  container.replaceChildren();
  chips.forEach(([label, value, clear]) => {
    const chip = document.createElement("span");
    chip.className = "filter-chip";
    chip.append(document.createTextNode(`${label}: ${value} `));
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Remove ${label} filter`);
    button.textContent = "×";
    button.addEventListener("click", () => { clear(); currentPage = 1; render(); });
    chip.append(button);
    container.append(chip);
  });
}

function renderPagination(page, totalPages) {
  const nav = document.getElementById("pagination");
  if (totalPages <= 1) { nav.replaceChildren(); return; }
  nav.replaceChildren();
  const add = (label, target, active = false, disabled = false) => {
    const button = document.createElement("button");
    button.className = `page-btn${active ? " active" : ""}`;
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    if (active) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => goToPage(target));
    nav.append(button);
  };
  add("‹", page - 1, false, page <= 1);
  const range = [...new Set([1, totalPages, page - 1, page, page + 1].filter(index => index >= 1 && index <= totalPages))].sort((a, b) => a - b);
  let previous = 0;
  for (const index of range) {
    if (index - previous > 1) {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-ellipsis";
      ellipsis.textContent = "…";
      nav.append(ellipsis);
    }
    add(String(index), index, index === page);
    previous = index;
  }
  add("›", page + 1, false, page >= totalPages);
}

function goToPage(page) {
  currentPage = page;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearAllFilters() {
  history.replaceState(null, "", "products.html");
  document.getElementById("search-input").value = "";
  document.getElementById("category-filter").value = "";
  document.getElementById("sort-filter").value = "newest";
  document.getElementById("min-price").value = "";
  document.getElementById("max-price").value = "";
  const toggle = document.getElementById("instock-toggle");
  toggle.setAttribute("aria-pressed", "false");
  toggle.classList.remove("active");
  currentPage = 1;
  render();
}

function showCatalogUnavailable(error) {
  const status = document.getElementById("catalog-status");
  const grid = document.getElementById("product-grid");
  const count = document.getElementById("results-count");
  if (status) status.textContent = `The live product catalog is unavailable. ${error.message} Check the API and database configuration.`;
  if (grid) grid.innerHTML = "";
  if (count) count.textContent = "Catalog unavailable";
  const noResults = document.getElementById("no-results");
  noResults?.classList.add("hidden");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
