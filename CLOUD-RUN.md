# Run HIDI without installing Node or Docker on your laptop

This project is prepared for GitHub Codespaces + a hosted Supabase PostgreSQL database.
Your office laptop only needs a browser.

## 1. Create a private GitHub repository

Create an empty private repository, for example `hidi-commerce`.
Open it in GitHub Codespaces (`Code` -> `Codespaces` -> `Create codespace`).

## 2. Put this project into the Codespace

Upload `hidi-v1-cloud.zip` into the Codespace Explorer, then in the terminal run:

```bash
unzip hidi-v1-cloud.zip
cd hidi-v1-cloud
```

If you instead pushed these files to the repository root, just work from the repository root.

## 3. Create a Supabase PostgreSQL database

Create a Supabase project. Copy its Postgres connection string.
Use the pooled connection string for normal application runtime.

Create `.env` and `apps/api/.env` from `.env.cloud.example`:

```bash
cp .env.cloud.example .env
cp .env.cloud.example apps/api/.env
```

Put your actual `DATABASE_URL` in both files.
Never commit `.env` or secrets.

## 4. Install packages

A Codespace created from the included `.devcontainer` installs Node 24 and pnpm automatically.
If needed, run:

```bash
corepack enable
corepack prepare pnpm@10.15.1 --activate
pnpm install
```

## 5. Create the database schema and sample products

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## 6. Start HIDI

```bash
pnpm dev
```

Codespaces will forward ports 3000 and 4000. Open the Ports tab and copy the forwarded URLs.

Update `.env` and `apps/api/.env`:

```env
WEB_ORIGIN=https://<your-3000-url>
API_URL=https://<your-4000-url>/v1
NEXT_PUBLIC_API_URL=https://<your-4000-url>/v1
```

Restart `pnpm dev` after changing environment variables.

## 7. Razorpay test mode

Add Test Mode credentials only:

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

For webhook testing, make port 4000 public in the Codespaces Ports tab and configure Razorpay webhook URL as:

`https://<your-4000-url>/v1/payments/razorpay/webhook`

Do not use live keys until production security and end-to-end tests are complete.

## 8. What does NOT need to be installed on the office laptop

- Node.js
- Docker Desktop
- PostgreSQL
- Redis / Valkey
- WSL2
- VS Code desktop

Everything runs remotely in the Codespace and Supabase.
