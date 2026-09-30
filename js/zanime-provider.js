/* Z-Anime provider (z-anime-byzane.vercel.app) via public Z-Player worker.
 *
 * Zane gave permission to use Z-Anime's source. The Z-Player worker
 * (z-anime.seekdeep767.workers.dev) exposes a public embed API — no
 * access code, no encrypted tokens needed on our side:
 *
 *   GET /api/embed/{server}/ani/{anilistId}/{ep}/{audio}
 *     server: hd-1 | hd-2 | hd-3
 *     audio:  sub | dub
 *
 * Returns an HTML player page (iframe-embeddable). Availability is
 * checked by fetching the embed URL through our Cloudflare worker
 * (adds CORS); the worker returns an "Embed error" page when the
 * upstream has no stream.
 *
 * NOTE (2026-09-30): the worker's upstream currently returns 404 for
 * all titles from the sandbox ("Upstream returned 404"). The provider
 * is wired and will light up automatically when Zane's upstream
 * recovers — verify on the phone per OPERATIONS.md.
 */
(function () {
  'use strict';

  var ZPLAYER = 'https://z-anime.seekdeep767.workers.dev';
  var SERVERS = ['hd-1', 'hd-2', 'hd-3'];
  var WORKER = 'https://mpv2-hls-proxy.gmpdi020.workers.dev';

  function b64url(s) {
    return btoa(unescape(encodeURIComponent(s)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function zEmbedUrl(anilistId, ep, audio, server) {
    return ZPLAYER + '/api/embed/' + server +
      '/ani/' + encodeURIComponent(anilistId) +
      '/' + encodeURIComponent(ep) +
      '/' + (audio === 'dub' ? 'dub' : 'sub');
  }

  // Returns Promise<boolean> — true if any server has this episode.
  // Fetches through our worker for CORS; treats the "Embed error"
  // page as unavailable. Cached per (anilistId, ep) for the session.
  var availCache = {};
  var dubCache = {};
  function zProbe(anilistId, ep, audio, cache) {
    if (!anilistId || !ep) return Promise.resolve(false);
    var key = anilistId + ':' + ep;
    if (key in cache) return Promise.resolve(cache[key]);
    var url = zEmbedUrl(anilistId, ep, audio, SERVERS[0]);
    var proxied = WORKER + '/hls?d=' + b64url(url);
    return fetch(proxied, { method: 'GET' }).then(function (r) {
      return r.text();
    }).then(function (t) {
      var ok = t.indexOf('Embed error') === -1 &&
               t.indexOf('Playback unavailable') === -1 &&
               t.length > 1000;
      cache[key] = ok;
      return ok;
    }).catch(function () {
      return false;
    });
  }
  // Sub availability (existing behaviour, unchanged results).
  function zHasEpisode(anilistId, ep) { return zProbe(anilistId, ep, 'sub', availCache); }
  // Dub availability — lets Z-Anime light the English DUB badge.
  function zHasDub(anilistId, ep) { return zProbe(anilistId, ep, 'dub', dubCache); }

  window.ZAnimeProvider = {
    id: 'zanime',
    label: 'Z-Anime',
    servers: SERVERS,
    embedUrl: zEmbedUrl,
    hasEpisode: zHasEpisode,
    hasDub: zHasDub
  };
  // Alias matching the naming style of the other providers.
  window.zaHasEpisode = zHasEpisode;
  window.zaHasDub = zHasDub;
})();
