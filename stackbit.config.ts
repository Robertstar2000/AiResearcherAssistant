import { defineStackbitConfig } from '@stackbit/types'

export default defineStackbitConfig({
  stackbitVersion: '~0.5.0',
  ssgName: 'vite',
  nodeVersion: '18',
  devCommand: 'npm run dev',
  buildCommand: 'npm run build',
  publishDir: './dist',
  experimental: {
    ssg: {
      name: 'vite',
      devCommand: 'npm run dev',
      devPort: 3000
    }
  }
})
