import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // sql.js browser 入口是 UMD，Vite ESM 无法处理
      // 强制使用 CJS 版本，Vite 自动转换 CJS → ESM
      'sql.js': path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.js'),
    },
  },

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

  build: {
    target: ['es2021', 'chrome105', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  envPrefix: ['VITE_', 'TAURI_'],
})
