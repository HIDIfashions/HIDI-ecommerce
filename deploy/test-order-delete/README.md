# Owner test-order cleanup

`/admin/test-orders` is an owner-only, audited, recoverable cleanup tool. Owners look up an exact order number, explicitly attest it was created only for testing, then review deletion separately. Delete and restore both require the exact number and a reason. No bulk operation is provided. The normal Orders list links to this page for owners.

Only already-cancelled orders without payment records (including failed payments), active/consumed reservations, inventory movements, shipments, returns, wallet/reward activity or coupon activity can be verified/deleted. Every action rechecks the current database state under a serializable transaction and row lock; stale revisions and duplicate submissions fail closed. Restore only restores list visibility. No operation refunds, restocks, cancels, reactivates or permanently erases an order. Incorrect verification can be removed separately.

Storage uses append-only, namespaced OrderAuditEvent entries. No schema migration or Order/payment/inventory write is needed. A successful delete hides the record from admin list, queue and global order search; the retained detail and audit remain. Deployment does not classify or delete any existing order.

The release overlays an exact captured pair of production images, checks a bounded file allowlist, backs up both images, and uses ownership-aware conditional deployment/recovery. Existing payment, inventory, checkout, offer and reporting code is retained. All new mutations are tested only against a disposable loopback SQL Server. Six actual-runtime browser cases cover desktop/mobile Chromium, Firefox and WebKit, plus retained checkout, purchase, offer, admin-auth and media regression suites. Live checks are read-only.
