import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // The portal is served under /admin on the single site origin (landing at /, survey at /customerfeedback).
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: { sourcemap: true, target: 'es2022' },
});
