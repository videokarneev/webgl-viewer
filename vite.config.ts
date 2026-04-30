import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (
            id.includes('@react-three/postprocessing') ||
            id.includes('node_modules/postprocessing/')
          ) {
            return 'postfx'
          }
          if (id.includes('@react-three/drei') || id.includes('three-stdlib')) {
            return 'drei'
          }
          if (
            id.includes('@react-three/fiber')
          ) {
            return 'fiber'
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/zustand/')
          ) {
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})
