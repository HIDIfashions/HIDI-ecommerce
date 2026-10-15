// Retained-container checks run only against an explicitly supplied snapshot.
// Fresh-source CI exercises the real current route, parser and authorization instead.
if (process.env.HIDI_CANDIDATE_RUNTIME) {
  await import('./retained/image-sku-runtime-keys.test.mjs');
} else {
  await import('./photo-route-current.cases.mjs');
}
