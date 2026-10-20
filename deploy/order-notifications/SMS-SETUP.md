# HIDI paid-order SMS setup

Prepared with sending disabled. This channel observes the same committed ORDER_CONFIRMED event
and captured-payment condition as the existing notification worker. It does not send a
payment-received message for unpaid or COD orders. The shipping address telephone is
not substituted for the recorded order customerPhone. No promotional opt-in is reused.

## Approved provider configuration

- Header: HIDIIN; PE ID: 1701179068941616531.
- DLT template: 1777179221872632213 (approved).
- MSG91 Flow template: 6ad3197ba8dca687a20f1e62.
- Named variables: order_number and amount. Amount uses rupees with two decimals, without
  commas or a currency prefix; verify decimal amounts during provider delivery testing.
- Keep short_url=0 so the approved static URL is not rewritten.
- CTA: https://hidiindia.com/privacy, ID 1714108020640278004, Active on Smartping.
- MSG91 CTA validation remains unresolved; support was contacted. Do not enable sending
  merely because Smartping approved the template.

## Database preparation

Use the existing authorized private SQL migration route. Confirm the API points to the
expected database and inspect current schema/history before applying anything.
Verify the database is online and PITR retention/restore points are available first.
Apply only these pending migrations through the normal SQL Server Prisma migration
process, recording checksums in migration history:

1. 20261010090000_order_notifications (if not already applied): creates the durable outbox.
2. 20261017090000_order_sms_notifications: extends its channel constraint to SMS in a
   transaction. Existing rows, unique per-order/channel index and financial tables remain.

Do not edit an already-applied migration, grant the runtime identity DDL permissions,
or enable public database access. Verify the runtime identity retains SELECT/INSERT/UPDATE
on the outbox. A missing original migration causes the SMS migration to fail safely.
The previous readiness evidence is historical; it is not proof of current live schema.

## Disabled deployment and activation

Use the existing notification-module-only image composer, immutable image backup and
guarded rollback. Preserve the live API outside that module and all storefront files.
Install with ORDER_SMS_ENABLED=false and ORDER_SMS_PROVIDER_VERIFIED=false.
Keep the existing master switch and original activation cutoff unchanged during preparation.
Never enable email or WhatsApp as a side effect of activating SMS.

After MSG91 verifies the template and a user-controlled delivery test succeeds:

- Set MSG91_ORDER_SMS_TEMPLATE_ID to the Flow template ID above (not the DLT ID).
- Use the existing MSG91_AUTHKEY secret, or a dedicated MSG91_SMS_AUTHKEY secret.
- Set ORDER_SMS_PROVIDER_VERIFIED=true and ORDER_SMS_ENABLED=true.
- Enable the master ORDER_NOTIFICATIONS_ENABLED only with the intended channel flags.
- Set ORDER_SMS_START_AT to SMS activation UTC and preserve it thereafter. SMS requires
  this separate cutoff and uses the later of it and the master cutoff, excluding older orders.
- Set ORDER_NOTIFICATIONS_START_AT only if absent; preserve an existing master cutoff.
- Verify one new paid order, one SMS queue row, provider acceptance and actual delivery.

UNKNOWN represents uncertain delivery/submission and must be reconciled against provider
logs, never automatically resent. SENT means provider acceptance, not handset delivery.
Stop SMS using ORDER_SMS_ENABLED=false; keep rows and schema for reconciliation.

## Validation

- API TypeScript check and notification/SMS unit tests require no live credentials.
- tests/order-notifications.sqlserver.mjs exercises both migrations, preserved rows,
  payment/history exclusions, concurrent SMS enqueue and uncertain-send recovery using
  disposable localhost SQL Server only. It refuses Azure hosts.
