import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@flowerforce/flowerbase-client': path.resolve(__dirname, '../../../flowerbase-client/src/index.ts')
    }
  },
  plugins: [react()],
})
