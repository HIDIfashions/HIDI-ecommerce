# Admin sessions and sales deletion

Admin authentication now requires an eight-digit email OTP at every new login,
including on a previously used browser. There is no remembered-device bypass.
The browser exchanges email + OTP through the server; existing Supabase access
or refresh tokens and legacy admin keys cannot create an admin session.

The API stores SHA-256 hashes of random session credentials in
`dbo.AdminLoginSession`. Every guarded admin API operation checks the session,
the database clock, active staff membership and current role. A session expires
when its last activity is at least one hour old. Background reads and refreshes
do not extend the session. The browser reports real keyboard, pointer, touch and
scroll activity at most once every 15 seconds and redirects idle sessions to
sign-in. Logout revokes the server record. Cookies are HttpOnly, SameSite=Lax,
Secure in production and have no persistent Max-Age.

The production runtime serves **Admin → Delete sales** at `/admin/sales-delete`.
Both its page and API require the individually authenticated primary owner,
`fashionshidi@gmail.com`; other OWNER accounts cannot delete sales. The owner
previews a cutoff date, reviews the records and types the displayed confirmation.
Dates are interpreted at midnight Asia/Kolkata and the comparison is strictly
before the cutoff. A snapshot hash rejects a stale preview. All orders before
the cutoff are included, including cancelled and pending orders.

The SQL transaction locks the selected order range, writes a private recovery
copy to `dbo.AdminSalesDeletion`, deletes dependent order records, unlinks retained
wallet ledger entries and deletes the orders. It releases active inventory and
wallet reservations without restocking completed sales or changing settled wallet
balances. It does not call a payment/refund or courier API. The archive contains
customer data and is never returned by the public or admin API. Existing database
access restrictions apply. Do not publish archive contents in CI evidence.

`deploy/admin-security/schema.sql` is the idempotent Azure SQL owner migration.
The application has no DDL rights and retains explicit direct-write denials on
the audit and wallet ledger tables. The migration installs a constrained stored
procedure that only unlinks wallet entries and removes audit rows for a validated
archived order set inside the sales-deletion transaction. It grants execution of
that procedure, without removing either direct-write denial.

Deployment is currently blocked: the runtime cannot create tables, and the
existing migration job identity cannot log into the live database. No sales have
been deleted and neither new application image has been activated. An existing
SQL owner must execute the complete `deploy/admin-security/schema.sql` against
`hidi-sql-validation` on `sql-hidi-prod-0927.database.windows.net` through their
authorized private connection. Then dispatch **Admin OTP, idle expiry and owner
sales cleanup** on branch `migration/azure-sql-blob`. The workflow checks runtime
permissions, deploys tested images, performs rollback-only live verification,
and only then deletes sales before 10 October 2026. Do not change the SQL Entra
administrator, open network access, or give the runtime DDL permissions.

The release preserves the currently deployed API and web images and patches only
the authentication integration, new modules and relevant admin pages. The live
verification uses rollback-only fixtures to check revocation, expired sessions,
owner access and the India-time cutoff boundary before any real cleanup.

The requested one-time cleanup uses `2026-10-10`, equivalent to the exclusive
UTC cutoff `2026-10-09T18:30:00Z`. Its result is recorded in the release workflow's
`cleanup.json`; records on or after the cutoff are checked individually for
unchanged values. A repeat run finds no matching records and deletes nothing.
