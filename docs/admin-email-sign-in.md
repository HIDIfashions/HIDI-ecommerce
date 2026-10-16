# Admin email sign-in validation

The public admin code request is `POST /v1/auth/admin/otp/request` with only
`{ "email": "..." }`. The storefront calls the same-origin proxy at
`/api/store/auth/admin/otp/request`.

Before requesting delivery, the API checks the normalised email against the
existing Azure SQL `AdminStaff` records. A staff member must exist, be active
and have an OWNER, OPERATIONS, SUPPORT or CATALOG role. Missing, disabled and
invalid-role staff receive 403 without any provider request. Customer records
do not authorise admin access. Email aliases are not inferred.

Code delivery retains the existing staff email provider, uses
`create_user: false`, and has a 60-second per-process cooldown. The existing
provider also remains responsible for its own delivery rate limits. Requests
do not create or change staff records. The verified session and every admin
request still recheck active membership, the exact verified email, the linked
auth subject and role permissions. The previous automatic first-owner
bootstrap during sign-in has been removed.

## Before a production rollout

1. Confirm the existing `AdminStaff` list has an active OWNER who can sign in.
   Do not assume either email from a support conversation is authorised.
2. If the list is empty, stop. An explicitly approved owner must be provisioned
   through the existing staff-management/maintenance process before rollout.
   Public sign-in must not create that owner automatically.
3. Release the API endpoint before the updated admin sign-in client. Preserve
   the current Azure image backups and all unrelated runtime overlays.
4. Verify missing and disabled staff are rejected before delivery, then verify
   an existing authorised staff account can sign in and retains its role.

No database schema, customer phone authentication, payment, media storage,
staff permission or provider-configuration change is required by this fix.
