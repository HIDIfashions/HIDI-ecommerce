# HIDI WhatsApp order confirmations through MSG91

The reviewed change supports captured prepaid/wallet orders and confirmed COD orders. Payment, checkout, wallet and inventory writes are unchanged. Email retains its existing paid-order eligibility. Notification activation stays gated by the existing explicit UTC cutoff, approved MSG91 templates, customer consent and queue readiness.

## Separate approved utility templates

Use each approved template's exact name, language and namespace. The five body variables are customer first name, HIDI order number, products/size/colour/quantity, INR amount, delivery address. Approval is a provider prerequisite; these drafts are not approved templates.

Prepaid draft (`MSG91_ORDER_TEMPLATE_NAME`):

> Hi {{1}}, your HIDI order {{2}} is confirmed. Payment received. Items: {{3}}. Total paid: {{4}}. Delivery address: {{5}}. We will update you when your order is dispatched. Thank you for shopping with HIDI.

COD draft (`MSG91_COD_ORDER_TEMPLATE_NAME`):

> Hi {{1}}, your HIDI order {{2}} is confirmed with cash on delivery. Items: {{3}}. Amount payable on delivery: {{4}}. Delivery address: {{5}}. We will update you when your order is dispatched. Thank you for shopping with HIDI.

Missing COD template configuration waits safely; the prepaid payment-received template is never used for an unpaid COD order. Saved submissions record their payment kind. If payment status changes before a permitted retry, the old payload is skipped rather than sending an incorrect payment statement.

## Consent and activation work still required

Existing eligibility uses the current verified account-level WhatsApp opt-in matching the order phone. Guest checkout has no such recorded consent and remains excluded. A separate order-update consent flow for guest orders must be specified and implemented; guest consent is not inferred from entering a phone number or placing an order.

Run the read-only readiness workflow to verify the actual live API module, SQL queue table, runtime DML permissions and MSG91 configuration. It outputs only booleans and image/settings hashes, never credentials or customer details. If installation or the additive queue migration is still missing, complete the existing guarded installation and authorized private migration procedure before activation. No customer messages should be submitted until the approved provider mapping and an explicitly selected test recipient are verified.

## Provider activation checkpoint — 2026-10-12

The user confirmed the sender is used in the WhatsApp Business mobile app and that the Meta business is verified with admin access. The matching MSG91 route, Connect WhatsApp Business App, was opened. Meta's official Facebook Login for Business screen rejected this onboarding attempt before business selection or number verification:

> MSG91 cannot onboard customers at this time.
> Please contact MSG91's support or try again later.

The underlying rejection reason was not shown. MSG91 support must investigate this embedded-signup/business-app connection; this observation does not establish a general MSG91 outage or a particular account eligibility failure. The linked sender remains inactive, and MSG91 Account Settings showed no WABA IDs. No provider access grants or number migration were completed; no customer order confirmations were sent.

The read-only Azure inspection confirmed the notification module is installed but the outbox table is absent. Sending and the activation cutoff are unset/disabled. The existing MSG91 auth is configured, but the business number, approved prepaid/COD templates and namespace still need configuration. The queue migration, guest order-update consent and end-to-end delivery verification remain required before activation.
