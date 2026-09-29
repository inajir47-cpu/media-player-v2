/* Media Player V2 — opening-theme video previews.
 *
 * - Hover a poster (desktop) or long-press it (touch) on Home / Anime pages:
 *   the opening theme video plays inside the poster.
 * - TOP 010 rows play their opening video in the banner on the right side
 *   of the row, all the time. Manga rows (and any video that fails to load)
 *   show the poster in the banner instead.
 * - Videos download once and are served from the on-device cache afterwards
 *   (service worker + Cache API), so replays use no data and start faster.
 *   Videos are tens of MB — too big for localStorage, which caps at ~5MB.
 * - Cache entries whose anime has been out of the TOP 010 for 2+ days are
 *   deleted automatically.
 */
(function () {
  'use strict';

  var LS_MAP = 'mpv2_opmap_v1';    // "anilist:20" -> remote OP video URL ("" = none)
  var LS_META = 'mpv2_opmeta_v1';   // "anilist:20" -> { title, url, lastSeen }
  var LS_SETTINGS = 'mpv2_settings_v1';
  var CACHE_NAME = 'mpv2-opvideos-v1';
  var GQL = 'https://graphql.animethemes.moe/';
  var DAY = 86400000;
  var SITES = { anilist: 'ANILIST', jikan: 'MAL', kitsu: 'KITSU' };
  var GQL_QUERY = 'query($site: ResourceSite!, $id: [Int!]) {' +
    ' findAnimeByExternalSite(site: $site, id: $id) {' +
    '  animethemes { type sequence animethemeentries { videos { nodes { link size } } } } } }';

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
  }
  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage full/blocked */ }
  }
  function mapKey(provider, id) { return provider + ':' + id; }

  function b64url(str) {
    var b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function virtualUrl(remote) {
    var rel = 'opvideo/?u=' + b64url(remote);
    try { return new URL(rel, location.href).href; } catch (e) { return rel; }
  }
  function swControlling() {
    return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  }
  function motionReduced() {
    try { return !!JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}').reduce; }
    catch (e) { return false; }
  }
  function hoverable() {
    return !!(window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }

  /* ---------------- resolve the OP video remote URL ---------------- */
  var inflight = {};
  function resolveRemote(provider, id) {
    var key = mapKey(provider, id);
    var map = readJson(LS_MAP);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return Promise.resolve(map[key] || null);
    }
    if (inflight[key]) return inflight[key];
    var site = SITES[provider];
    if (!site || !window.fetch) return Promise.resolve(null);
    var p = fetch(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GQL_QUERY, variables: { site: site, id: [Number(id)] } })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (d) {
      var url = pickOp(d);
      var m2 = readJson(LS_MAP);
      m2[key] = url || '';
      writeJson(LS_MAP, m2);
      delete inflight[key];
      return url;
    }).catch(function () { delete inflight[key]; return null; });
    inflight[key] = p;
    return p;
  }

  // First OP (lowest sequence), smallest file — fastest to start.
  function pickOp(d) {
    try {
      var found = (d && d.data && d.data.findAnimeByExternalSite) || [];
      var list = Array.isArray(found) ? found : [found];
      var ops = [];
      list.forEach(function (a) {
        ((a && a.animethemes) || []).forEach(function (t) {
          if (t && t.type === 'OP') ops.push(t);
        });
      });
      ops.sort(function (a, b) { return (a.sequence || 0) - (b.sequence || 0); });
      var vids = [];
      ops.forEach(function (t) {
        ((t.animethemeentries) || []).forEach(function (en) {
          var nodes = ((((en || {}).videos) || {}).nodes) || [];
          nodes.forEach(function (v) { if (v && v.link) vids.push(v); });
        });
      });
      if (!vids.length) return null;
      vids.sort(function (a, b) { return (a.size || Infinity) - (b.size || Infinity); });
      return vids[0].link;
    } catch (e) { return null; }
  }

  /* ---------------- metadata + 2-day purge ---------------- */
  function touchMeta(provider, id, remote, title) {
    var meta = readJson(LS_META);
    meta[mapKey(provider, id)] = { title: title || '', url: remote, lastSeen: Date.now() };
    writeJson(LS_META, meta);
  }

  // TOP 010 membership refreshes "last seen"; then stale entries are purged.
  function noteList(items) {
    var meta = readJson(LS_META);
    var inList = {};
    (items || []).forEach(function (it) {
      if (it && it.provider && it.id && it.mediaType !== 'MANGA') {
        inList[mapKey(it.provider, it.id)] = 1;
      }
    });
    var changed = false, now = Date.now();
    Object.keys(meta).forEach(function (k) {
      if (inList[k] && meta[k].lastSeen < now) { meta[k].lastSeen = now; changed = true; }
    });
    if (changed) writeJson(LS_META, meta);
    purgeStale();
  }

  function purgeStale() {
    var meta = readJson(LS_META);
    var cutoff = Date.now() - 2 * DAY;
    var changed = false;
    Object.keys(meta).forEach(function (k) {
      if (meta[k].lastSeen < cutoff) { delete meta[k]; changed = true; }
    });
    if (changed) writeJson(LS_META, meta);
    if (!('caches' in window)) return Promise.resolve();
    var alive = {};
    Object.keys(meta).forEach(function (k) {
      try { alive[virtualUrl(meta[k].url)] = 1; } catch (e) {}
    });
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var dels = [];
        reqs.forEach(function (r) { if (!alive[r.url]) dels.push(cache.delete(r)); });
        return Promise.all(dels);
      });
    }).catch(function () {});
  }

  /* ---------------- playback ---------------- */
  // Playable URL: on-device cached copy when the service worker is active,
  // otherwise the remote URL (still plays, just not cached yet).
  function playUrl(provider, id, title) {
    return resolveRemote(provider, id).then(function (remote) {
      if (!remote) return null;
      touchMeta(provider, id, remote, title);
      return swControlling() ? virtualUrl(remote) : remote;
    });
  }

  function playMuted(video) {
    video.muted = true;
    try {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function cardTitle(card) {
    var t = card.querySelector('.poster-title');
    return t ? t.textContent.trim() : '';
  }

  function startCardPreview(card) {
    if (!card || card.dataset.opPlaying === '1' || motionReduced()) return;
    var video = card.querySelector('.op-preview');
    if (!video) return;
    if (!video.dataset.opErr) {
      video.dataset.opErr = '1';
      // If the video fails, drop back to the poster underneath.
      video.addEventListener('error', function () { video.classList.remove('op-on'); });
    }
    card.dataset.opPlaying = '1';
    video.classList.add('op-on');
    if (video.dataset.opSrc) { playMuted(video); return; }
    playUrl(card.dataset.opProvider, card.dataset.opId, cardTitle(card)).then(function (url) {
      if (card.dataset.opPlaying !== '1' || !video.isConnected) return;
      if (!url) { card.dataset.opPlaying = ''; video.classList.remove('op-on'); return; }
      video.dataset.opSrc = url;
      video.src = url;
      playMuted(video);
    });
  }

  function stopCardPreview(card) {
    if (!card) return;
    card.dataset.opPlaying = '';
    var video = card.querySelector('.op-preview');
    if (!video) return;
    video.classList.remove('op-on');
    try { video.pause(); } catch (e) {}
    try { video.currentTime = 0; } catch (e) {}
    // src stays set: instant replay from the on-device cache.
  }

  /* ---------------- hover (desktop) ---------------- */
  var hoverTimer = null, hoverCard = null;
  function cancelHover() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    hoverCard = null;
  }
  document.addEventListener('pointerover', function (e) {
    if (!hoverable() || motionReduced()) return;
    var card = e.target && e.target.closest ? e.target.closest('.poster-card[data-op-id]') : null;
    if (!card || hoverCard === card) return;
    cancelHover();
    hoverCard = card;
    hoverTimer = setTimeout(function () { startCardPreview(card); }, 350);
  });
  document.addEventListener('pointerout', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.poster-card[data-op-id]') : null;
    if (card && hoverCard === card) { cancelHover(); stopCardPreview(card); }
  });

  /* ---------------- long-press (touch) ---------------- */
  var lpTimer = null, lpCard = null, activeCard = null, suppressClick = false;
  document.addEventListener('touchstart', function (e) {
    if (activeCard && (!e.target.closest || !activeCard.contains(e.target))) {
      stopCardPreview(activeCard); activeCard = null;
    }
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    var card = e.target && e.target.closest ? e.target.closest('.poster-card[data-op-id]') : null;
    if (!card || card === activeCard || motionReduced()) return;
    lpCard = card;
    lpTimer = setTimeout(function () {
      lpTimer = null;
      suppressClick = true;
      startCardPreview(card);
      activeCard = card;
      setTimeout(function () { suppressClick = false; }, 600);
    }, 500);
  }, { passive: true });
  document.addEventListener('touchmove', function () {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; lpCard = null; }
    if (activeCard) { stopCardPreview(activeCard); activeCard = null; }
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; lpCard = null; }
    // after a long-press the preview keeps playing; the tap that ends the
    // press must not navigate away.
  }, { passive: true });
  document.addEventListener('click', function (e) {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---------------- TOP 010: always playing ---------------- */
  function wireTop10(list, items) {
    noteList(items);
    if (!list || motionReduced()) return;
    var videos = list.querySelectorAll('.top10-video[data-op-id]');
    Array.prototype.forEach.call(videos, function (video) {
      if (video.dataset.opWired === '1') return;
      video.dataset.opWired = '1';
      // The poster underneath stays visible until the video really plays;
      // on any load error the poster remains instead of a black box.
      video.addEventListener('playing', function () {
        if (video.isConnected) video.classList.add('op-on');
      });
      video.addEventListener('error', function () {
        video.classList.remove('op-on');
      });
      playUrl(video.dataset.opProvider, video.dataset.opId, video.dataset.opTitle || '')
        .then(function (url) {
          if (!url || !video.isConnected) return; // no video: poster stays
          try {
            video.src = url;
            video.load(); // buffer in the background now — no wait on scroll
          } catch (e) { return; }
          playMuted(video);
        });
    });
  }

  // Hygiene on every boot: drop videos whose anime left the list 2+ days ago.
  purgeStale();

  window.MPV2 = window.MPV2 || {};
  window.MPV2.OPVideos = {
    playUrl: playUrl,
    resolve: resolveRemote,
    noteList: noteList,
    purgeStale: purgeStale,
    wireTop10: wireTop10,
    virtualUrl: virtualUrl
  };
})();
