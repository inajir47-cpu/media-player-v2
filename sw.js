/* Media Player V2 — service worker.
 * Serves anime opening-theme videos from the on-device cache.
 * Page requests them via a virtual URL:  opvideo/?u=<base64url remote url>
 * First request downloads (no-cors, stored as an opaque response) and every
 * later play comes straight from the device — no re-download, faster start.
 * If this worker is not active (e.g. file://), the page falls back to the
 * remote URL by itself.
 */
var OP_CACHE = 'mpv2-opvideos-v1';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

function isOpVideoRequest(url) {
  var segs = url.pathname.split('/').filter(Boolean);
  return segs.length && segs[segs.length - 1] === 'opvideo' &&
    !!url.searchParams.get('u');
}

function decodeRemote(b64url) {
  var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (!isOpVideoRequest(url)) return;
  e.respondWith((async function () {
    var cache = await caches.open(OP_CACHE);
    var hit = await cache.match(e.request);
    if (hit) return hit;
    var remote;
    try { remote = decodeRemote(url.searchParams.get('u')); }
    catch (err) { return new Response('bad video url', { status: 400 }); }
    var res;
    try { res = await fetch(remote, { mode: 'no-cors' }); }
    catch (err) { return new Response('video unavailable', { status: 502 }); }
    try { await cache.put(e.request, res.clone()); } catch (err) { /* quota/full: play anyway */ }
    return res;
  })());
});
