# Paid-order confirmations

This addition observes the existing committed `ORDER_CONFIRMED` audit event. It never changes checkout, capture, refunds, inventory, wallet deductions or storefront files. Confirmation runs in a separate worker about every ten seconds. Razorpay and wallet-only orders are eligible only when their payment is captured and their order is confirmed, packed, shipped or delivered.

Every order/channel has one durable SQL queue row. Concurrent callbacks, webhook retries, replicas and worker restarts cannot create a second row. Resend retries reuse the identical saved request and idempotency key for at most 23 hours. WhatsApp submissions with an uncertain result stop at `UNKNOWN` for provider-log reconciliation; they are never automatically resubmitted. `SENT` means the provider accepted the request, not proof of inbox or WhatsApp delivery.

Only new confirmation events at or after the explicit activation cutoff are eligible. Historical test orders are not backfilled. Email and WhatsApp operate independently. WhatsApp uses an approved five-variable order utility template and the customer's existing recorded WhatsApp opt-in. Marketing and OTP templates are not reused.

## Backup and installation

Source backups:

- `backup/pre-order-notifications-api-20261010` at `94379230e64f3149512782e0a9d092792e0bc0fc`
- `backup/pre-order-notifications-web-20261010` at `3861367c73820c239f46716dfbd570911214a31c`

The guarded installation takes fresh immutable API/web snapshots, saves the current API image under `backup-order-notifications-<run id>` in ACR, and preserves the entire live API base. It changes only the compiled AppModule registration and adds the new notification directory. It verifies every other live application/dependency file, Docker configuration, Azure environment variable, secret reference, identity, resource setting and health probe. It leaves the web image unchanged and rolls back its own candidate on failed verification. Installation leaves notifications disabled and makes no live SQL changes.

## Activation prerequisites

The current deployment account cannot read Azure SQL database or backup metadata (`Microsoft.Sql/servers/databases/read`). The signed-in Azure portal owner session verified the database is online, has seven-day PITR retention, and exposes restore points from 2026-10-03. The checkpoint is saved in `evidence/sql-backup-checkpoint.json`. The portal Query Editor cannot connect because public access is disabled; use the existing authorized private database migration route to apply the additive table. Do not widen application permissions or change the SQL administrator as a workaround.

1. Verify `hidi-sql-validation` on `sql-hidi-prod-0927` is online, its earliest restore date precedes the checkpoint, and short-term restore retention is enabled. Save the checkpoint timestamp and returned backup metadata. Keep the API and web rollback digests from the installation artifact.
2. An existing authorized SQL owner applies `apps/api/prisma/migrations-sqlserver/20261010090000_order_notifications/migration.sql` in a transaction. It creates one notification table, constraints and indexes; it does not alter financial or customer tables. Record the migration checksum in the existing Prisma migration history, or run the normal authorized Prisma migrate deploy process. Verify the runtime identity has its existing SELECT/INSERT/UPDATE access to the new table, without granting schema ALTER.
3. Configure one channel first and verify its sender/template in the provider dashboard. Store API keys as Azure Container App secrets, never inline or in Git.
4. Set an explicit UTC `ORDER_NOTIFICATIONS_START_AT` at activation time and `ORDER_NOTIFICATIONS_ENABLED=true`. Preserve that original cutoff through all restarts and future releases.
5. Place a user-controlled live test order. Confirm the HIDI order is confirmed, the provider accepted its notification, and the customer's inbox received it. Replaying the original callback/webhook must not create another queue row. No deployment script charges a customer or sends a test message.

## Email configuration (Resend)

- `RESEND_API_KEY`: secret reference, with sending permission for the verified sender domain.
- `ORDER_FROM_EMAIL`: a sender on that verified domain, for example `HIDI <orders@hidiindia.com>` only after the domain is verified in Resend.
- `ORDER_EMAIL_ENABLED=true`.
- `ORDER_WHATSAPP_ENABLED=false` while WhatsApp is not configured.

The confirmation includes order number, product/size/color/quantity, subtotal, discount, shipping, tax, total paid, wallet/gateway split where applicable, and delivery address. It contains no private guest-order link or checkout token. Sender verification needs the Resend-provided DNS records; those records must not be guessed.

## WhatsApp configuration (MSG91)

- `MSG91_WHATSAPP_AUTHKEY`: optional dedicated secret; otherwise the existing `MSG91_AUTHKEY` is used.
- `MSG91_WHATSAPP_INTEGRATED_NUMBER`: the onboarded WhatsApp business number.
- `MSG91_ORDER_TEMPLATE_NAME`: approved utility template name.
- `MSG91_ORDER_TEMPLATE_NAMESPACE`: namespace from the approved template's API example.
- `MSG91_ORDER_TEMPLATE_LANGUAGE`: exact approved language, default `en`.
- `ORDER_WHATSAPP_ENABLED=true` only after provider approval and delivery testing.

The body variables are: `1` customer first name, `2` HIDI order number, `3` items and variants, `4` total paid in INR, `5` delivery address. Sample utility body:

> Hi {{1}}, your HIDI order {{2}} is confirmed and payment received. Items: {{3}}. Total paid: {{4}}. Delivery address: {{5}}. We will update you when your order is dispatched. Thank you for shopping with HIDI.

Customers without an existing WhatsApp opt-in are skipped for this channel; email remains independent. The sender/template integration must be verified against the provider's current API example before activation. Missing provider credentials or sender/template configuration remain `WAITING_CONFIG` without disrupting orders.

## Operations and rollback

The authenticated endpoint `GET /v1/admin/order-notifications` requires `order:read` and reports feature, schema readiness and counts by channel/status. It never returns recipients, message bodies or keys. A missing queue table is reported as not ready, so the disabled installation stays safe.

Disable sending with `ORDER_NOTIFICATIONS_ENABLED=false`. Preserve queued rows for reconciliation. Do not blindly retry `UNKNOWN` rows or resend an accepted message. The exact previous API image in the backup artifact can be restored without changing Razorpay secrets, probes, web image or checkout. The additive table can remain while the old API runs; deleting it is not required for rollback.

## Validation

- Customer/payment/checkout/wallet/auth and storefront regression: `pnpm test:customer-experience`.
- API compilation: `pnpm --filter @hidi/api build`.
- Release preservation and owned-image rollback: `python3 tests/order-notifications-release.test.py`.
- Disposable SQL Server regression: `node tests/order-notifications.sqlserver.mjs` with `NOTIFICATION_TEST_SQL_HOST=127.0.0.1`; the script refuses Azure hosts. Covers migration, historical/failed/review/unpaid exclusion, wallet capture, concurrent discovery/claims, lease fencing and crash recovery.
