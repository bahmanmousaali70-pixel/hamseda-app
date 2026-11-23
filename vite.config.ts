import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// CI sets VITE_APP_VERSION (see .github/workflows/build-apk.yml). For local builds fall back
// to the same default UpdateCenter uses, so index.html never keeps a literal placeholder.
process.env.VITE_APP_VERSION ||= '0.0.0';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['hamseda-icon.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'sw-notifications.js'],
        manifest: {
          id: '/',
          name: 'هم‌صدا',
          short_name: 'هم‌صدا',
          description: 'برنامه‌ریزی هدفمند روزانه، شکرگذاری، پیام‌های صبحگاهی با صدای روان فارسی و اعلام دوزبانه تماس‌گیرنده',
          theme_color: '#01124B',
          background_color: '#01124B',
          display: 'standalone',
          dir: 'rtl',
          lang: 'fa',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['/sw-notifications.js'],
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['ort/**'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/__\/auth/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ and serves/copies onnxruntime-web WASM runtime
      // into /ort/ so Pocket TTS Farsi ONNX runs 100% offline inside Capacitor APK.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          const ortSrcDir = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');
          const ortDestDir = path.resolve(distDir, 'ort');
          const ortFiles = [
            'ort-wasm-simd-threaded.asyncify.mjs',
            'ort-wasm-simd-threaded.asyncify.wasm',
          ];
          if (fs.existsSync(distDir) && fs.existsSync(ortSrcDir)) {
            fs.mkdirSync(ortDestDir, {recursive: true});
            for (const file of ortFiles) {
              const srcFile = path.resolve(ortSrcDir, file);
              if (fs.existsSync(srcFile)) {
                fs.copyFileSync(srcFile, path.resolve(ortDestDir, file));
              }
            }
          }
        },
      },
      {
        name: 'serve-ort-wasm-dev',
        configureServer(server) {
          server.middlewares.use('/ort', (req, res, next) => {
            const cleanName = (req.url || '').split('?')[0].replace(/^\/+/, '');
            if (!cleanName || cleanName.includes('..')) {
              return next();
            }
            const filePath = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist', cleanName);
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
              return next();
            }
            if (cleanName.endsWith('.wasm')) {
              res.setHeader('Content-Type', 'application/wasm');
            } else if (cleanName.endsWith('.mjs') || cleanName.endsWith('.js')) {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            }
            fs.createReadStream(filePath).pipe(res);
          });
        },
      },
    ],
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
