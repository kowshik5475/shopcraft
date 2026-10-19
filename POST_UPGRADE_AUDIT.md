# ShopCraft post-upgrade audit and no-demo update

## Runtime demo mode removed

- Product/category/review endpoints use PostgreSQL only; there is no in-memory catalog fallback.
- The Express server refuses to start unless `DATABASE_URL` is configured and PostgreSQL is reachable.
- Browser pages do not load bundled catalog records. `prisma/seed-products.js` is used only by the explicit database seed command.
- Guest cart and wishlist values may be kept temporarily in the browser and merged when the customer signs in. This is a guest-shopping feature, not a product-catalog or checkout simulation.
- No order or payment is simulated. Stripe must be configured and verified through the signed webhook before an order is fulfilled.

## Security hardening in this source

- JWT secrets must be independently configured, non-placeholder values of at least 32 characters.
- Access and refresh JWTs use separate audiences and strict claim validation.
- Refresh-token rotation uses a transaction and conditional consume operation to prevent concurrent reuse.
- Cookie-authenticated refresh/logout require the exact configured origin.
- Stripe success webhook processing checks the PaymentIntent/order amount and currency before fulfillment, and stale failures cannot downgrade an order after it leaves the pending state.
- The health endpoint reports PostgreSQL connectivity only; it does not claim that Stripe or checkout is healthy.
- Customer cart, wishlist, address, and order operations are scoped to the authenticated customer.
- The npm dependency override was added to address the previously identified `deepmerge-ts` advisory.

## Checks on the no-demo source update

- `node --check` across JavaScript files in `server/`, `js/`, `prisma/`, and `tests/`: PASS.
- A new `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline` attempt timed out in this environment.
- `npm test` after that incomplete install: NOT PASS; two test files could not load because `jsonwebtoken` and `zod` were unavailable. The remaining six tests shown by Node passed. This is an environment/dependency-install failure, not a passing full test suite.
- PostgreSQL migrations, seed execution, database-backed customer workflows, Stripe sandbox checkout/webhooks, and browser end-to-end testing: NOT RUN because required services/credentials are unavailable.

## Required before production checkout

1. Install dependencies successfully with `npm ci`.
2. Configure PostgreSQL and run `npm run db:generate`, `npm run db:deploy`, and `npm run db:seed`.
3. Replace the starter records in `prisma/seed-products.js` with the actual product catalog, prices, image URLs, and inventory before accepting customer orders.
4. Configure Stripe test-mode keys and a webhook for `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, and `charge.refunded`.
5. Exercise success, failure, duplicate webhooks, cancellation, late payment success, and stock concurrency against isolated test services.
6. Configure a scheduler for `POST /api/maintenance/expire-orders` so abandoned inventory reservations are released.
7. Test the deployed browser journey from registration through checkout and order history.

The current checkout is configured for USD and US address defaults. Tax calculation, coupons, carrier API integration, international fulfillment, and partial-refund accounting are not implemented or verified. No live payment was performed, and checkout must not be described as production-verified until the external-service tests pass.
