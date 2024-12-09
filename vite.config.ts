import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    open: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.svg'],
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@mui/material']
  }
})
