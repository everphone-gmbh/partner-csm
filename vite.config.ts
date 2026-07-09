/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /partner-csm/; local dev stays at root.
  base: process.env.GITHUB_ACTIONS ? '/partner-csm/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    // Honour the PORT env (used by the preview tooling); default to 5173 locally.
    port: Number(process.env.PORT) || 5173,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
