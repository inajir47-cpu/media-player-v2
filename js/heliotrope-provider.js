/* Media Player V2 — Heliotrope provider (Hitomi.la mirror, adult manga).
   Backup to the nhentai provider: God Mode queries both in parallel with
   per-provider isolation, so hitomi results still appear when nhentai is
   down or blocked. Keyless REST on https://inst.psec.dev (all languages):
     POST /api/hitomi/search?offset=1   {query:[q]} -> {results:[...]}
     GET  /api/hitomi/thumbnail/{id}?size=big&single=false -> [{url}]
     GET  /api/hitomi/image/{id}        -> [{url}]  (full page images)
     GET  /api/hitomi/galleryinfo/{id}  -> metadata (title)
     GET  /api/proxy/{urlencoded}       -> image bytes, CORS-safe
   Direct-first, Cloudflare worker (?d=) fallback — worker v2+ forwards
   POST bodies, so the POST search works through it too.
   ADULT-ONLY: callers must gate it behind the 18+ opt-in
   (mpv2_settings_v1.adult), exactly like nhentai. */
(function () {
  'use strict';

  var HT = 'https://inst.psec.dev';
  var WORKER = 'https://mpv2-hls-proxy.gmpdi020.workers.dev';
  var MAX_RESULTS = 8;

  function b64url(s) {
    var bytes = new TextEncoder().encode(s), bin = '', i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* Direct first, worker fallback. opts: {method, body, json} — the worker
     forwards the method and body to the target URL. */
  function htFetch(url, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    var headers = { Accept: 'application/json' };
    if (opts.json) headers['Content-Type'] = 'application/json';
    function direct() {
      return fetch(url, { method: method, headers: headers, body: opts.body }).then(function (r) {
        if (!r.ok) throw new Error('ht ' + r.status);
        return r.json();
      });
    }
    function viaWorker() {
      return fetch(WORKER + '/hls?d=' + b64url(url),
        { method: method, headers: headers, body: opts.body }).then(function (r) {
          if (!r.ok) throw new Error('htw ' + r.status);
          return r.json();
        });
    }
    return direct().catch(viaWorker);
  }

  function langCode(l) {
    l = String(l || '').toLowerCase();
    return l === 'english' ? 'EN' : l === 'japanese' ? 'JA' :
           l === 'chinese' ? 'ZH' : l === 'korean' ? 'KO' : '';
  }

  /* Card thumbnail for one gallery id; routed through the image proxy so
     cards render even where the image host hotlink-blocks. '' if unknown. */
  function thumbFor(id) {
    return htFetch(HT + '/api/hitomi/thumbnail/' + encodeURIComponent(String(id)) +
      '?size=big&single=false').then(function (arr) {
        var first = (arr || [])[0];
        var u = (first && first.url) || '';
        return u ? HT + '/api/proxy/' + encodeURIComponent(u) : '';
      }).catch(function () { return ''; });
  }

  function normResult(r, thumb) {
    if (!r || !r.id) return null;
    var lc = langCode(r.language);
    return {
      title: r.title || 'Untitled',
      image: thumb || '',
      type: 'manga',
      server: 'hitomi',
      langs: lc ? [lc] : [],
      audio: [],
      isAdult: true,
      ref: { kind: 'hitomi', id: r.id }
    };
  }

  /* God Mode entry: window.htSearch(q), mirroring nhSearch/hiSearch. */
  function htSearch(q) {
    var query = String(q || '').trim();
    if (!query) return Promise.resolve([]);
    return htFetch(HT + '/api/hitomi/search?offset=1',
      { method: 'POST', json: true, body: JSON.stringify({ query: [query] }) }
    ).then(function (j) {
      var results = ((j && j.results) || []).slice(0, MAX_RESULTS);
      return Promise.all(results.map(function (r) {
        return thumbFor(r.id).then(function (t) { return normResult(r, t); });
      })).then(function (items) { return items.filter(Boolean); });
    }).catch(function () { return []; });
  }

  /* Full page-image URLs for a gallery id, routed through Heliotrope's
     image proxy so the reader never hits hotlink/CORS walls. */
  function galleryPages(id) {
    var sid = encodeURIComponent(String(id));
    return Promise.all([
      htFetch(HT + '/api/hitomi/image/' + sid),
      htFetch(HT + '/api/hitomi/galleryinfo/' + sid).catch(function () { return null; })
    ]).then(function (parts) {
      var imgs = parts[0] || [], info = parts[1] || {};
      var pages = imgs.map(function (im) { return im && im.url; }).filter(Boolean)
        .map(function (u) { return HT + '/api/proxy/' + encodeURIComponent(u); });
      if (!pages.length) throw new Error('ht no pages');
      return { id: id, title: info.title || 'Hitomi gallery', pages: pages };
    });
  }

  window.htSearch = htSearch;
  window.MPV2 = window.MPV2 || {};
  window.MPV2.Hitomi = { search: htSearch, galleryPages: galleryPages };
})();
