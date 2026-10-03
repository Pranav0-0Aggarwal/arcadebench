import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/arcadebench/',
  plugins: [react()],
  server: { port: 5173, proxy: { '/arcadebench/api': 'http://127.0.0.1:8787', '/arcadebench/mcp': 'http://127.0.0.1:8787' } },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
