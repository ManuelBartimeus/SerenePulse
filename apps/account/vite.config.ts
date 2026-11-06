import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served under /account on the single site origin (landing at /, portal at /admin).
  base: '/account/',
  plugins: [react(), tailwindcss()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
  build: {
    sourcemap: true,
    target: 'es2022',
    // Fonts stay files: the CSP allows font-src 'self' only, so a data: URI (the 1.8 KB cedi face
    // is under the 4 KB inline limit) would be blocked.
    assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
  },
});
