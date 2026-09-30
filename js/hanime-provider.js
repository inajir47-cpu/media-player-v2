/* Media Player V2 — hanime provider (adult anime video, 18+ only).
   Backend: the hanime-scraper Cloudflare Worker on Imran's own account
   (deployed 2026-10-01 from varomine/hanime.tv-api). hanime.tv's API is
   signature-walled, so the worker does the signed requests server-side
   and exposes two simple endpoints:
     GET /api/search?q=...   -> {results:[{name,slug,poster_url,...}]}
     GET /api/video/:slug    -> {video:{name,...}, streams:[{quality,url}]}
   Stream URLs are proxied m3u8, playable directly (CORS-open).
   ADULT-ONLY: callers must gate behind the 18+ opt-in
   (mpv2_settings_v1.adult), exactly like nhentai/hitomi. */
(function () {
  'use strict';

  var HA = 'https://hanime-scraper.gmpdi020.workers.dev';

  function haGetJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('hanime ' + r.status);
      return r.json();
    });
  }

  /* God Mode search entry: window.haSearch(q), mirroring nhSearch/htSearch. */
  function haSearch(q) {
    q = String(q || '').trim();
    if (q.length < 3) return Promise.resolve([]);
    return haGetJson(HA + '/api/search?q=' + encodeURIComponent(q)).then(function (d) {
      var out = [];
      ((d && d.results) || []).forEach(function (r) {
        if (!r || !r.slug) return;
        out.push({
          title: r.name || r.title || r.slug,
          image: r.poster_url || r.cover_url || '',
          type: 'video',
          server: 'hanime',
          langs: ['Japanese'],
          audio: [],
          isAdult: true,
          ref: { kind: 'hanime', slug: r.slug }
        });
      });
      return out;
    }, function () { return []; });
  }

  /* Resolve playable streams for a slug -> {title, url, quality} (best first). */
  function haVideo(slug) {
    return haGetJson(HA + '/api/video/' + encodeURIComponent(slug)).then(function (d) {
      var best = null, bestQ = -1;
      ((d && d.streams) || []).forEach(function (s) {
        if (!s || !s.url) return;
        var m = /(\d+)\s*p/i.exec(s.quality || '');
        var qv = m ? parseInt(m[1], 10) : 0;
        if (qv >= bestQ) { bestQ = qv; best = s; }
      });
      if (!best) throw new Error('No hanime stream');
      return {
        title: (d.video && d.video.name) || slug,
        url: best.url,
        quality: best.quality || ''
      };
    });
  }

  window.haSearch = haSearch;
  window.HanimeProvider = {
    id: 'hanime',
    label: 'hanime',
    search: haSearch,
    video: haVideo
  };
})();
