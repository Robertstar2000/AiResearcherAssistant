import { defineStackbitConfig } from '@stackbit/types'

export default defineStackbitConfig({
  stackbitVersion: '~0.5.0',
  ssgName: 'custom',
  nodeVersion: '18',
  buildCommand: 'npm run build',
  publishDir: './dist',
  experimental: {
    ssg: {
      name: 'vite'
    }
  }
})
