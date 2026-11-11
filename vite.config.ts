import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Two pages: the KV manager (index.html) and the product catalog.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        catalog: path.resolve(__dirname, 'catalog.html'),
      },
    },
  },
})

