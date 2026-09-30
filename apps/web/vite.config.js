import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localPreviewHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};
export default defineConfig({
  plugins: [react()],
  base: './',
  // Prefer 5188; safely fall forward when another app already owns that port.
  // Vite opens and prints the actual selected address, never kills other servers.
  server: {
    host: '127.0.0.1', port: 5188, strictPort: false, open: '/',
    headers: localPreviewHeaders,
  },
  preview: {
    host: '127.0.0.1', port: 4188, strictPort: false, open: '/',
    headers: localPreviewHeaders,
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
