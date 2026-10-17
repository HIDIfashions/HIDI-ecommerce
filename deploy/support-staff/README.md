# HIDI Support and Team access

Production uses an additive outer-runtime page at `/admin/support` and `/admin/staff` so the retained storefront, Next build and existing extensions stay intact. Native Next source equivalents remain in `apps/web`. Browser writes pass through verified individual staff cookies and the Nest role guard. The support module is registered independently of retained order controllers.

`fashionshidi@gmail.com` is the primary Owner (the highest existing role), and cannot be disabled or demoted. Only Owners can create user IDs, assign roles, approve requests or disable staff. Each user ID is an individual email address; after an Owner creates its staff membership, its first eligible OTP request can provision its email identity. Unknown and disabled emails remain denied before provider delivery. No verification codes or authentication keys are exposed to the browser.

Notes, tags and follow-ups are append-only order audit events. Support can request refunds, cancellations, compensation or order changes. Only an Owner may decide a request; approval does not execute an action or grant Support financial/order write permissions. Existing Operations access remains unchanged.

The guarded workflow compiles and tests source, checks the actual compiled overlay, runs Chromium/Firefox/WebKit at mobile and desktop widths, backs up the current image digests, fingerprints all protected files, and tests the actual wrapper before release. Live checks verify anonymous endpoint protection, public route health, primary Owner protection, and support database workflows in a transaction that is always rolled back. Test users and notes do not remain in production; no refunds or other financial actions run.

Image rollout uses fresh-state guards and owned-image recovery. Only the specifically requested primary Owner account is persisted during deployment; that authorized account assignment is retained even if image rollout is rolled back. Individual mailbox OTP delivery requires the mailbox holder to receive and enter their code.
