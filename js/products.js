// ── Products Page ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;
let currentPage = 1;
let filtered = [];
let searchTimeout = null;

// State (read from URL + DOM)
function getState() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: (document.getElementById("search-input")?.value || params.get("search") || "").toLowerCase().trim(),
    category: document.getElementById("category-filter")?.value || params.get("category") || "",
    sort: document.getElementById("sort-filter")?.value || params.get("sort") || "newest",
    inStock: document.getElementById("instock-toggle")?.getAttribute("aria-pressed") === "true",
  };
}

document.addEventListener("DOMContentLoaded", function () {

  // Populate categories
  const catSelect = document.getElementById("category-filter");
  CATEGORIES.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat; opt.textContent = cat;
    catSelect.appendChild(opt);
  });

  // Init from URL params
  const params = new URLSearchParams(window.location.search);
  if (params.get("category")) catSelect.value = params.get("category");
  if (params.get("sort")) document.getElementById("sort-filter").value = params.get("sort");
  if (params.get("search")) document.getElementById("search-input").value = params.get("search");

  // Event listeners
  document.getElementById("search-input").addEventListener("input", function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; render(); }, 380);
  });

  document.getElementById("category-filter").addEventListener("change", () => { currentPage = 1; render(); });
  document.getElementById("sort-filter").addEventListener("change", () => { currentPage = 1; render(); });

  document.getElementById("instock-toggle").addEventListener("click", function () {
    const pressed = this.getAttribute("aria-pressed") === "true";
    this.setAttribute("aria-pressed", String(!pressed));
    this.classList.toggle("active", !pressed);
    currentPage = 1; render();
  });

  // Product grid click — add to cart
  document.getElementById("product-grid").addEventListener("click", function (e) {
    const btn = e.target.closest(".card-add-btn");
    if (!btn) return;
    e.preventDefault();
    const id = parseInt(btn.dataset.id);
    const product = PRODUCTS.find(p => p.id === id);
    if (product && product.stock > 0) {
      addToCart(id, 1);
      showToast(product.name + " added to cart!");
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = "+"; }, 1200);
    }
  });

  render();
});

function applyFilters() {
  const { search, category, sort, inStock } = getState();
  let list = [...PRODUCTS];
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search) || p.category.toLowerCase().includes(search));
  if (category) list = list.filter(p => p.category === category);
  if (inStock) list = list.filter(p => p.stock > 0);
  list.sort((a, b) => {
    if (sort === "price_asc") return a.price - b.price;
    if (sort === "price_desc") return b.price - a.price;
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "rating") return b.rating - a.rating;
    return b.id - a.id; // newest
  });
  return list;
}

function render() {
  filtered = applyFilters();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  // Results count
  const state = getState();
  let countText = total + " product" + (total !== 1 ? "s" : "");
  if (state.category) countText += " in " + state.category;
  document.getElementById("results-count").textContent = countText;

  // Grid
  const grid = document.getElementById("product-grid");
  const noResults = document.getElementById("no-results");
  if (page.length === 0) {
    grid.innerHTML = "";
    noResults.classList.remove("hidden");
  } else {
    noResults.classList.add("hidden");
    grid.innerHTML = page.map(p => renderProductCard(p)).join("");
  }

  // Active filter chips
  renderChips();

  // Pagination
  renderPagination(currentPage, totalPages);
}

function renderProductCard(p) {
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

function renderChips() {
  const state = getState();
  const chips = [];
  if (state.search) chips.push({ label: "Search: " + state.search, remove: () => { document.getElementById("search-input").value = ""; currentPage = 1; render(); } });
  if (state.category) chips.push({ label: "Category: " + state.category, remove: () => { document.getElementById("category-filter").value = ""; currentPage = 1; render(); } });
  if (state.inStock) chips.push({ label: "In Stock Only", remove: () => { const t = document.getElementById("instock-toggle"); t.setAttribute("aria-pressed","false"); t.classList.remove("active"); currentPage = 1; render(); } });

  const container = document.getElementById("active-filters");
  container.innerHTML = chips.map((c, i) => `
    <span class="filter-chip">
      ${c.label}
      <button onclick="(${c.remove.toString()})()" aria-label="Remove filter">✕</button>
    </span>
  `).join("");

  // Simpler approach — use event delegation
  if (chips.length > 0) {
    container.innerHTML = "";
    chips.forEach(c => {
      const chip = document.createElement("span");
      chip.className = "filter-chip";
      chip.innerHTML = c.label;
      const btn = document.createElement("button");
      btn.innerHTML = "✕"; btn.setAttribute("aria-label", "Remove " + c.label + " filter");
      btn.addEventListener("click", c.remove);
      chip.appendChild(btn);
      container.appendChild(chip);
    });
  }
}

function renderPagination(page, totalPages) {
  const nav = document.getElementById("pagination");
  if (totalPages <= 1) { nav.innerHTML = ""; return; }
  let html = `<button class="page-btn" onclick="goToPage(${page - 1})" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">&#8249;</button>`;
  const pages = buildPageRange(page, totalPages);
  pages.forEach(p => {
    if (p === "...") html += `<span class="page-ellipsis">…</span>`;
    else html += `<button class="page-btn ${p === page ? "active" : ""}" onclick="goToPage(${p})" aria-label="Page ${p}" ${p === page ? 'aria-current="page"' : ""}>${p}</button>`;
  });
  html += `<button class="page-btn" onclick="goToPage(${page + 1})" ${page >= totalPages ? "disabled" : ""} aria-label="Next page">&#8250;</button>`;
  nav.innerHTML = html;
}

function buildPageRange(current, total) {
  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) range.push(i);
    else if (range[range.length - 1] !== "...") range.push("...");
  }
  return range;
}

function goToPage(p) {
  currentPage = p;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearAllFilters() {
  document.getElementById("search-input").value = "";
  document.getElementById("category-filter").value = "";
  document.getElementById("sort-filter").value = "newest";
  const t = document.getElementById("instock-toggle");
  t.setAttribute("aria-pressed","false"); t.classList.remove("active");
  currentPage = 1; render();
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
