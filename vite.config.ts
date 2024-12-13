import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  console.log('Vite Environment Variables:')
  console.log('VITE_SUPABASE_URL:', env.VITE_SUPABASE_URL ? 'exists' : 'missing')
  console.log('VITE_SUPABASE_KEY:', env.VITE_SUPABASE_KEY ? 'exists' : 'missing')
  console.log('VITE_GROQ_API_KEY:', env.VITE_GROQ_API_KEY ? 'exists' : 'missing')

  return {
    define: {
      'process.env': {
        VITE_SUPABASE_URL: JSON.stringify(env.VITE_SUPABASE_URL),
        VITE_SUPABASE_KEY: JSON.stringify(env.VITE_SUPABASE_KEY),
        VITE_GROQ_API_KEY: JSON.stringify(env.VITE_GROQ_API_KEY),
        NODE_ENV: JSON.stringify(mode)
      }
    },
    plugins: [react()],
    base: '/',
    build: {
      outDir: 'dist',
      sourcemap: true,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'mui-vendor': ['@mui/material', '@mui/icons-material'],
            'doc-vendor': ['pdfmake', 'docx']
          }
        }
      },
      chunkSizeWarningLimit: 1600,
      assetsInlineLimit: 4096
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: 'https://api.groq.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    preview: {
      port: 3000
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    esbuild: {
      jsxInject: `import React from 'react'`
    }
  }
})
