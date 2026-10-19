# ShopCraft — customer-side e-commerce

ShopCraft keeps the original responsive vanilla HTML/CSS/JavaScript storefront and adds a Node.js/Express API, PostgreSQL persistence through Prisma, customer accounts, saved items, order history, and a simulated payment checkout. The original numeric product IDs and a temporary guest cart that syncs on sign-in are preserved. Runtime demo mode is disabled.

## Features

- Product discovery: full-text search, category, stock, featured, price range, sorting, pagination, recommendations, ratings/badges, responsive product details, lazy-loaded images.
- Customer account: registration/login, 15-minute access JWT, single-use rotating 30-day refresh JWT in an `HttpOnly` cookie, profile name, saved delivery addresses.
- Guest and signed-in cart/wishlist, with a max-quantity merge when a guest signs in.
- Order history and owned-order detail/cancel routes. Shipment tracking is displayed only when shipment data exists.
- Server-authoritative checkout prices and stock reservation, integer cents, idempotency keys, explicitly labelled simulated payment outcomes persisted in PostgreSQL; no payment gateway or real money is involved.
- PostgreSQL constraints/indexes, full-text GIN index, request IDs, Helmet, exact-origin CORS, rate limits, and a health endpoint.
- Database-only product catalog. The server refuses to start without a configured and reachable PostgreSQL database; the browser never falls back to bundled product data.

## Start locally

Requirements: Node.js 20+ and PostgreSQL. Payments are simulated for this student project; no payment gateway is used.

```sh
cp .env.example .env
# Replace the example values. Both JWT secrets must be independent,
# non-placeholder values of at least 32 characters.
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The server refuses to start unless both independent JWT secrets are configured, even in development. `npm test` runs the unit tests. `npm run db:migrate` is available for local iterative development; use the committed migration with `npm run db:deploy` for deployment.

The initial seed records live in `prisma/seed-products.js`; they are loaded into PostgreSQL only by the explicit seed command and are never served to browsers or used as a runtime fallback. These are starter catalog records, not a verified real-world inventory. Replace their names, prices, image URLs, and stock with your actual catalog before accepting customer orders. Re-running the seed updates product copy/prices but does not reset stock or review aggregates.

## Checkout and simulated payments

The checkout uses **simulated payments for this student project**. No Stripe account, payment gateway, card details, webhook, or payment credentials are required, and no real money is charged. After the backend creates an order and reserves stock, the customer can explicitly choose **Simulate successful payment** or **Simulate failed payment**. The backend records the selected educational test outcome in PostgreSQL. A failed simulation cancels the pending order and releases reserved inventory. Do not present this as a real payment system or use it for commercial orders.

The current sample catalog and checkout use USD display/pricing, United States as the default delivery country, flat shipping, and no tax calculation. Country-specific shipping rates, tax, currency conversion, and international fulfillment are not implemented. Configure `SHOPCRAFT_CRON_SECRET` and schedule a `POST /api/maintenance/expire-orders` request with `Authorization: Bearer <secret>` every few minutes to release abandoned reservations; never put that secret in browser code. No discount/coupon engine, refund administration, or carrier integration is included; tax is currently zero, and shipment tracking is manual data.

## Deploy frontend and API

- The Express server can serve the storefront and API together. Set `APP_ORIGIN` to that exact browser origin.
- For a static Vercel frontend plus a separate API host, set `window.SHOPCRAFT_API_BASE` in `js/config.js` to the HTTPS API origin. Set backend `APP_ORIGIN` to the exact HTTPS frontend origin (no path or trailing slash). For a cross-site frontend/API deployment, use HTTPS and set `COOKIE_SAME_SITE=none`; `COOKIE_SECURE=true` is required for `SameSite=None`, and production always forces secure cookies. SameSite defaults to `lax`. Keep the API CORS origin exact.
- Add all secrets using the host's environment/secrets manager; never commit `.env`.
- Configure PostgreSQL, then run `npm run db:generate`, `npm run db:deploy`, and `npm run db:seed` against that environment. No payment gateway credentials or webhook setup is needed.
- `GET /api/health` reports whether PostgreSQL is reachable (it does not claim migrations or checkout are healthy). `GET /api/config` exposes the database-configured flag and explicitly reports simulated payment mode.

The Vercel config supports clean URLs for the storefront pages. When hosting its API elsewhere, the project remains a static frontend and the Express server runs as a separate Node service.

## API outline

| Area | Routes |
|---|---|
| Public catalog | `GET /api/products`, `/api/products/:id`, `/api/products/:id/related`, `/api/products/:id/reviews`, `/api/categories` |
| Auth | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`; `GET /api/auth/me` |
| Customer data | `/api/cart`, `/api/wishlist`, `/api/profile`, `/api/addresses`, `/api/orders` |
| Checkout | `POST /api/payments/create`, `/api/payments/simulate`, `/api/payments/verify` |
| Maintenance | `POST /api/maintenance/expire-orders` (requires the server-side cron bearer secret) |
| Health/config | `GET /api/health`, `GET /api/config` |

All order, address, cart, and wishlist data is scoped to the authenticated user. Reviews require a completed purchase. Payment amounts and product stock are revalidated by the server.

## Project layout

- `server/` — Express app, auth middleware, routes, catalog/commerce helpers.
- `prisma/schema.prisma` — PostgreSQL data model.
- `prisma/migrations/` — committed initial migration, including the PostgreSQL full-text expression index and check constraints.
- `prisma/seed.js` and `prisma/seed-products.js` — explicit database seeding only.
- `js/`, `*.html`, `css/` — storefront and browser API client; no bundled product catalog is loaded by the browser.
- `tests/` — Node's built-in test runner.

## Verification boundary

The application requires a configured, reachable PostgreSQL database and does not use runtime demo data. Payment outcomes are simulated for educational use only and persisted to PostgreSQL; no real money is charged. Automated unit tests do not replace API integration tests against an isolated PostgreSQL database.

## Original project references

- Repository: https://github.com/kowshik5475/shopcraft
- Original author information remains in the source project's prior documentation.
