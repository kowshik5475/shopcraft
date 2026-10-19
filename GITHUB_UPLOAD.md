# Uploading ShopCraft to GitHub safely

This package is prepared as source code for a GitHub repository. It does not contain `node_modules`, a real `.env` file, local database files, or a `.git` directory.

## Before uploading

1. Review `.env.example` and keep only placeholder values in it.
2. Add real secrets only to your deployment provider's environment/secrets settings. Never commit `.env`, Stripe secret keys, webhook secrets, database passwords, or JWT secrets.
3. Keep `package-lock.json` committed so installs can be reproduced.
4. Do not upload `node_modules` or generated build/test output.
5. The included `vercel.json` configures the storefront's clean URLs. The Express API must run on a compatible Node.js host unless you separately configure a supported serverless deployment. A static frontend deployment alone does not deploy the Express API.

## Recommended update method for an existing GitHub repository

Prefer using Git rather than uploading a ZIP over the repository in the browser:

```bash
git clone https://github.com/kowshik5475/shopcraft.git
cd shopcraft
# Back up your current working tree, then copy the files from this package into this folder.
git status --short
git diff --check
git diff --stat
git diff
```

Review the diff before committing. Do not overwrite or delete repository files you intentionally need without checking them first. Then commit and push the reviewed changes.

## Local validation

```bash
npm ci
npm run db:generate
npx prisma validate
npm test
```

Database-backed checks additionally require a PostgreSQL database configured through `DATABASE_URL`. Payment-flow checks require Stripe test-mode credentials and a configured test webhook. Do not use live payment credentials for development tests.

See `README.md` and `POST_UPGRADE_AUDIT.md` for setup instructions and the current verification boundary. The report does not claim that a real database migration, Stripe sandbox payment, or browser end-to-end purchase has been verified.
