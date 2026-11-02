import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use the shared accounting core from source: the browser previews with the exact same maths as the server.
    alias: { '@pa/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) },
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist', sourcemap: false },
});
