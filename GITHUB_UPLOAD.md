# Uploading ShopCraft safely to GitHub

This repository has **runtime demo mode disabled**. The storefront reads product data from the Express API backed by PostgreSQL. The bundled starter catalog is used only by the explicit Prisma seed command.

## Before uploading

1. Confirm `.env` is not staged. Commit `.env.example` only.
2. Do not include Stripe secret keys, JWT secrets, database credentials, private keys, production dumps, or customer data.
3. Keep `package-lock.json` so installs are reproducible.
4. Keep Prisma schema and migration files.
5. Review the diff before committing:

   ```sh
   git status --short
   git diff --check
   git diff --stat
   ```

## Required runtime configuration

- PostgreSQL: `DATABASE_URL`
- Independent random JWT secrets: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (at least 32 characters each)
- Exact browser origin: `APP_ORIGIN`
- Stripe test-mode keys for sandbox checkout: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `SHOPCRAFT_CRON_SECRET` and a scheduler for abandoned-order cleanup

## First run

```sh
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm test
npm start
```

The server intentionally refuses to start without a configured, reachable PostgreSQL database. The initial seed records in `prisma/seed-products.js` are starter data; replace them with your actual catalog and stock before accepting customer orders. Checkout must be tested with Stripe test mode and a signed webhook before it is considered verified.

Do not push directly to production until the PostgreSQL and Stripe sandbox checks in `POST_UPGRADE_AUDIT.md` have passed.
