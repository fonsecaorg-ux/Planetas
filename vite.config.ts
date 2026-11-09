import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // usa public/manifest.json já existente
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,glb}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:glb|jpg|png)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'solar-assets',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
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
