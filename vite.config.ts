import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'route-optimizer': path.resolve(__dirname, 'route-optimizer.html'),
      },
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'leaflet-vendor': ['leaflet', 'react-leaflet'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'query-vendor': ['@tanstack/react-query'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'charts-vendor': ['recharts'],
          'xlsx-vendor': ['xlsx'],
          'i18n-vendor': ['i18next', 'react-i18next'],
          'pptx-vendor': ['pptxgenjs'],
        },
      },
    },
  },
});
