# ShopCraft — Static Site

A fully static HTML5 + CSS3 + Vanilla JavaScript e-commerce product catalog.  
No build step required. Deploy directly to Vercel, Netlify, or GitHub Pages.

## File Structure

```
shopcraft-static/
├── index.html          ← Home page (hero, featured products, categories)
├── products.html       ← Full catalog (search, filter, sort, pagination)
├── product.html        ← Product detail page
├── cart.html           ← Shopping cart (localStorage)
├── css/
│   └── styles.css      ← All styles (responsive, accessible)
├── js/
│   ├── cart.js         ← Cart utilities (localStorage)
│   ├── home.js         ← Home page logic
│   ├── products.js     ← Catalog: search, filter, sort, pagination
│   ├── product-detail.js ← Detail page + add-to-cart
│   └── cart-page.js    ← Cart page rendering + actions
├── data/
│   └── products.js     ← 20 seeded products + CATEGORIES array
└── vercel.json         ← Vercel routing config
```

## Features

- **Search** — debounced 380ms, searches name + description + category
- **Filter** — by category, in-stock toggle, active filter chips
- **Sort** — newest, price low/high, name A–Z, highest rated
- **Pagination** — 12 per page with ellipsis navigation
- **Cart** — localStorage persistence, quantity controls, order summary
- **SEO** — unique `<title>` and `<meta description>` on every page
- **Accessibility** — ARIA labels, `aria-live` regions, keyboard navigation
- **Responsive** — mobile-first, works on all screen sizes

## Deploy to Vercel

1. Upload this folder (or push to GitHub)
2. On [vercel.com](https://vercel.com), import the project
3. Framework: **Other** (static site — no build command needed)
4. Click Deploy ✅

## Deploy to Netlify

Drag-and-drop the `shopcraft-static` folder onto [netlify.com/drop](https://app.netlify.com/drop).
