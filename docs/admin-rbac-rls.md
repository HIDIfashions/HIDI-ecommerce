# HIDI Admin RBAC and Database RLS

## Architecture

```text
Staff browser
   |
   | email OTP
   v
Supabase Auth
   |
   | verified access token
   v
Next.js /api/admin/session
   |
   | HttpOnly access + refresh cookies
   v
Next.js admin proxy
   |
   | Authorization: Bearer <staff token>
   v
NestJS AdminGuard
   |
   +--> Supabase identity verification
   |
   +--> AdminStaff lookup
   |
   +--> role / permission check
   v
HIDI services + PostgreSQL
```

The browser never receives the database password, service-role key, or legacy admin API key.

## Roles

| Role | Orders | Returns / refunds | Inventory | Catalog | Review automation | Staff management |
| --- | --- | --- | --- | --- | --- | --- |
| OWNER | Read/write | Write | Read/write | Read/write | Read/write | Yes |
| OPERATIONS | Read/write | Write | Read/write | Read | Read/write | No |
| SUPPORT | Read | No write | Read | Read | Read | No |
| CATALOG | No order access | No | Read | Read/write | No | No |

The API is the authority. Hiding a button in the UI is never treated as authorization.

## First owner bootstrap

1. Set `ADMIN_BOOTSTRAP_EMAIL` to the verified email for the first HIDI owner.
2. Deploy the RBAC migration.
3. Visit `/admin/sign-in`.
4. Request and verify the email OTP.
5. If `AdminStaff` is empty and the verified email matches `ADMIN_BOOTSTRAP_EMAIL`, the API creates the first active OWNER.
6. From **Admin -> Staff**, the OWNER can add Operations, Support, Catalog, or additional Owner accounts.
7. Remove `ADMIN_BOOTSTRAP_EMAIL` from production after the first owner is established if desired.

Bootstrap is ignored once any `AdminStaff` record exists.

## Legacy admin key

The old shared `ADMIN_API_KEY` is no longer the production identity model.

- Development: the key remains available as a break-glass path.
- Production: legacy access is disabled unless `ADMIN_LEGACY_KEY_ENABLED=true` is explicitly set.
- Recommended production value: `ADMIN_LEGACY_KEY_ENABLED=false`.

## Database RLS boundary

HIDI does not use Supabase PostgREST for commerce data. Browser access to Supabase is used for Auth, while business data moves through the NestJS API.

The migration therefore:

- enables RLS for every current table in the public schema;
- revokes table access from PUBLIC, `anon`, and `authenticated`;
- leaves the server-side Postgres owner connection as the commerce data boundary;
- locks default table privileges so future Prisma tables do not accidentally become exposed to PostgREST.

This is intentionally an API-only data architecture. Do not add permissive public RLS policies to Order, Payment, ReturnRequest, Wallet, Inventory, AdminStaff, or audit tables.

## Admin audit identity

Order lifecycle and return/refund audit events now store the stable `AdminStaff.id` as the admin actor instead of the generic `HIDI_ADMIN` label.

That means an order timeline can distinguish actions performed by different staff accounts.

## Session handling

Admin Supabase access and refresh tokens are stored in HttpOnly cookies.

- Access cookie is short-lived.
- Refresh cookie is limited to 7 days.
- Admin navigation refreshes the staff session periodically.
- Sign-out clears legacy, access, and refresh admin cookies.

## Migration

This layer is introduced by:

```text
20260920170000_admin_rbac_rls
```

It depends on the order-audit and FK-index migrations already present on `feature/order-audit-timeline`.

For staging:

```bash
git switch feature/admin-rbac-rls
git pull --ff-only origin feature/admin-rbac-rls
pnpm db:deploy
pnpm dev
```

Before production deployment, ensure `ADMIN_BOOTSTRAP_EMAIL`, Supabase Auth variables, and `ADMIN_LEGACY_KEY_ENABLED=false` are configured.
