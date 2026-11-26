# EZQRPRINT

EZQRPRINT gives print shops a permanent customer QR page and an owner portal for print orders. Customers upload files without an account, receive a token, and can open the shop's UPI payment intent after printing. The owner verifies payment in their UPI app and completes the order.

## Features

- A4/A5 branded counter standee with a permanent shop QR code.
- PDF, JPG, JPEG, and PNG uploads up to 25 MiB per file, with print options and price estimates.
- Daily order tokens starting at `#101`, a shop-owner queue, print/download tools, and daily earnings history.
- Optional merchant UPI ID and payee name. EZQRPRINT only opens the installed UPI app; it does not process or verify payments.
- Order file bytes expire after 24 hours. Order summaries remain in earnings history.

## Stack and cost

- React, TypeScript, Vite, and Cloudflare Pages Functions.
- Cloudflare D1 stores owner accounts, shop settings, and orders.
- Cloudflare Workers KV stores uploaded file bytes.
- The project uses Cloudflare's Free plan allowances and does not require Firebase, R2, or a paid Cloudflare plan. Free-plan quotas are hard limits: once reached, backend requests pause until reset or storage is freed. KV has 1 GB storage and D1 has 5 GB total storage under the current Free allowances.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

Wrangler serves the Pages Functions and the frontend together at the local URL it prints. Local D1 and KV data are separate from production. Run `npm test` for the frontend tests.

## Cloudflare Pages deployment

The Git-connected Pages project builds the `main` branch with `npm run build` and publishes `dist`. The checked-in [wrangler.jsonc](wrangler.jsonc) binds the Pages Functions to the `ezqrprint_db` D1 database and `EZQRPRINT_FILES` KV namespace. The database schema is in [migrations/0001_initial.sql](migrations/0001_initial.sql).

Before first use, apply the migration once in the Cloudflare D1 console, or run `npm run db:migrate:remote` from a Wrangler-authenticated terminal. Then push changes to `main`; Pages builds and deploys automatically. No Firebase environment variables are required.

## Account and payment notes

- Shop owners register with email and a password of at least 8 characters. The app does not send account verification or password reset emails.
- Customer orders do not ask for names, phone numbers, or email addresses. The browser stores the random order ID so a customer can return to the order.
- A customer's **I Have Paid** button is only a claim. Shop owners should confirm the money arrived in their UPI app before completing the order.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) for operating details.
