# FreshBasket

A PERN grocery delivery application with customer, store-manager and delivery-partner interfaces. Built with React, Tailwind CSS, Express, PostgreSQL and Prisma.

## What works

- Responsive storefront, categories, search, organic filter and price sorting.
- Persistent basket and address → payment → review checkout.
- Customer registration and cookie-based sessions with Argon2 password hashing.
- Cash-on-delivery ordering with server-calculated totals and stock reservation.
- Admin product creation/editing/archiving, packing workflow and partner assignment.
- Delivery availability, assigned orders, pickup and delivery-code confirmation.
- Browser geolocation updates and a Leaflet map refreshed every five seconds.
- Stripe Checkout integration, signed webhooks and duplicate-event protection.
- Inngest functions for assignment recovery, payment reconciliation and email outbox processing.
- Receipt and low-stock emails through Resend when configured.
- Database constraints, migrations, seed data and API integration tests.

The catalog contains 16 sample bundles using the supplied category images. Prices are INR minor units (paise); they include applicable taxes. Shipping is ₹39 below ₹499 and free from ₹499. This is a portfolio application, not a live grocery business.

## Run locally

Requires Node.js 22.12+ (24 recommended), npm and PostgreSQL. Docker Desktop is the easiest local database option; Neon also works.

From the extracted `freshbasket` folder:

```sh
npm ci
```

Copy the environment example. In Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

On macOS/Linux:

```sh
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env`. Set `SEED_PASSWORD` to a password of at least 10 characters. The same value initializes all three local demo accounts; no password is shipped in the source. Leave the optional service keys blank initially.

Start PostgreSQL (Docker Desktop must be running):

```sh
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:5173**. The frontend proxies `/api` to Express at port 4000. Use `localhost`, not another hostname, because authenticated writes validate the configured `WEB_URL` origin.

If port 5432 is already occupied, change the Docker host port and both database URLs. If using Neon instead of Docker, set `DATABASE_URL` to the pooled URL and `DIRECT_URL` to the direct URL, then skip `docker compose up -d`.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Customer | customer@freshbasket.test | Your `SEED_PASSWORD` |
| Admin | admin@freshbasket.test | Your `SEED_PASSWORD` |
| Delivery partner | partner@freshbasket.test | Your `SEED_PASSWORD` |

The seed preserves existing accounts and stock on subsequent runs. Changing `SEED_PASSWORD` does not reset existing passwords. Seed only development/demo databases; provision individual accounts for real deployments.

### Demonstrate the complete flow

1. Sign in as customer. Add products and place a cash-on-delivery order.
2. Note the order's delivery code; it is visible only to the customer.
3. Sign out and sign in as admin. Open the order, start packing, mark ready, and assign a partner.
4. Sign in as the partner. Open the assigned order and confirm pickup.
5. Optionally share your browser location. Keep the page open during delivery.
6. Enter the customer's code, confirm cash collection and complete delivery.
7. Sign in as customer again to see the completed timeline.

Separate browser profiles can show all three roles simultaneously. Inngest is optional for this manual flow.

## Structure

```text
apps/api/
  prisma/             PostgreSQL schema, migration and sample catalog
  src/auth.js         Registration, login, sessions and role middleware
  src/orders.js       Inventory transactions and order transitions
  src/payments.js     Stripe checkout and verified settlement
  src/jobs.js         Scheduled work and notification outbox
  src/app.js          Express API and validation
  src/server.js       Local server entry point
apps/web/
  src/Shop.jsx        Catalog, basket, login and checkout
  src/Dashboards.jsx  Order tracking, admin and delivery interfaces
  src/lib.jsx         API client and shared state
  src/style.css       Responsive layout and Tailwind integration
  public/assets/      Supplied grocery imagery
 tests/               Integration tests
```

## Design decisions

**Authentication:** random session tokens in HttpOnly/SameSite cookies; only token hashes are stored in PostgreSQL. Session lookup reads the current role. Public registration always creates a customer. Trusted-origin validation protects browser mutations. Role checks and order-ownership checks run on the server.

**Orders:** prices come from the database, never the browser. Serializable transactions reserve inventory and create item snapshots together. An idempotency key prevents repeated checkout requests from creating duplicate orders. Negative inventory and conflicting partner assignments are prevented by SQL constraints.

**Delivery:** one active delivery per partner. Only the assigned partner may publish location or move an order from ready → picked up → delivered. Successful delivery requires the customer's code. Attempts are rate-limited. Cash is marked collected when the partner confirms delivery.

**Tracking:** authenticated polling every five seconds, not WebSocket streaming. Coordinates are stored on the order and exposed only to authorized viewers. A timestamp distinguishes stale locations. Browser background tracking is not guaranteed.

**Payments:** payment success is accepted from signed Stripe events, not redirect URLs. Settlement verifies order ID, session, amount and currency; transactionally deduplicates events and queues the receipt. Expired Stripe sessions restore stock once.

## Optional services

### Stripe test mode

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the API environment. The card option appears only when a Stripe key is configured.

For local testing with the official Stripe CLI:

```sh
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

Use the printed webhook signing secret in `.env`, then restart the API. Subscribe to `checkout.session.completed`, `checkout.session.expired` and `checkout.session.async_payment_succeeded` in the deployed webhook configuration.

The integration restricts Checkout to card payments. The API uses a stable Stripe idempotency key. A failed network call between creating a Stripe session and saving its ID can require manual reconciliation: inventory is deliberately retained rather than automatically released while a charge might exist. Inspect the Stripe dashboard using order metadata before cancelling such attempts. Refunds are not implemented in this version; paid orders cannot be cancelled from the customer interface.

### Inngest and email

With the API running, start the Inngest local development server:

```sh
npx inngest-cli@latest dev -u http://localhost:4000/api/inngest
```

Keep `INNGEST_DEV=1` locally. In production remove that setting, configure Inngest event/signing keys, and register the deployed `/api/inngest` endpoint. Jobs run once a minute.

Set `RESEND_API_KEY`, a verified `EMAIL_FROM`, and `ADMIN_EMAIL` to enable outbound email. Receipts are queued transactionally with confirmation; low-stock summaries are queued at most once per UTC day. Stable provider idempotency keys reduce duplicate sends. Unsent mail older than 23 hours is retained for manual review because provider deduplication has a finite window. Without email credentials, queued notifications remain in the database and no messages are sent.

Offer/marketing campaigns, unsubscribe management and automated refunds are future work.

## Testing

Use a separate PostgreSQL database named `freshbasket_test`, apply migrations to it, then run the tests. They create and clean up their own fixtures. Never point tests at a production database.

PowerShell example:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/freshbasket_test"
$env:DIRECT_URL=$env:DATABASE_URL
$env:WEB_URL="http://localhost:5173"
npm run db:migrate
npm test
```

The GitHub Actions workflow provisions PostgreSQL 17, builds the frontend, applies migrations and runs the suite on pushes/PRs.

Validation performed during creation: production Vite build; Prisma client generation; 12 API integration tests against the SQL migration loaded into embedded PostgreSQL (PGlite), covering authentication, authorization, idempotency, stock rollback, order transitions, delivery, cancellation and payment settlement. Stripe network checkout, actual email delivery and hosted Vercel/Neon deployment require your accounts and have not been end-to-end tested. The included CI workflow has not run on GitHub yet.

## Deploy to Vercel + Neon

1. Push this monorepo to GitHub and create a Neon database. Use separate development/production databases or branches.
2. Run `npm run db:migrate` once against the target database using its direct URL. Do not run `migrate dev` against production.
3. Create a Vercel API project with root `apps/api`; include files outside the root for workspace dependencies. The Express default export is `src/app.js`. Build command is `npm run generate`. Configure `DATABASE_URL`, `DIRECT_URL`, `WEB_URL`, `NODE_ENV=production` and optional integration keys. Keep `WEB_URL` equal to the final frontend origin without a trailing slash.
4. Create a Vercel frontend project with root `apps/web`, Vite preset, build command `npm run build`, output `dist`.
5. Copy `apps/web/vercel.example.json` to `apps/web/vercel.json` and replace `YOUR-API-PROJECT` with the deployed API hostname. Keep the API rewrite ahead of the SPA fallback. Redeploy the frontend.
6. Register the deployed Stripe webhook and Inngest handler. Remove `INNGEST_DEV` in production.
7. Verify login cookies through the frontend domain, create a test order and run all role transitions before sharing the live URL.

Only server-side Vercel settings receive secrets. Nothing sensitive belongs in `VITE_*`. The API relies on the same-origin frontend rewrite for browser access. Admin metrics and lists currently cover the latest 100 orders; they are labelled accordingly. Replace in-memory rate limiting with a shared store before scaling across instances. Use an appropriate map tile service for sustained public traffic.

## Push to GitHub

Create an empty repository named `freshbasket-pern` in your GitHub account. From this project folder:

```sh
git init
git add .
git status
git commit -m "Build FreshBasket grocery delivery application"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/freshbasket-pern.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your account name. `git status` should not include `.env`, dependencies, or build output; `.gitignore` excludes them. Keep `package-lock.json`, migrations, tests and this README. The repository URL is the hyperlink to add to your résumé; a hosted demo is a separate link.

## Résumé wording

**FreshBasket — Grocery Delivery Application | React, Node.js, Express, PostgreSQL, Prisma**

- Built customer, admin and delivery-partner workflows with role-based access, inventory management and order tracking.
- Implemented transactional stock reservation, idempotent checkout and delivery-code verification; added API integration tests for access control and order processing.

Describe Stripe and Inngest as integrations until you have configured and demonstrated them. Do not claim production users, performance gains or live deployment without measuring or verifying them.

## Assets

Grocery images were supplied in the user's `grocery-assets.zip` tutorial pack, whose source references GreatStack. Original asset rights remain with their owners; no new license is granted for those assets. The application logic and FreshBasket presentation were assembled for this project. Check the original asset terms before public redistribution or replace the images with assets you own.
