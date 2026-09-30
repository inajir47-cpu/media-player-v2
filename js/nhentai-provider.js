/* Media Player V2 — nhentai provider (adult manga / doujinshi).
   Keyless. Mirrors the existing provider-file pattern (zanime-provider.js):
     nhSearch(q) -> Promise<[God Mode items]>
       {title, image, type:'manga', server:'nhentai', langs:[], audio:[],
        isAdult:true, ref:{kind:'nhentai', id}}
   Gallery pages resolve through the /api/v2/config CDN host pools, with the
   Cloudflare worker (?d=) as fallback when the edge blocks a direct call —
   same direct-first/worker-fallback pattern as manga-reader.js.
   nhentai blocks datacenter IPs: on Render it will usually fail over to the
   worker; the worker edge near the phone reaches it (same as reanime).
   This provider is ADULT-ONLY: callers must gate it behind the 18+ opt-in
   (mpv2_settings_v1.adult), exactly like adult AniList titles. */
(function () {
  'use strict';

  var NH = 'https://nhentai.net';
  var WORKER = 'https://mpv2-hls-proxy.gmpdi020.workers.dev';

  function b64url(s) {
    var bytes = new TextEncoder().encode(s), bin = '', i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* Direct first, worker proxy (?d=) fallback. */
  function nhGetJson(url) {
    function direct() {
      return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
        if (!r.ok) throw new Error('nh ' + r.status);
        return r.json();
      });
    }
    function viaWorker() {
      return fetch(WORKER + '/hls?d=' + b64url(url), { headers: { Accept: 'application/json' } }).then(function (r) {
        if (!r.ok) throw new Error('nhw ' + r.status);
        return r.json();
      });
    }
    return direct().catch(viaWorker);
  }

  /* CDN host pools: { img:[hosts], thumb:[hosts] }. Cached for the session. */
  var configCache = null;
  function nhConfig() {
    if (configCache) return Promise.resolve(configCache);
    return nhGetJson(NH + '/api/v2/config').then(function (c) {
      c = c || {};
      configCache = {
        img: (c.image_servers && c.image_servers.length ? c.image_servers : ['https://i3.nhentai.net']),
        thumb: (c.thumb_servers && c.thumb_servers.length ? c.thumb_servers : ['https://t3.nhentai.net'])
      };
      return configCache;
    }).catch(function () {
      configCache = { img: ['https://i3.nhentai.net'], thumb: ['https://t3.nhentai.net'] };
      return configCache;
    });
  }

  function langBadges(tags) {
    var out = [];
    (tags || []).forEach(function (t) {
      if (!t || t.type !== 'language') return;
      var n = String(t.name || '').toLowerCase();
      var code = n === 'english' ? 'EN' : n === 'japanese' ? 'JA' : n === 'chinese' ? 'ZH' : null;
      if (code && out.indexOf(code) < 0) out.push(code);
    });
    return out.slice(0, 2);
  }

  function galleryTitle(g) {
    var t = g.title || {};
    return t.pretty || t.english || t.japanese || 'Untitled';
  }

  /* Cover path may sit at g.cover.path, g.thumbnail.path, or g.images.*. */
  function coverPath(g) {
    if (g.cover && g.cover.path) return g.cover.path;
    if (g.thumbnail && g.thumbnail.path) return g.thumbnail.path;
    var im = g.images || {};
    if (im.cover && im.cover.path) return im.cover.path;
    if (im.thumbnail && im.thumbnail.path) return im.thumbnail.path;
    return '';
  }

  function normGallery(g, cfg) {
    if (!g || !g.id) return null;
    var cp = coverPath(g);
    return {
      title: galleryTitle(g),
      image: cp ? cfg.thumb[0].replace(/\/$/, '') + '/' + cp : '',
      type: 'manga',
      server: 'nhentai',
      langs: langBadges(g.tags),
      audio: [],
      isAdult: true,
      ref: { kind: 'nhentai', id: g.id }
    };
  }

  /* God Mode entry: window.nhSearch(q), mirroring hiSearch/cdSearch globals. */
  function nhSearch(q) {
    var query = String(q || '').trim();
    if (!query) return Promise.resolve([]);
    return nhConfig().then(function (cfg) {
      return nhGetJson(NH + '/api/v2/search?query=' + encodeURIComponent(query) + '&page=1')
        .then(function (j) {
          return ((j && j.result) || []).map(function (g) { return normGallery(g, cfg); })
            .filter(Boolean).slice(0, 12);
        });
    }).catch(function () { return []; });
  }

  /* Full page-image URLs for a gallery id. */
  function galleryPages(id) {
    return nhConfig().then(function (cfg) {
      return nhGetJson(NH + '/api/v2/galleries/' + encodeURIComponent(String(id))).then(function (g) {
        if (!g || !g.id) throw new Error('nh gallery');
        var base = cfg.img[0].replace(/\/$/, '') + '/';
        var pages = (g.pages || []).map(function (p) { return p && p.path ? base + p.path : ''; })
          .filter(Boolean);
        return { id: g.id, title: galleryTitle(g), pages: pages };
      });
    });
  }

  window.nhSearch = nhSearch;
  window.MPV2 = window.MPV2 || {};
  window.MPV2.NHentai = { search: nhSearch, galleryPages: galleryPages, config: nhConfig };
})();
