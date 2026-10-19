# ShopCraft audit and hardening report

This report describes the hardened source and subsequent simulated-payment update.

## Current payment behavior

- Stripe SDK, API calls, publishable-key configuration, and webhook route have been removed from the runtime payment flow.
- Checkout creates orders and reserves stock using PostgreSQL, then offers an explicitly labelled simulated success or failure outcome.
- Simulated outcomes are recorded by the authenticated backend and persisted to PostgreSQL.
- Simulated success confirms the order; simulated failure cancels the order and releases reserved stock.
- No real payment is processed. This is for educational demonstration only, not commercial use.

## Security and architecture

- JWT secrets must be configured and are not given built-in fallback values.
- Access/refresh tokens use separate audiences and explicit token validation.
- Refresh-token rotation uses a database transaction.
- API customer data is scoped to the authenticated user.
- Product prices and stock are validated on the backend.
- The app requires a reachable PostgreSQL database; runtime demo catalog fallback remains disabled.

## Verification status

JavaScript syntax checks were run after the simulated-payment update. Full tests and database-backed integration tests still need to be run after dependencies are installed and a PostgreSQL test database is configured. Do not claim production readiness until migrations, auth/cart/order flows, inventory concurrency, and simulated payment success/failure have been tested against PostgreSQL.
