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

  // Server probing: tries every server in SERVERS order and remembers the
  // first one whose embed page looks good, per (anilistId, ep, audio) for
  // the session. An episode counts as available when ANY server has it.
  var serverCache = {};
  function zProbePage(anilistId, ep, audio, server) {
    var proxied = WORKER + '/hls?d=' + b64url(zEmbedUrl(anilistId, ep, audio, server));
    return fetch(proxied, { method: 'GET' }).then(function (r) {
      return r.text();
    }).then(function (t) {
      return t.indexOf('Embed error') === -1 &&
             t.indexOf('Playback unavailable') === -1 &&
             t.length > 1000;
    }).catch(function () { return false; });
  }
  function zFindServer(anilistId, ep, audio) {
    if (!anilistId || !ep) return Promise.resolve('');
    var key = anilistId + ':' + ep + ':' + audio;
    if (key in serverCache) return Promise.resolve(serverCache[key]);
    var i = 0;
    function next() {
      if (i >= SERVERS.length) { serverCache[key] = ''; return Promise.resolve(''); }
      var srv = SERVERS[i++];
      return zProbePage(anilistId, ep, audio, srv).then(function (ok) {
        if (ok) { serverCache[key] = srv; return srv; }
        return next();
      });
    }
    return next();
  }
  // Sub availability — true when any server has the sub embed.
  function zHasEpisode(anilistId, ep) {
    return zFindServer(anilistId, ep, 'sub').then(function (s) { return !!s; });
  }
  // Dub availability — true when any server has the dub embed.
  function zHasDub(anilistId, ep) {
    return zFindServer(anilistId, ep, 'dub').then(function (s) { return !!s; });
  }
  // First working server for playback (falls back to SERVERS[0]).
  function zBestServer(anilistId, ep, audio) {
    return zFindServer(anilistId, ep, audio).then(function (s) { return s || SERVERS[0]; });
  }

  window.ZAnimeProvider = {
    id: 'zanime',
    label: 'Z-Anime',
    servers: SERVERS,
    embedUrl: zEmbedUrl,
    hasEpisode: zHasEpisode,
    hasDub: zHasDub,
    bestServer: zBestServer
  };
  // Alias matching the naming style of the other providers.
  window.zaHasEpisode = zHasEpisode;
  window.zaHasDub = zHasDub;
})();
