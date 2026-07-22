import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-chessboard', 'react-dnd', 'react-dnd-html5-backend'],
    alias: {
      'react-chessboard': 'react-chessboard/dist/index.js'
    }
  },
  optimizeDeps: {
    include: ['react-chessboard', 'react-dnd', 'react-dnd-html5-backend']
  }
})
