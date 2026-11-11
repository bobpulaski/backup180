import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tauri from 'tauri-plugin-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tauri()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
})
