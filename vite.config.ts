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
    // Tests laufen immer gegen den Mock — unabhängig von .env.local.
    env: { VITE_DATA_BACKEND: 'mock' },
    // Hintergrund-Tasks legen Arbeitsbäume unter .claude/worktrees/ ab. Ohne
    // diesen Ausschluss sammelt Vitest deren Testdateien mit ein und scheitert
    // an einer zweiten React-Instanz — ein roter Lauf, der über dieses Projekt
    // nichts aussagt. `exclude` ersetzt die Vorgaben, node_modules muss also
    // mit aufgeführt werden.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
