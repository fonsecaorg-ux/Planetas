import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    // Só localhost: o Vite 5 tem vulnerabilidades no servidor de dev. O teste
    // no celular usa encaminhamento de porta USB (chrome://inspect)
    host: 'localhost',
    port: 5173,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
