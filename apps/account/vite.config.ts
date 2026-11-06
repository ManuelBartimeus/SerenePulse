import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served under /account on the single site origin (landing at /, portal at /admin).
  base: '/account/',
  plugins: [react(), tailwindcss()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
  build: { sourcemap: true, target: 'es2022' },
});
