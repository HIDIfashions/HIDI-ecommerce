# HIDI admin inventory

The inventory workspace is available at `/admin/inventory` and uses the same secure admin session as `/admin/orders`.

## Stock rules

- Inventory is stored for every SKU, so each colour and size has its own quantity.
- **On hand** is the physical warehouse quantity.
- **Reserved** is managed by checkout and cannot be edited manually.
- **Ready to sell = on hand - reserved - safety stock**.
- A variant is low when physical available stock reaches its configured reorder level.
- An adjustment cannot reduce stock below pieces already reserved by customers.

## First-time setup

Use the same `ADMIN_API_KEY` value in `apps/web/.env.local` and `apps/api/.env`, then run:

```bash
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The migration adds `reorderLevel` and an `InventoryMovement` audit table. Manual adjustments record the before/after quantity, reason, optional purchase-order reference, note and operator.

## Warehouse workflow

1. Open `/admin/inventory` and use the existing admin key.
2. Search for a product, SKU or colour.
3. Select **Adjust** on the exact size/colour variant.
4. Choose **Receive**, **Remove** or **Set exact**.
5. Enter the quantity, reason and purchase-order reference.
6. Confirm the projected stock and save.

Checkout reservations and paid-order stock deductions continue through the existing commerce services.
