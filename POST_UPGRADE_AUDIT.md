# ShopCraft post-upgrade audit and hardening report

## Verified findings and fixes

- **JWT fallback secrets:** Authentication used predictable built-in defaults and only rejected those defaults in production. Startup now fails in every environment when either secret is missing, shorter than 32 characters, a known placeholder, or equal to the other secret.
- **JWT validation:** Access and refresh tokens now use separate audiences, explicit HS256 verification, a fixed issuer, required subject/type/expiration claims, and 15-minute / 30-day expirations.
- **Refresh rotation race:** The old refresh row was deleted and its replacement created in separate database operations. Rotation now consumes the presented hash with a conditional `deleteMany` and inserts its replacement inside one Prisma transaction, bound to the user id and unexpired row. A concurrent loser cannot mint another token or clear the winner's replacement cookie.
- **Cookie CSRF/configuration:** Cookie-authenticated refresh/logout accepted missing `Origin`; they now require the exact configured origin. Production requires an HTTPS exact `APP_ORIGIN`. Cookies default to `SameSite=Lax`; `SameSite=None` requires secure cookies.
- **Payment/order integrity:** A signed `payment_intent.succeeded` event now must match the saved PaymentIntent id (when recorded), order amount, payment amount, received amount, and currency before fulfillment. A stale failure event can no longer downgrade the payment after the order has left pending payment.
- **Health claim:** `/api/health` now reports `database-connected` rather than `production-ready`; it checks PostgreSQL connectivity only and does not prove Stripe, migrations, or checkout readiness.
- **Seed and ownership review:** The seed uses upserts and leaves stock untouched on later runs. Customer routes inspected scope carts, wishlists, addresses, and order reads/updates to `req.user.id`; order reservation decrements are conditional on current stock within a database transaction.
- **Market configuration:** The README now explicitly documents the current USD/United-States-default checkout and notes that international shipping rates, tax, conversion, and fulfillment are not implemented or verified. Currency behavior was not cosmetically relabeled.
- **Dependency advisory:** `npm audit` identified a high-severity `deepmerge-ts` advisory via Prisma's configuration dependency. A pinned `deepmerge-ts@8.0.0` override was added and verified with Prisma Client generation/schema validation; full `npm audit` now reports zero vulnerabilities.

## Files changed

- `server/config.js` — environment, origin, cookie, and CSRF-origin policy validation.
- `server/session.js` — transaction-scoped refresh-token compare-and-swap.
- `server/auth.js`, `server/routes/auth.js` — strict JWT checks and atomic refresh rotation.
- `server/commerce.js`, `server/routes/payments.js` — PaymentIntent/order consistency guard and out-of-order failure protection.
- `server/index.js` — truthful database health status.
- `package.json`, `package-lock.json` — patched transitive Prisma config dependency.
- `tests/auth-tokens.test.js`, `tests/security-config.test.js`, `tests/session.test.js`, `tests/commerce.test.js` — added coverage.
- `README.md` — setup/security/cookie/market and verification notes.

## Checks actually run

- `npm install --no-audit --no-fund` — PASS.
- `npm test` — PASS, 14 tests.
- `npm run db:generate` — PASS (Prisma Client 6.19.3).
- `npx prisma validate` — PASS.
- `node --check` across `server/`, `js/`, `prisma/`, and `tests/` — PASS.
- `npm audit --audit-level=high` — PASS, zero vulnerabilities.
- Startup without JWT secrets — correctly rejected.
- Local HTTP smoke test — PASS: server started with non-production test configuration, `/api/health` reported `database: not-configured`, `/api/products` returned the local demo catalog, and pagination returned two rows when requested.

## Not verified / remaining work

- **PostgreSQL migrations and DB-backed flows:** NOT RUN. `DATABASE_URL` is not configured, no local PostgreSQL server responds, and the Docker daemon is unavailable. Consequently Prisma migration deployment, seed execution/repeat behavior in a real DB, auth/cart/address/order persistence, inventory concurrency, ownership integration tests, and DB rollback behavior remain unverified.
- **Stripe sandbox:** NOT RUN. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are not configured. No PaymentIntent, webhook signature, duplicate event, failed-payment, cancellation race, late-success refund, or refund status was exercised against Stripe.
- **Browser end-to-end:** NOT RUN. No authenticated browser/customer workflow was available.
- **Scheduled cleanup:** The existing abandoned-order cleanup requires an external scheduler to invoke `/api/maintenance/expire-orders`; deployment scheduling was not verified.
- **Partial refunds:** The current schema tracks a single `REFUNDED` payment state and does not model partial-refund totals. Partial refund behavior remains unsupported.

Do not consider production checkout verified until an isolated PostgreSQL deployment and Stripe test-mode webhook exercise the scenarios in the original audit. No live or real payment was performed.

## Run locally

1. Copy `.env.example` to `.env`, set `DATABASE_URL`, and replace both JWT placeholders with independent secrets of at least 32 characters.
2. Configure Stripe test-mode credentials if sandbox checkout is being tested.
3. Run `npm install`, `npm run db:generate`, `npm run db:deploy`, `npm run db:seed`, then `npm start`.
4. Run `npm test` for unit tests.
