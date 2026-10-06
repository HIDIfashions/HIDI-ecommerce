# Payment provider gate

The Premium V2 internal build does not bundle a native payment provider SDK. The checkout UI stops before any payment/order mutation and explains that Apple Pay, Google Pay and PaymentSheet require an approved provider contract, a server-created payment intent, final amount validation and webhook reconciliation.

Activation requires a separate reviewed change after provider credentials, merchant configuration, canonical payment APIs and callback-loss recovery are available. Client-side keys alone must never activate payment.
