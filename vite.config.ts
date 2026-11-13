import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5175,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['jspdf', 'html-to-image'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: [react(), tailwindcss()],
});

