import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')
) as { version?: string };

const APP_VERSION = packageJson.version ?? '1.0.0';
const BUILD_TIME = new Date().toISOString();

function collectFilesRecursively(dir: string, rootDir = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(fullPath, rootDir));
    } else if (entry.isFile()) {
      const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (
        rel !== 'sw.js' &&
        rel !== 'version.json' &&
        !rel.endsWith('.map') &&
        !rel.endsWith('.woff') &&
        !rel.startsWith('models/')
      ) {
        files.push(rel);
      }
    }
  }
  return files.sort();
}

/**
 * Zero-dependency Vite build plugin that emits a versioned offline Service Worker
 * (`dist/sw.js`) precaching every emitted bundle asset plus `dist/version.json`.
 */
function pwaOfflinePlugin(): Plugin {
  let outDir = path.resolve(import.meta.dirname, 'dist');

  return {
    name: 'mast2-pwa-offline',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const relativeFiles = collectFilesRecursively(outDir);
      const hash = crypto.createHash('sha256');
      for (const rel of relativeFiles) {
        hash.update(rel);
        hash.update(fs.readFileSync(path.join(outDir, rel)));
      }
      const buildId = hash.digest('hex').slice(0, 12);
      const precacheUrls = relativeFiles.map((rel) =>
        rel === 'index.html' ? '/' : encodeURI(`/${rel}`)
      );

      const swSource = `/* Auto-generated offline service worker for Mast 2 Tower */
const CACHE_PREFIX = 'mast2-pwa-';
const CACHE_NAME = '${'mast2-pwa-'}' + '${buildId}';
const IMAGE_CACHE_NAME = 'mast2-images-v1';
const MODEL_CACHE_NAME = 'mast2-models-v1';
const MAX_IMAGE_CACHE_ENTRIES = 120;
const APP_VERSION = '${APP_VERSION}';
const BUILD_ID = '${buildId}';
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok) {
            throw new Error('Failed to precache ' + url + ' (' + response.status + ')');
          }
          const cleanResponse = response.redirected
            ? new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              })
            : response;
          await cache.put(url, cleanResponse);
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: APP_VERSION, buildId: BUILD_ID });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept update-check or live auth/admin/client API endpoints with cached assets.
  if (url.pathname === '/sw.js' || url.pathname === '/version.json') {
    return;
  }

  if (url.pathname.startsWith('/api/images/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
            const keys = await cache.keys();
            if (keys.length > MAX_IMAGE_CACHE_ENTRIES) {
              await Promise.all(
                keys
                  .slice(0, keys.length - MAX_IMAGE_CACHE_ENTRIES)
                  .map((key) => cache.delete(key))
              );
            }
          }
          return networkResponse;
        } catch {
          return new Response('Offline', { status: 504, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (url.pathname.startsWith('/models/')) {
    event.respondWith(
      caches.open(MODEL_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok && networkResponse.type === 'basic') {
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return new Response('Offline', { status: 504, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok && !networkResponse.redirected) {
            await cache.put('/', networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedIndex = await cache.match('/');
          if (cachedIndex) return cachedIndex;
          return new Response('Offline — open the app once while online to finish caching.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok && networkResponse.type === 'basic') {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })
  );
});
`;

      fs.writeFileSync(path.join(outDir, 'sw.js'), swSource, 'utf8');
      fs.writeFileSync(
        path.join(outDir, 'version.json'),
        JSON.stringify(
          {
            version: APP_VERSION,
            buildId,
            builtAt: BUILD_TIME,
          },
          null,
          2
        ),
        'utf8'
      );
    },
  };
}

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: [react(), tailwindcss(), pwaOfflinePlugin()],
});
