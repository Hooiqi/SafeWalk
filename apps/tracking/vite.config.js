import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // The website serves this app from a sub-path (scripts/build-site.mjs sets VITE_BASE).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { host: true },
});
