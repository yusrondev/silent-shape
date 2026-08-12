import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: true,   // expose to local network (open on mobile via IP)
    port: 5173,
    cors: true,
    allowedHosts: true, // Allow ngrok and other tunnels
  },
  build: {
    target: 'es2015',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          three:   ['three'],
          nipple:  ['nipplejs'],
        },
      },
    },
  },
});
