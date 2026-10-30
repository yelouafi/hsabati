import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base: works on GitHub Pages (/hsabati/) and locally.
  base: './',
  plugins: [
    preact(),
    VitePWA({
      // Registered by hand in src/lib/sw.ts (reload only when not mid-entry).
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Hsabati — mes dépenses',
        short_name: 'Hsabati',
        description: 'Mes dépenses par projet, en deux secondes.',
        lang: 'fr',
        start_url: './#/',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fbf6f3',
        theme_color: '#fbf6f3',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Nouvelle dépense', url: './#/', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Mes caisses', url: './#/caisses', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
