# MSG91 WhatsApp ordering

Status on 2026-10-26: ordering code is deployed to production, with automated
replies disabled. The callback credential is staged in Azure, and the owner's
distinct customer test number is configured as the only allowed number. No real
WhatsApp delivery test has completed. Keep replies disabled until provider
registration, API authentication and callback header configuration are verified.

[Production deployment run 40262058505](https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/40262058505)
passed. It reused the exact candidate images tested in run 40260169477, including
actual SQL Server concurrency/rollback tests and the retained web runtime's
callback/checkout tests. Unrelated live application files and configuration were
preserved. Live checks confirmed the module is installed, the sender matches,
invalid callback credentials return 401, valid credentials reach the disabled
worker (503), and health/account/cart/checkout routes remain available.

Deployed images:

- API: `acrhidiprod0927.azurecr.io/hidi-api@sha256:580992d770b060692e6e58f64720ccdec715eb0f74e5ef47bf22e7227d5c46ff`
- Web: `acrhidiprod0927.azurecr.io/hidi-web@sha256:3d22821d368b82934a124173549f1fa058e246510bd47915f3da9dee15080d2d`

Current blockers:

- Meta shows phone-number ID `1293090520558969`, WABA `1661718732234798`,
  number `917093709353` as **Pending**. Its tooltip says: "Please register this
  phone number using the registration API or reach out to your partner to
  register the phone number." MSG91 still shows **Inactive**. The owner approved
  a registration request to `support@msg91.com`; it was sent and the support bot
  assigned it to their team. No human resolution or activation is confirmed.
- The owner completed Authkey mobile verification. The existing active HIDIOTP
  key matches the live server's masked hint and its rule allows WhatsApp sending.
  The live read-only number-list request returned **401** at 03:21 UTC, then
  **200** with the HIDI number at 03:24 UTC, without rotating or modifying the key.
  [Latest provider check](https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/40263843990).
  This proves one successful authenticated request, not consistent delivery.
  Key-level IP security is ON and permits six addresses. Azure's declared
  outbound set is larger. MSG91 reports a rejected non-whitelisted call from
  `4.213.194.154`, which is in Azure's outbound list but absent from the key's
  six entries. The owner was asked to add that known missing address while
  retaining current entries and IP security. Stable outbound networking still
  needs review before wider rollout; this correction does not cover every
  possible future Azure address. No security setting was changed by the agent.
- The existing provider webhook still needs its custom credential header. A
  protected local handoff file contains the staged value; no plaintext credential
  is committed or included in workflow artifacts. The owner must enter this
  authentication setting in MSG91. The owner reported saving it, but reopening
  Headers showed empty Key/Value fields. They were asked to click **Add Header**
  and then **Update**, and reopen to verify persistence. Keep Disabled until ready.

Refresh the UTC activation cutoff immediately before the restricted live test.
Do not remove the test-number restriction before end-to-end delivery is verified.

Live MSG91 inspection after owner sign-in: number `917093709353`, WABA
`1407554044821006`, client name `HIdi`, number status **Inactive**, HELLO integration
listed, messaging limit 250 customers/24 hours. Account Settings reports
"No WABA IDs found in whatsapp status." Billing shows an **Active** Titan plan,
zero WhatsApp balance used and ₹500 prepaid balance remaining. The existing plan
shows ₹0/month for two months and ₹500 from 2026-12-01; no billing changes were made.
These initial observations established an inactive number despite an active
subscription. The subsequent Meta registration tooltip above identifies the
remaining registration step.

The number's Sync action did not change its Inactive status. Add Number opened
Meta embedded onboarding for "MSG91 and Haptik". The owner was asked to review
the Meta/WhatsApp terms and complete the connection for the existing account and
number; no Meta terms or permission grants were accepted by the agent. The owner
reported completion, and a refresh showed the same number linked to WABA
`1661718732234798` (replacing the initially observed WABA), still **Inactive**.
Account Settings continued to show no WABA IDs. MSG91 documents delayed Meta
activation as one possible cause; the later Meta inspection above confirms
registration remains pending.
After a further refresh, the same WABA and Inactive status persisted. Selecting
Sync on the newly linked number opened Meta embedded onboarding again; that
repeat prompt was cancelled without accepting terms or changing the connection.

Created and reopened to verify one provider webhook **HIDI ordering inbound**:
POST `https://hidiindia.com/api/store/whatsapp/msg91/webhook`, On Inbound Report
Received, JSON payload as below, status **Disabled**. No test run or outgoing
message was sent. The shared-secret header is not configured in MSG91 yet:
set the Azure-staged value in this webhook before enabling it. The public endpoint
has now passed the deployed routing and credential checks described above.

## Customer flow

Product page selection → WhatsApp message containing SKU and quantity → fresh
stock/price response → customer replies YES → secure HIDI checkout link → existing
checkout handles delivery details, shipping, payment and COD eligibility. A bag is
created at YES; an order is not confirmed just by sending a WhatsApp message.

This connects the existing ordering flow to MSG91. It does not change SMS OTP,
marketing, paid-order confirmations or the Razorpay/payment code. Those use their
own switches and, where applicable, approved templates. Customer-started session
replies do not use the order-confirmation template.

## Implementation

- `POST /v1/whatsapp/msg91/webhook` accepts the custom JSON contract below, using
  the `x-hidi-whatsapp-token` header. The token must contain at least 32 characters
  of securely generated random material; store it as an Azure secret reference.
- Sender, event, direction, customer phone, native message ID and timestamp are
  checked. Only delivered inbound text messages are processed. Non-text messages
  remain for staff in the provider inbox. No media URLs are downloaded.
- A hashed native message ID provides a unique durable queue key. The webhook
  returns after the database insert; it does not wait for MSG91 to send a reply.
- The worker locks each conversation in a transaction and commits the bag,
  conversation state, reply and processed marker together. Failed processing
  rolls back and leaves the incoming message queued. Old/out-of-order messages
  cannot rewind a newer conversation. Messages before activation are ignored.
- A conditional database update claims each outgoing reply once across replicas.
  Session replies expire after 24 hours from the original inbound timestamp.
  The transport uses MSG91's documented session-message POST query parameters;
  request URLs contain message content and must not be logged by instrumentation.
- `MSG91_ACCEPTED` means provider acceptance, not delivery. `MSG91_REJECTED`,
  `MSG91_UNKNOWN` and `MSG91_SENDING` after a crash require inspection in provider
  logs. They are never resent automatically. Do not reset statuses blindly.
- Human support sets `HUMAN_HANDOFF`; the bot stays quiet until MENU or START.
  STOP still withdraws the existing WhatsApp consent. Staff must monitor the
  MSG91/Hello inbox; this change does not provision a staff alert or inbox.

Existing `WhatsAppConversation` and `WhatsAppMessage` tables are reused. No schema
migration is introduced. The optional read-only runtime probe is
`deploy/whatsapp-msg91/readiness.mjs`; execute it only through the existing
authorized private API console with the expected database name.

## Provider setup and activation

1. In MSG91 → WhatsApp → Numbers, confirm the HIDI business number is connected
   and ready. Inspect its Meta status, display name and any remaining onboarding
   steps. Do not migrate a number, remove its current WhatsApp app connection or
   purchase a subscription without reviewing the actual provider requirements.
2. Confirm an existing WhatsApp-enabled auth key can access that number. Store it
   as `MSG91_WHATSAPP_AUTHKEY`, or use the existing `MSG91_AUTHKEY`. Verify any
   provider IP restrictions against the live application's outbound connection.
   Earlier SMS IP-whitelisting work does not establish WhatsApp readiness.
3. Package only the five WhatsApp TypeScript modules over a snapshot of the exact
   live API image. Preserve all other application files, dependencies, settings,
   secrets, identities, health probes and images. Check live schema compatibility
   and actual SQL Server concurrent-claim/rollback behaviour before activation.
   Verify at least one API/worker replica stays running; a timer-based queue
   worker cannot drain while the application is scaled to zero.
   The web deployment also needs the narrow custom-header forwarding change in
   `apps/web/app/api/store/[...path]/route.ts`; check whether the live custom
   server handles this route before selecting the precise runtime patch.
   Local tests use a transactional in-memory fixture; CI additionally verifies
   real SQL Server concurrent processing and transaction rollback. Neither proves
   live MSG91 delivery. Keep the prior image digest for rollback.
4. Verify the public storefront forwards the callback to the private API and
   retains the custom header. Proposed public callback:
   `https://hidiindia.com/api/store/whatsapp/msg91/webhook`.
   This URL passed the live proxy checks on 2026-10-26; do not expose the
   private API publicly as a workaround. Confirm that live checkout supports
   `?waCart=` and that the product WhatsApp button uses the same business number.
5. Set the values from `deploy/whatsapp-msg91/env.example`. Set
   `WHATSAPP_CHATBOT_START_AT` to the actual UTC activation time and preserve it
   through restarts. Set `WHATSAPP_CHATBOT_TEST_NUMBERS` to the owner's test phone
   (international digits, no plus), and select `WHATSAPP_CHATBOT_PROVIDER=msg91`.
   `WEB_ORIGIN` must begin with the public HTTPS storefront origin. Stage secrets
   privately; never put the webhook token in a URL or paste it in chat.
6. In MSG91 → WhatsApp → Webhook (New), create one webhook named
   `HIDI ordering inbound`. Select **On Inbound Report Received** only. Use POST,
   application/json, the verified public callback URL, and custom header
   `x-hidi-whatsapp-token` with the same secret. Configure this JSON using MSG91's
   parameter picker (it must escape the stringified `messages` array correctly):

   ```json
   {
     "direction": "0",
     "eventName": "delivered",
     "integratedNumber": "{{integratedNumber}}",
     "customerNumber": "{{customerNumber}}",
     "contentType": "{{contentType}}",
     "messages": "{{messages}}"
   }
   ```

   Direction and eventName are constants because this webhook subscribes only to
   delivered inbound reports. The live provider editor did not list eventName in
   its default inbound payload. Do not attach outbound events to this configuration. Validate the
   real callback's native message ID, text, from and timestamp against the parser
   before enabling it for customers. Check for provider-side webhook auto-pause.
7. With the test-phone restriction in place, enable the bot and complete a real
   incoming HI → product SKU/quantity → YES → checkout test from that phone.
   Verify actual receipt, bag contents, current price/stock, no order/payment
   created before checkout, CANCEL, repeated callbacks, human handoff and MENU.
   Test the normal customer checkout separately without initiating a charge.
8. Remove the test-phone restriction only after the owner test passes. Keep order
   confirmations disabled until their distinct sender/template/delivery checks
   pass. Disable ordering immediately with `WHATSAPP_CHATBOT_ENABLED=false` if
   necessary; retain queued rows and the activation cutoff for reconciliation.

## Validation completed locally

- API TypeScript check: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
  from `apps/api`.
- Focused integration/unit fixture tests: `node --import tsx --test ../../tests/whatsapp-msg91.test.ts`
  from `apps/api` (9 passing).
- Full API/customer-experience TypeScript test suite: 406 passing.
- Proxy tests validate callback credentials/body forwarding and preserve Razorpay
  signature forwarding; the callback token is not forwarded to other API routes.
- No real customer message, payment or provider API send. Production code was
  subsequently deployed disabled as documented above.

Latest-source CI: [MSG91 ordering regression, run 40257912893](https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/40257912893)
passed API build, **442 tests**, and the disposable SQL Server regression. Real SQL
checks covered duplicate callbacks, concurrent conversation decisions, one send
claim across replicas, cart/item rollback after a database failure, replay recovery,
and zero order/payment creation. Provider sends were stubbed.

## Provider references checked

- [MSG91 WhatsApp API overview](https://docs.msg91.com/whatsapp)
- [Session-message API](https://docs.msg91.com/en/whatsapp/send-message-in-text)
  (request metadata in the published documentation specifies POST and query
  parameters `integrated_number`, `recipient_number`, `content_type`, `text`).
- [MSG91 inbound webhook fields and custom headers](https://msg91.com/help/webhook-new/how-to-receive-whatsapp-delivery-reports-via-webhook-new)
