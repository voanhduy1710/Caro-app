import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5175,
    strictPort: true,
    host: true,
  },
  build: {
    // Keep the heavy, rarely-changing dependencies out of the app chunk so a
    // code change does not force everyone to re-download PeerJS and React.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('peerjs')) return 'peer';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('canvas-confetti')) return 'confetti';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
})
