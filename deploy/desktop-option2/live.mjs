/** The guarded release runs this only after the exact tested image is live. */
process.env.HIDI_DESKTOP_LIVE = '1';
await import('./verify.mjs');
