/**
 * Service worker — roadmap 3.5 (PWA).
 *
 * Strategy, deliberately boring:
 *
 *   navigations   network-first, falling back to the precached index when
 *                 offline. New deploys are seen as soon as the network works.
 *   shell         precached at install and served cache-first. This is the
 *                 code the game cannot boot without.
 *   everything    stale-while-revalidate into a runtime cache with an entry
 *   else          cap — portraits, backgrounds, icons. Instant on repeat
 *                 views, silently refreshed in the background.
 *
 * There is no build step and no asset hashing, so VERSION below is the only
 * thing that retires stale code: it MUST be bumped on every deploy that
 * changes files under js/ or css/. tests/pwa.test.js pins it to the version
 * in package.json so the bump cannot be forgotten without a red suite.
 *
 * All URLs are relative on purpose: the game deploys under a GitHub Pages
 * subpath (/secondbarnone/), and absolute paths would break there.
 */

const VERSION = '2.7.0';
const SHELL_CACHE = `sbn-shell-${VERSION}`;
const RUNTIME_CACHE = `sbn-assets-${VERSION}`;

/** Files the game cannot boot without. Kept in sync by tests/pwa.test.js,
 *  which walks the static import graph from js/main.js and fails if a module
 *  is missing here. */
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/app.js',
  'js/core/balance.js',
  'js/core/event-manager.js',
  'js/core/game-state.js',
  'js/core/resource-bar.js',
  'js/core/rng.js',
  'js/core/turn.js',
  'js/data/achievements.js',
  'js/data/characters.js',
  'js/data/events.js',
  'js/data/festivals.js',
  'js/data/locations.js',
  'js/data/observances.js',
  'js/data/perks.js',
  'js/data/weather.js',
  'js/ui/screens.js',
  'assets/audio/warm-piano-loop.wav',
];

/**
 * The runtime cache holds at most this many asset responses. 78 portrait
 * thumbnails + 25 backgrounds + 78 lightbox sheets a player actually opened
 * fits comfortably; the cap stops an asset cache from growing without bound
 * for someone who never clears site data.
 */
const RUNTIME_ENTRY_CAP = 250;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('sbn-') && name !== SHELL_CACHE && name !== RUNTIME_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(isShellRequest(url) ? cacheFirst(request) : staleWhileRevalidate(request));
});

function isShellRequest(url) {
  // SHELL entries are relative to the worker's scope (e.g. /secondbarnone/ on
  // GitHub Pages), so compare against the path with that prefix stripped.
  const base = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(base)) return false;
  const rel = url.pathname.slice(base.length);
  return SHELL.some((entry) => {
    const clean = entry.replace(/^\.\//, '');
    return clean === rel;
  });
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('./', response.clone());
    return response;
  } catch {
    const cached = (await cache.match('./')) || (await cache.match('index.html'));
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        await trimRuntimeCache(cache);
      }
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || fresh;
}

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_ENTRY_CAP) return;
  // keys() returns entries in insertion order, so evicting from the front
  // drops the least recently added — good enough for portrait sheets.
  for (const key of keys.slice(0, keys.length - RUNTIME_ENTRY_CAP)) {
    await cache.delete(key);
  }
}
