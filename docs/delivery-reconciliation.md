# Automatic delivery and COD reconciliation

HIDI checks eligible Delhivery AWBs every **six hours**. A confirmed customer delivery updates both the order and shipment to `DELIVERED`, records the courier's delivery timestamp, and writes an audit event. The admin and customer portals read that stored state on their next load.

COD collection is a separate transaction and a separate admin action. Delhivery documents that its delivery agent collects COD when delivering a COD shipment. HIDI confirms customer collection only when the authenticated tracking response matches the current AWB, reports `Delivered` / `DL`, identifies `OrderType: COD`, and reports `CODAmount` equal to the pending payment amount in INR. HIDI records this evidence in the `PAYMENT_CAPTURED` audit event. This does **not** confirm bank remittance.

If the amount or shipment type is missing or mismatched, delivery still completes. Payment stays `CREATED` (shown as **Collection pending**) and the order history records **COD collection needs review**. Subsequent six-hour checks can resolve missing evidence. Staff with `order:write` permission can independently confirm the exact amount under Payment after verifying collection. The delivery endpoint no longer accepts or acts on `codCollected`.

## Enable on the API server

```dotenv
DELHIVERY_SYNC_ENABLED=true
DELHIVERY_BASE_URL=https://track.delhivery.com
DELHIVERY_API_TOKEN=<existing production token>
```

Deploy the API and admin web changes together. Maintain at least one running API replica; an in-process worker cannot run while every replica is scaled to zero. No new database migration is needed: this uses the existing Azure SQL `BackgroundLease` table. The switch is opt-in and staging URLs cannot enable reconciliation. Turn `DELHIVERY_SYNC_ENABLED=false` to pause future checks.

The worker starts after 15 seconds, scans the database for due work once a minute, and processes at most 25 AWBs per batch. **It does not call the courier every minute.** Each AWB is atomically reserved in `BackgroundLease` under `tracking:<shipmentId>` until six hours after its check starts. The schedule survives restarts and prevents duplicate requests across replicas. A timeout, HTTP error, or process crash leaves the reservation intact; that AWB is retried at the next six-hour due time. Other AWBs continue. Each HTTP request has a 20-second timeout. A large initial backlog drains over successive batches.

Only the latest forward shipment is eligible, and only `SHIPPED` orders or `DELIVERED` orders with pending COD are polled. RTO, DTO, reverse movements, cancelled/returned orders, replaced AWBs, malformed/future timestamps and scans predating shipment are not applied. Delivered orders with resolved payments leave the queue. No bank transfers, courier modifications, or new customer messages are sent by this worker. Existing downstream processes may react to delivery/payment state as usual.

Delivery and payment writes lock and re-read the order, preserve existing financial states, and use stable audit keys. An error confirming COD cannot undo delivery. The logs emit counts only: checked, delivered, collected, review and failed. Raw tracking payloads and customer details are not logged.

## Validation

Unit coverage: `node --import tsx --test ../../tests/delhivery-sync.test.ts` from `apps/api`. Existing COD SQL integration coverage now verifies independent delivery and collection. `tests/delhivery-sync.sqlserver.mjs` exercises the real SQL queue, six-hour schedule, concurrent claims, restart behavior, status transactions and retries against a disposable local SQL Server. Never point these fixtures at production.

`tests/delhivery-sync.browser.mjs` checks the real Next admin page and proxy routes against a local fixture API, including desktop/mobile layouts. The delivery reconciliation GitHub Actions workflow runs the service, SQL and browser checks on relevant pull requests or manual dispatch. Offset-free courier timestamps are interpreted as IST; explicit offsets are preserved.

## Provider references

- [Shipment tracking API and response schema](https://delhivery-express-api-doc.readme.io/reference/testtrack-order): `AWB`, `Status.StatusType`, `OrderType`, `CODAmount`, `ReverseInTransit`.
- [Delhivery COD collection and remittance](https://help.delhivery.com/docs/cod-remittance): customer collection happens at delivery; bank remittance is a later process.
- [Delhivery's own payment-status integration](https://help.delhivery.com/home/docs/december): COD payment changes to paid when successfully delivered to the consignee.

Bank remittance reconciliation would require an authenticated remittance feed/report with AWB and transaction details; tracking data alone does not establish that money reached HIDI's bank account.
