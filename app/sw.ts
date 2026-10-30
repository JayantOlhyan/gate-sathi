import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const AUTH_AND_APP_PAGE_REGEX =
  /^\/(gate|dashboard|students|admin|app|login)(\/|$)/;

const runtimeCaching: RuntimeCaching[] = [
  // 1. NetworkOnly for all /api routes
  {
    matcher: ({ url: { pathname } }) => pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
  // 2. NetworkOnly for cross-origin requests (e.g. signed R2 photos)
  {
    matcher: ({ sameOrigin }) => !sameOrigin,
    handler: new NetworkOnly(),
  },
  // 3. NetworkOnly for HTML/RSC of authenticated & app routes: /gate, /dashboard, /students, /admin, /app, /login
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && AUTH_AND_APP_PAGE_REGEX.test(pathname),
    handler: new NetworkOnly(),
  },
  // 4. Cache static Next.js JS/CSS bundles
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && pathname.startsWith('/_next/static/'),
    handler: new CacheFirst({
      cacheName: 'next-static-assets',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 64,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    }),
  },
  // 5. Cache static marketing, brand, icons, story & scrollcraft assets
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin &&
      (pathname.startsWith('/brand/') ||
        pathname.startsWith('/icons/') ||
        pathname.startsWith('/story/') ||
        pathname.startsWith('/scrollcraft/')),
    handler: new StaleWhileRevalidate({
      cacheName: 'static-media-assets',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 64,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    }),
  },
  // 6. Cache only the public landing page (/)
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && pathname === '/',
    handler: new NetworkFirst({
      cacheName: 'landing-page-cache',
      networkTimeoutSeconds: 4,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 4,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
