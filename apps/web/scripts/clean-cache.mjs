import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Project-only cleanup. Never opens or removes a browser profile or user data.
for (const name of ['../node_modules/.vite', '../.vite', '../.cache']) {
  await rm(fileURLToPath(new URL(name, import.meta.url)), { recursive: true, force: true });
}
console.log('HIDI local build caches cleared. Photos, videos, source and browser data were not touched.');
