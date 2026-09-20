# HIDI Staging Deployment Runbook

This runbook publishes HIDI to a real HTTPS domain for private acceptance testing before the public launch.

## Target topology

- Frontend: Vercel, Next.js app in `apps/web`
- API: Railway, NestJS app in `apps/api`
- Database/Auth/Storage: separate Supabase staging project
- Payments: Razorpay Test Mode
- Source branch: `chore/staging-deployment-readiness` initially, then a dedicated `staging` branch after acceptance

Recommended hostnames:

- `staging.<your-domain>`
- `api-staging.<your-domain>`

Production hostnames remain untouched until staging acceptance.

## 1. Create the staging Supabase project

Create a separate Supabase project for staging. Do not reuse the future production database.

From Supabase -> Connect, copy the Session pooler connection string for the persistent NestJS service. Put it in `DATABASE_URL`.

Apply migrations with:

```bash
pnpm db:deploy
```

Seed only if staging needs disposable test catalogue data:

```bash
pnpm db:seed
```

Do not run the seed command against production.

## 2. Deploy the API to Railway

Connect the GitHub repository to a Railway service.

Use the repository root so pnpm can access the root lockfile/workspace.

Configure:

- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @hidi/api build`
- Pre-deploy command: `pnpm --filter @hidi/api prisma:deploy`
- Start command: `pnpm --filter @hidi/api start:prod`
- Healthcheck path: `/v1/health/ready`
- Restart policy: On Failure

Set the API environment variables from `.env.staging.example`.

Railway injects `PORT`; the API now honors that variable automatically.

After the first deployment, verify:

- `https://<railway-domain>/v1/health`
- `https://<railway-domain>/v1/health/ready`

The readiness endpoint must return `database: "ok"`.

## 3. Add the API staging domain

Create:

`api-staging.<your-domain>`

Attach it to the Railway API service and complete the DNS records shown by Railway.

After DNS/SSL is active, set:

```env
WEB_ORIGIN=https://staging.<your-domain>
API_URL=https://api-staging.<your-domain>/v1
NEXT_PUBLIC_API_URL=https://api-staging.<your-domain>/v1
```

Redeploy after changing environment variables.

## 4. Configure Razorpay Test Mode

Use Test Mode keys only.

Set:

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Create the Razorpay Test webhook:

`https://api-staging.<your-domain>/v1/payments/razorpay/webhook`

Subscribe at minimum to:

- `payment.captured`
- `payment.failed`

Confirm webhook signature validation before accepting staging.

## 5. Deploy the web app to Vercel

Import the same GitHub repository into Vercel.

Project settings:

- Framework: Next.js
- Root Directory: `apps/web`
- Install command: default pnpm install
- Build command: default Next.js build

Set frontend variables:

```env
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_API_URL=https://api-staging.<your-domain>/v1
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_WALLET_ENABLED=true
NEXT_PUBLIC_RETENTION_ENABLED=false
NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER=...
```

`NEXT_PUBLIC_APP_ENV=staging` makes HIDI emit no-index instructions and disallow crawlers through `robots.txt`.

## 6. Add the frontend staging domain

Create:

`staging.<your-domain>`

Attach it to Vercel and complete the required DNS records.

Confirm HTTPS is active before customer-journey testing.

## 7. Acceptance test

Test from at least one desktop browser and one physical mobile device.

### Storefront

- Home and navigation
- Product listing
- Product detail
- Variant images
- Size and colour selection
- Add to Bag
- Wishlist
- Recently viewed
- You may also like
- WhatsApp order button

### Checkout

- Customer authentication / OTP
- Address
- Inventory reservation
- Wallet application
- Razorpay Test payment
- Order confirmation

### Operations

- Admin order visibility
- Product image visibility in admin and customer views
- Pack / ship / deliver states
- Inventory deduction
- Reward pending amount
- Return request
- Return-window behavior
- Refund to wallet
- Exchange flow

### Reliability

- API `/v1/health`
- API `/v1/health/ready`
- Razorpay webhooks
- Supabase storage URLs
- CORS from the staging web domain
- Refresh/deep links
- Mobile network test
- Browser console free of blocking errors

## 8. Promotion to production

Only after staging acceptance:

1. Create/finalize the production Supabase project.
2. Create production API and frontend environments.
3. Use `www.<your-domain>` and `api.<your-domain>`.
4. Set `NEXT_PUBLIC_APP_ENV=production`.
5. Apply migrations with `pnpm db:deploy`.
6. Replace Razorpay Test credentials with Live credentials only in production secret storage.
7. Recreate the Razorpay webhook against the production API.
8. Run one controlled live-order smoke test.
9. Enable indexing only after legal pages, catalogue, shipping/return policy and launch content are approved.

## Rollback rule

Never fix a failed production deployment directly on `main`.

For staging, revert or redeploy the last known-good Git commit. Database migrations must be additive/backward-compatible where possible so the previous application build can still run during rollback.
