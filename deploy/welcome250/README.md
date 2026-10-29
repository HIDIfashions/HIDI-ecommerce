# WELCOME250 activation

This configuration rollout enables WELCOME250 for everyone eligible to redeem it:
₹250 off a first purchase of at least ₹1,499. GET1 remains disabled. The existing
admin editor, checkout code, payment options, application images and database
schema are not changed. The selected dress collection is retained for later review.

The workflow reads the private state with the existing release identity, records
its ETag, captures current immutable images, and runs the actual retained checkout
service and browser regressions. It requires runtime preservation to report that
both tested images are identical to production. The welcome-only tests also cover
GET1 rejection, exact payment amounts and COD. No real provider payments or
customer orders are created by these tests.

Only after those gates pass, activation verifies a private backup under
`hidi-private-offers/versions/welcome250-before-<run>-<attempt>.json`, then saves the
audited configuration with an ETag condition. It stops for existing active
campaigns, schedules, changed images, newer source commits or concurrent settings
edits. Live verification confirms the welcome policy, GET1 disabled, unchanged
assets/payment options and protected admin routes. Failed verification restores
the prior configuration only if this rollout still owns the complete current state.

The regular admin page remains the control for pausing or editing offers. A future
activation needs a fresh reviewed release; this workflow is not a scheduled task.
