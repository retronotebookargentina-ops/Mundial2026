/* =====================================================
   SERVICE WORKER — Mundial FIFA 2026 PWA
   Estrategia:
   - Shell (HTML/fonts): Cache-first  → responde rápido, actualiza en bg
   - API openfootball (datos live): Network-first con fallback a caché
   - Histórico GitHub: Stale-while-revalidate
   ===================================================== */

const CACHE_VERSION = 'mundial2026-v1';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

// Recursos del shell (se cachean en la instalación)
const SHELL_ASSETS = [
  './mundial2026.html',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&display=swap'
];

// Dominios que usan estrategia "network-first" (datos en tiempo real)
const NETWORK_FIRST_HOSTS = [
  'raw.githubusercontent.com'
];

// ===================== INSTALL =====================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ===================== ACTIVATE =====================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('mundial2026-') && k !== SHELL_CACHE && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===================== FETCH =====================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests no-GET y extensiones de browser
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  const isNetworkFirst = NETWORK_FIRST_HOSTS.some(h => url.hostname.includes(h));

  if (isNetworkFirst) {
    // Network-first: intenta red, si falla devuelve caché
    event.respondWith(networkFirst(request));
  } else {
    // Cache-first para shell y fuentes
    event.respondWith(cacheFirst(request));
  }
});

// ===================== ESTRATEGIAS =====================

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Si es la página principal y no hay red, devuelve lo que haya en caché
    const fallback = await caches.match('./mundial2026.html');
    if (fallback) return fallback;
    return new Response('<h2>Sin conexión</h2><p>Abrí la app al menos una vez con internet para activar el modo offline.</p>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function networkFirst(request) {
  // Para las URLs de datos le quitamos el cache-buster (?_=timestamp)
  // y usamos la URL limpia como clave de caché
  const cacheKey = cleanCacheKey(request);

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(cacheKey);
    if (cached) {
      console.log('[SW] Sin red — usando caché para:', request.url);
      return cached;
    }
    // No hay nada en caché: devuelve JSON vacío para que la app maneje el error
    return new Response(JSON.stringify({ matches: [], error: 'offline' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function cleanCacheKey(request) {
  const url = new URL(request.url);
  url.searchParams.delete('_'); // elimina cache-buster
  return new Request(url.toString());
}

// ===================== MENSAJES =====================
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage(CACHE_VERSION);
  }
});
