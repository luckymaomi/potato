import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3012,
    proxy: {
      '/api': { target: 'http://localhost:5679', changeOrigin: true },
      '/static': { target: 'http://localhost:5679', changeOrigin: true },
    },
  },
})
