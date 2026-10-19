# ShopCraft — customer-side e-commerce

ShopCraft keeps the original responsive vanilla HTML/CSS/JavaScript storefront and adds a Node.js/Express API, PostgreSQL persistence through Prisma, customer accounts, saved items, order history, and a Stripe PaymentIntent checkout. The original numeric product IDs and a temporary guest cart that syncs on sign-in are preserved. Runtime demo mode is disabled.

## Features

- Product discovery: full-text search, category, stock, featured, price range, sorting, pagination, recommendations, ratings/badges, responsive product details, lazy-loaded images.
- Customer account: registration/login, 15-minute access JWT, single-use rotating 30-day refresh JWT in an `HttpOnly` cookie, profile name, saved delivery addresses.
- Guest and signed-in cart/wishlist, with a max-quantity merge when a guest signs in.
- Order history and owned-order detail/cancel routes. Shipment tracking is displayed only when shipment data exists.
- Server-authoritative checkout prices and stock reservation, integer cents, idempotency keys, Stripe PaymentElement/PaymentIntent, webhook-driven payment confirmation, and signed webhook event deduplication.
- PostgreSQL constraints/indexes, full-text GIN index, request IDs, Helmet, exact-origin CORS, rate limits, and a health endpoint.
- Database-only product catalog. The server refuses to start without a configured and reachable PostgreSQL database; the browser never falls back to bundled product data.

## Start locally

Requirements: Node.js 20+, PostgreSQL, and a Stripe test-mode account for payments.

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

## Supported checkout market

The current checkout is configured for **USD prices and Stripe USD PaymentIntents**, with United States as the default delivery country, flat USD shipping, and no tax calculation. The address format accepts ISO-style two-letter country codes, but country-specific shipping rates, tax, currency conversion, and international fulfillment are not implemented or verified. Do not describe this deployment as an international checkout. To launch in another market, implement and test country-specific address validation, shipping/tax pricing, currency-aware display and gateway amounts, and any local payment method before changing the displayed currency.

## Configure payment sandbox

Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` as backend environment variables. Point a Stripe test-mode webhook to:

```text
https://YOUR_API_HOST/api/payments/webhook
```

Subscribe to `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, and `charge.refunded`. The browser's return page only reports status; the signed webhook is the source of truth for fulfillment. Inventory is reserved for 30 minutes and released on cancellation/setup failure. Configure `SHOPCRAFT_CRON_SECRET` and schedule a `POST /api/maintenance/expire-orders` request with `Authorization: Bearer <secret>` every few minutes to release abandoned reservations; do not put that secret in browser code. No tax calculation, discount/coupon engine, refund administration, or carrier integration is included; tax is currently zero, and shipment tracking is manual data.

## Deploy frontend and API

- The Express server can serve the storefront and API together. Set `APP_ORIGIN` to that exact browser origin.
- For a static Vercel frontend plus a separate API host, set `window.SHOPCRAFT_API_BASE` in `js/config.js` to the HTTPS API origin. Set backend `APP_ORIGIN` to the exact HTTPS frontend origin (no path or trailing slash). For a cross-site frontend/API deployment, use HTTPS and set `COOKIE_SAME_SITE=none`; `COOKIE_SECURE=true` is required for `SameSite=None`, and production always forces secure cookies. SameSite defaults to `lax`. Keep the API CORS origin exact.
- Add all secrets using the host's environment/secrets manager; never commit `.env`.
- Configure PostgreSQL, then run `npm run db:generate`, `npm run db:deploy`, and `npm run db:seed` against that environment. Set the Stripe webhook secret for the deployed webhook endpoint.
- `GET /api/health` reports whether PostgreSQL is reachable (it does not claim Stripe, migrations, or checkout are healthy). `GET /api/config` exposes only the public Stripe publishable key and a database-configured flag.

The Vercel config supports clean URLs for the storefront pages. When hosting its API elsewhere, the project remains a static frontend and the Express server runs as a separate Node service.

## API outline

| Area | Routes |
|---|---|
| Public catalog | `GET /api/products`, `/api/products/:id`, `/api/products/:id/related`, `/api/products/:id/reviews`, `/api/categories` |
| Auth | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`; `GET /api/auth/me` |
| Customer data | `/api/cart`, `/api/wishlist`, `/api/profile`, `/api/addresses`, `/api/orders` |
| Checkout | `POST /api/payments/create`, `/api/payments/verify`; `POST /api/payments/webhook` |
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

The package includes a database migration and Stripe integration code, but those live services need the operator's own `DATABASE_URL` and Stripe test credentials. The app refuses to start without a configured and reachable PostgreSQL database. If Stripe is not configured, checkout cannot complete; the application does not simulate orders or payments.

The hardening tests cover JWT/config validation, refresh-token compare-and-swap behavior under concurrent requests, checkout calculations, and Stripe PaymentIntent amount/currency matching. They are unit tests and do not replace API integration tests against an isolated PostgreSQL database or Stripe sandbox webhook/payment-flow tests.

## Original project references

- Repository: https://github.com/kowshik5475/shopcraft
- Original author information remains in the source project's prior documentation.
