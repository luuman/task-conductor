// tauri/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Web 开发模式：代理到本地 FastAPI 后端
  server: {
    port: 7071,
    proxy: {
      '/api':    { target: 'http://localhost:8765', changeOrigin: true },
      '/auth':   { target: 'http://localhost:8765', changeOrigin: true },
      '/health': { target: 'http://localhost:8765', changeOrigin: true },
      '/ws': {
        target: 'ws://localhost:8765',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  // Tauri 生产构建配置
  build: {
    target: ['es2021', 'chrome105', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  envPrefix: ['VITE_', 'TAURI_'],
})
