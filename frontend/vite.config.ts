/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/task-conductor/' : '/',
  server: {
    port: 7070,
    strictPort: true,
    proxy: {
      "/api":        { target: "http://localhost:8765", changeOrigin: true },
      "/auth":       { target: "http://localhost:8765", changeOrigin: true },
      "/health":     { target: "http://localhost:8765", changeOrigin: true },
      "/agent/info": { target: "http://localhost:8765", changeOrigin: true },
      "/hooks":      { target: "http://localhost:8765", changeOrigin: true },
      "/ws":         { target: "ws://localhost:8765",   ws: true, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
