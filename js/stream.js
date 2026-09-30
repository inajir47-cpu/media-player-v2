/* Media Player V2 — streaming services.
 *
 * English: reanime.to + FlixCloud through the v2 backend (/api/stream/en/*).
 * Hindi:   ToonStream scraper (js/kanasu-hindi-provider.js) through the
 *          backend proxy (/api/stream/r) — browsers can't reach those
 *          sites directly.
 *
 * Exposes window.MPV2.Stream.wireDetail(mount, provider, id, d, mediaType).
 * Episode cards get SUB / DUB / HINDI badges plus a globe button wherever
 * a stream exists; the globe opens the Choose Provider dialog, then the
 * language picker, then the hls.js player.
 */
(function () {
  'use strict';

  /* ---------- host shims the Hindi provider needs (it calls these lazily,
     so defining them here — after the provider script — is fine) ---------- */
  window.DM_PROXY_BASE = '';
  window.dmIsApp = function () { return false; };
  window.dmGetText = function (url, timeoutMs) {
    var ms = timeoutMs || 25000;
    return new Promise(function (res, rej) {
      var to = setTimeout(function () { rej(new Error('Request timed out')); }, ms);
      fetch(url).then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(res, function (e) { clearTimeout(to); rej(e); });
    });
  };
  // Route every provider URL through our backend proxy (overrides the
  // provider's own hiProxyX, which only proxies inside the APK).
  // NOTE: must be ABSOLUTE — rewritten HLS playlists become blob: URLs, and
  // relative segment URLs would resolve to unloadable blob:http://... URLs.
  window.hiProxyX = function (u, referer, origin) {
    var p = location.origin + '/api/stream/r?u=' + stB64url(u);
    if (referer) p += '&xreferer=' + encodeURIComponent(referer);
    if (origin) p += '&xorigin=' + encodeURIComponent(origin);
    return p;
  };
  // POST through the backend proxy (overrides the provider's raw XHR, which
  // would hit CORS outside the APK). The URL arrives already proxied.
  window.hiPost = function (url, body, contentType, timeoutMs) {
    var ms = timeoutMs || 20000;
    return new Promise(function (res, rej) {
      var to = setTimeout(function () { rej(new Error('Request timed out')); }, ms);
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType || 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: body
      }).then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(res, function (e) { clearTimeout(to); rej(e); });
    });
  };

  /* ---------- tiny helpers ---------- */
  var API = '/api/stream';
  function esc(s) { return window.MPV2.esc(String(s == null ? '' : s)); }
  function icon(n) { return window.MPV2.icon(n); }
  function stB64url(s) {
    var bytes = new TextEncoder().encode(s), bin = '', i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function srtToVtt(srt) {
    var body = String(srt).replace(/\r/g, '').split('\n\n').map(function (block) {
      return block.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }).join('\n\n');
    return 'WEBVTT\n\n' + body;
  }

  /* ---------- English via Cloudflare Worker (browser -> worker -> upstream) ---------- */
  // reanime.to and flixcloud.cc block datacenter IPs (Render), but the worker's
  // edge near the user reaches them fine. So English API calls happen here in
  // the browser through the worker instead of on the backend. (Hindi is untouched.)
  var WORKER = 'https://mpv2-hls-proxy.gmpdi020.workers.dev';
  var REANIME = 'https://reanime.to';
  var FLIX = 'https://flixcloud.cc';
  function wproxy(url, ref, keyB64url) {
    var u = WORKER + '/hls?d=' + stB64url(url);
    if (ref) u += '&ref=' + stB64url(ref);
    if (keyB64url) u += '&k=' + keyB64url;
    return u;
  }
  function b64ToB64url(b64) {
    var bin = atob(b64), i, s = '';
    var bytes = new Uint8Array(bin.length);
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function wGetJSON(url) {
    // 12s cap: a hung worker must never hold a queue slot forever.
    return new Promise(function (res, rej) {
      var to = setTimeout(function () { rej(new Error('Worker request timed out')); }, 12000);
      fetch(wproxy(url)).then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(res, function (e) { clearTimeout(to); rej(e); });
    });
  }
  var serversCache = {};
  function enServers(anilistId, ep) {
    var k = anilistId + ':' + ep;
    if (!serversCache[k]) {
      serversCache[k] = wGetJSON(REANIME + '/api/flix/' + anilistId + '/' + ep)
        .then(function (d) { return d.servers || []; },
              // Transient failure: don't poison the cache — evict so the next
              // badge check retries instead of hiding DUB for the whole session.
              function () { delete serversCache[k]; return []; });
    }
    return serversCache[k];
  }
  // reanime slug for an episode resolve (matched by anilistId).
  var reanimeIdCache = {};
  function enReanimeId(anilistId, title) {
    var k = 'a' + anilistId;
    if (!reanimeIdCache[k]) {
      reanimeIdCache[k] = wGetJSON(REANIME + '/api/v1/search?q=' + encodeURIComponent(title) + '&limit=12')
        .then(function (d) {
          var rs = d.results || [], i, aid, alid;
          for (i = 0; i < rs.length; i++) {
            aid = rs[i].anime_id; alid = rs[i].anilist_id;
            if (typeof alid === 'number' && alid === anilistId) return aid;
          }
          return rs.length ? rs[0].anime_id : null;
        }, function () { return null; });
    }
    return reanimeIdCache[k];
  }
  function enWatch(animeId, anilistId, ep, type) {
    return enServers(anilistId, ep).then(function (servers) {
      var sorted = (servers || []).slice();
      if (type === 'sub' || type === 'dub') {
        sorted.sort(function (a, b) {
          return ((a.dataType === type) ? 0 : 1) - ((b.dataType === type) ? 0 : 1);
        });
      }
      if (!sorted.length) throw new Error('No servers found for this episode');
      var lastErr = null;
      function attempt(i) {
        if (i >= sorted.length) throw (lastErr || new Error('Stream resolution failed'));
        var srv = sorted[i];
        return fetch(wproxy(srv.dataLink, REANIME + '/'))
          .then(function (r) { if (!r.ok) throw new Error('Embed ' + r.status); return r.text(); })
          .then(function (html) {
            return window.MPV2.FlixExtract.extractFlixcloud(html, {
              apiBase: FLIX,
              headers: {},
              referer: REANIME + '/',
              fetchImpl: function (u, opts) {
                var ref = (opts && opts.headers && opts.headers.Referer) || (FLIX + '/');
                return fetch(wproxy(u, ref));
              }
            });
          })
          .then(function (ex) {
            if (!ex.url) throw new Error('No stream URL extracted');
            var keyB64url = ex.playlist_key ? b64ToB64url(ex.playlist_key) : null;
            // Worker decrypts (?k=), rewrites every URI to itself, serves segments.
            var streamUrl = wproxy(ex.url, FLIX + '/', keyB64url);
            var subs = (ex.subtitles || []).map(function (s) {
              return { url: wproxy(s.url), label: s.language || 'Subtitles', lang: 'en' };
            });
            return {
              serverName: srv.serverName, dataType: srv.dataType,
              stream: streamUrl, audioTracks: [], subtitles: subs
            };
          })
          .catch(function (e) { lastErr = e; return attempt(i + 1); });
      }
      return attempt(0);
    });
  }

  /* ---------- Hindi (ToonStream via the provider) ---------- */
  function normTitle(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function titleScore(q, t) {
    var nq = normTitle(q), nt = normTitle(t), i, hit;
    if (!nq || !nt) return 0;
    if (nt === nq) return 100;
    var qw = nq.split(' '), tw = {};
    nt.split(' ').forEach(function (w) { tw[w] = 1; });
    hit = 0;
    qw.forEach(function (w) { if (w.length > 2 && tw[w]) hit++; });
    if (nt.indexOf(nq) === 0 || nq.indexOf(nt) === 0) return 70;
    if (hit >= 2 && hit >= qw.length - 1) return 50;
    if (nt.indexOf(nq) >= 0 || nq.indexOf(nt) >= 0) return 25;
    return 0;
  }
  var hindiMatchCache = {};
  function hindiMatch(title) {
    var k = normTitle(title);
    if (!hindiMatchCache[k]) {
      var p = (typeof window.hiSearch === 'function')
        ? window.hiSearch(title) : Promise.resolve([]);
      hindiMatchCache[k] = p.then(function (rs) {
        var best = null, bestScore = 0;
        (rs || []).forEach(function (r) {
          var s = titleScore(title, r.title);
          if (r.hindiType === 'series') s += 5;
          if (s > bestScore) { bestScore = s; best = r; }
        });
        var m = bestScore >= 25
          ? { slug: best.hindiSlug, type: best.hindiType, title: best.title }
          : null;
        if (!m) setTimeout(function () { delete hindiMatchCache[k]; }, 30000);
        return m;
      }, function () { setTimeout(function () { delete hindiMatchCache[k]; }, 30000); return null; });
    }
    return hindiMatchCache[k];
  }
  var hindiDetailCache = {};
  function hindiDetail(slug, type) {
    if (!hindiDetailCache[slug]) {
      hindiDetailCache[slug] = (typeof window.hiDetail === 'function')
        ? window.hiDetail(slug, type).then(function (d) { return d; }, function () { return null; })
        : Promise.resolve(null);
    }
    return hindiDetailCache[slug];
  }
  function hindiHasEpisode(title, n) {
    return hindiMatch(title).then(function (m) {
      if (!m) return false;
      return hindiDetail(m.slug, m.type).then(function (d) {
        if (!d || !d.episodes) return false;
        return d.episodes.some(function (e) { return e.number === n; });
      });
    });
  }
  function hindiWatch(title, n) {
    return hindiMatch(title).then(function (m) {
      if (!m) throw new Error('Hindi source not found for this title');
      return hindiDetail(m.slug, m.type).then(function (d) {
        var eps = (d && d.episodes) || [];
        var e = null, i;
        for (i = 0; i < eps.length; i++) if (eps[i].number === n) { e = eps[i]; break; }
        if (!e) throw new Error('This episode has no Hindi stream');
        return window.hiWatch(m.slug, m.type, n, e.slug);
      });
    });
  }

  /* ---------- per-episode availability ---------- */
  var pending = [], running = 0, MAXC = 4;
  // NOTE: the old hindiWithRetry() (9s sleeps x2 per episode) is gone.
  // hindiMatch/hindiDetail already swallow transient failures into a cached
  // null (evicted after 30s), so a falsy result is definitive for this pass —
  // the retries could never succeed and only burned ~18s per episode while
  // holding a queue slot.
  // Staged: paints EN badges as soon as ready, re-paints when Hindi resolves.
  // Fast lane (EN/zanime/Hindi-2) holds the queue slot; the Hindi scraper
  // runs in a detached slow lane that repaints on completion but never
  // blocks other cards. `done` fires once every lane has settled.
  function checkEpisodeStaged(ctx, n, cb, done) {
    var avail = { sub: false, dub: false, hindi: false, hindi2: false, zanime: false, justanime: false, servers: [] };
    var fast = [];
    if (ctx.anilistId) {
      fast.push(enServers(ctx.anilistId, n).then(function (ss) {
        avail.servers = ss;
        avail.sub = ss.some(function (s) { return s.dataType === 'sub'; });
        avail.dub = ss.some(function (s) { return s.dataType === 'dub'; });
        cb(avail);
      }));
    }
    if (ctx.anilistId && typeof window.zaHasEpisode === 'function') {
      fast.push(window.zaHasEpisode(ctx.anilistId, n).then(function (z) {
        avail.zanime = !!z;
        cb(avail);
      }, function () { cb(avail); }));
    }
    if (ctx.anilistId && typeof window.zaHasDub === 'function') {
      fast.push(window.zaHasDub(ctx.anilistId, n).then(function (d) {
        if (d) { avail.dub = true; avail.zanime = true; }
        cb(avail);
      }, function () { cb(avail); }));
    }
    if (ctx.anilistId && typeof window.jaHasEpisode === 'function') {
      fast.push(window.jaHasEpisode(ctx.anilistId, n).then(function (j) {
        if (j) { avail.sub = true; avail.justanime = true; }
        cb(avail);
      }, function () { cb(avail); }));
    }
    if (ctx.anilistId && typeof window.jaHasDub === 'function') {
      fast.push(window.jaHasDub(ctx.anilistId, n).then(function (j) {
        if (j) { avail.dub = true; avail.justanime = true; }
        cb(avail);
      }, function () { cb(avail); }));
    }
    if (ctx.title && typeof window.cdHasEpisode === 'function') {
      fast.push(window.cdHasEpisode(ctx.title, n).then(function (h) {
        avail.hindi2 = !!h;
        cb(avail);
      }, function () { cb(avail); }));
    }
    var slow = Promise.resolve();
    if (ctx.title && typeof window.hiSearch === 'function') {
      slow = hindiHasEpisode(ctx.title, n).then(function (h) {
        avail.hindi = !!h;
        cb(avail);
      }, function () {});
    }
    var fastSettled = Promise.all(fast).then(function () {}, function () {});
    Promise.all([fastSettled, slow]).then(function () { done(avail); });
    return fastSettled; // queue slot releases when the fast lane settles
  }
  function queueCard(card, ctx) {
    var n = parseInt(card.getAttribute('data-ep-n'), 10);
    if (!n || card.dataset.stQ) return;
    card.dataset.stQ = '1';
    pending.push({ card: card, ctx: ctx, n: n });
    pump();
  }
  function pump() {
    while (running < MAXC && pending.length) {
      (function (job) {
        running++;
        checkEpisodeStaged(job.ctx, job.n, function (avail) {
          paintCard(job.card, job.ctx, job.n, avail, false);
        }, function (avail) {
          paintCard(job.card, job.ctx, job.n, avail, true);
        }).catch(function () {}).then(function () { running--; pump(); });
      })(pending.shift());
    }
  }
  function paintCard(card, ctx, n, avail, final) {
    if (openDlg && openDlg.n === n) { try { openDlg.refresh(); } catch (e) {} }
    var old = card.querySelector('.st-badges'); if (old) old.remove();
    var oldG = card.querySelector('.st-globe'); if (oldG) oldG.remove();
    var hasAny = avail.sub || avail.dub || avail.hindi || avail.hindi2 || avail.zanime || avail.justanime;
    // Checks still in flight: paint nothing yet. Final verdict with zero
    // sources: red globe so the dead episode is visible at a glance.
    if (!hasAny && !final) return;
    var actions = card.querySelector('.episode-actions');
    if (!hasAny) {
      var none = document.createElement('span');
      none.className = 'episode-action st-globe unavailable';
      none.title = 'No streams available';
      none.setAttribute('aria-label', 'No streams available for episode ' + n);
      none.innerHTML = icon('globe');
      if (actions) actions.appendChild(none); else card.appendChild(none);
      return;
    }
    var tags = '';
    if (avail.sub) tags += '<i class="st-b st-sub">SUB</i>';
    if (avail.dub) tags += '<i class="st-b st-dub">DUB</i>';
    if (avail.zanime) tags += '<i class="st-b st-sub">Z</i>';
    if (avail.hindi) tags += '<i class="st-b st-hi">HINDI</i>';
    if (avail.hindi2 && !avail.hindi) tags += '<i class="st-b st-hi">HINDI</i>';
    var badges = document.createElement('span');
    badges.className = 'st-badges';
    badges.innerHTML = tags;
    card.appendChild(badges);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'episode-action st-globe';
    btn.setAttribute('aria-label', 'Stream episode ' + n + ' in app');
    btn.innerHTML = icon('globe');
    btn.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      openProviderDialog(ctx, n, avail);
    });
    if (actions) actions.appendChild(btn); else card.appendChild(btn);
  }

  function wireDetail(mount, provider, id, d, mediaType) {
    var isManga = (d.mediaType || mediaType) === 'MANGA';
    var prov = d.provider || provider;
    if (isManga) { wireMangaWatchlist(mount, prov, id, d); return; }
    var anilistId = (prov === 'anilist' && d.id) ? parseInt(d.id, 10) : null;
    if (!Number.isFinite(anilistId)) anilistId = null;
    var ctx = { anilistId: anilistId, title: d.title || '', poster: d.image || '',
                provider: prov, pid: String(id != null ? id : (d.id != null ? d.id : '')),
                isMovie: !isManga && String(d.format || '').toUpperCase() === 'MOVIE',
                episodes: parseInt(d.episodes, 10) || 0 };
    if (!ctx.anilistId && !ctx.title) return;
    Array.prototype.forEach.call(mount.querySelectorAll('[data-ep-grid]'), function (grid) {
      Array.prototype.forEach.call(
        grid.querySelectorAll('.episode-card[data-ep-n]'),
        function (card) { queueCard(card, ctx); });
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (node) {
            if (node.nodeType !== 1) return;
            if (node.matches && node.matches('.episode-card[data-ep-n]')) queueCard(node, ctx);
            else if (node.querySelectorAll) {
              Array.prototype.forEach.call(
                node.querySelectorAll('.episode-card[data-ep-n]'),
                function (c) { queueCard(c, ctx); });
            }
          });
        });
      }).observe(grid, { childList: true, subtree: true });
    });
    wireWatchButtons(mount, d, ctx);
  }

  /* ---------- detail-page Play + Watchlist buttons (watch history) ---------- */
  function wh() { return (window.MPV2 && window.MPV2.Watch) || null; }
  function playTargetEp(d, entry) {
    if (ctxIsMovie(d)) return 1;
    var total = parseInt(d.episodes, 10) || 0;
    if (!entry) return 1;
    if (wh().isDone(entry)) {
      var nx = (entry.episode || 1) + 1;
      return (total && nx > total) ? 1 : nx;
    }
    return entry.episode || 1;
  }
  function ctxIsMovie(d) {
    return String(d.format || '').toUpperCase() === 'MOVIE';
  }
  function playLabel(d, entry) {
    var W = wh();
    if (ctxIsMovie(d)) return (entry && !W.isDone(entry)) ? 'Continue watching' : 'Start watching';
    if (!entry) return 'Start watching E1';
    if (W.isDone(entry)) {
      var total = parseInt(d.episodes, 10) || 0;
      var nx = (entry.episode || 1) + 1;
      return (total && nx > total) ? 'Start watching E1' : 'Start watching E' + nx;
    }
    return 'Continue E' + entry.episode;
  }
  // Click the episode card's globe button (waits briefly while cards load).
  function playEpisodeCard(mount, n) {
    function tryClick() {
      var card = mount.querySelector('.episode-card[data-ep-n="' + n + '"]');
      if (card) {
        try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
        var g = card.querySelector('.st-globe');
        if (g) { g.click(); return true; }
      }
      return false;
    }
    if (tryClick()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (tryClick() || ++tries > 40) clearInterval(t);
    }, 300);
  }
  function wireWatchButtons(mount, d, ctx) {
    var W = wh();
    if (!W) return;
    var copy = mount.querySelector('.detail-copy');
    if (!copy || copy.querySelector('[data-wh-row]')) return;
    var key = W.keyFor(ctx);
    var row = document.createElement('div');
    row.className = 'wh-row';
    row.setAttribute('data-wh-row', '1');
    var playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'wh-play';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'wh-save';
    function refresh() {
      if (!document.contains(row)) {
        document.removeEventListener('mpv2:history', refresh);
        return;
      }
      var entry = W.getEntry(key);
      playBtn.innerHTML = icon('play') + '<span>' + esc(playLabel(d, entry)) + '</span>';
      var saved = W.isSaved(key);
      saveBtn.classList.toggle('saved', saved);
      saveBtn.innerHTML = icon('bookmark') +
        '<span>' + (saved ? 'Saved' : 'Watchlist') + '</span>';
      saveBtn.setAttribute('aria-pressed', String(saved));
      saveBtn.setAttribute('aria-label', saved ? 'Remove from watchlist' : 'Add to watchlist');
    }
    playBtn.addEventListener('click', function () {
      var entry = W.getEntry(key);
      var n = playTargetEp(d, entry);
      if (ctx.isMovie) {
        checkEpisodeStaged(ctx, 1, function (avail) { openProviderDialog(ctx, 1, avail); });
      } else {
        playEpisodeCard(mount, n);
      }
    });
    saveBtn.addEventListener('click', function () {
      var nowSaved = W.toggleWatchlist({
        key: key, kind: ctx.isMovie ? 'movie' : 'anime',
        title: ctx.title, poster: ctx.poster, href: location.hash,
        provider: ctx.provider, pid: ctx.pid
      });
      refresh();
      if (window.MPV2 && typeof window.MPV2.toast === 'function') {
        window.MPV2.toast(nowSaved ? 'Saved to watchlist' : 'Removed from watchlist');
      }
    });
    row.appendChild(playBtn);
    copy.appendChild(row);
    // Watchlist sits up in .detail-actions next to Trailer / Watch Order.
    var actions = copy.querySelector('.detail-actions');
    if (actions) actions.appendChild(saveBtn);
    else row.appendChild(saveBtn);
    document.addEventListener('mpv2:history', refresh);
    refresh();
  }

  /* Manga detail: the same Watchlist save button anime gets — bookmark
   * icon, "Watchlist"/"Saved" label, unified "Watchlist" terminology so
   * manga sits alongside anime in one list. No play button here; the
   * smart Read/Continue button already covers that. */
  function wireMangaWatchlist(mount, provider, id, d) {
    var W = wh();
    if (!W) return;
    var actions = mount.querySelector('.detail-actions');
    if (!actions || actions.querySelector('[data-manga-wl]')) return;
    var anilistId = (provider === 'anilist' && d.id) ? parseInt(d.id, 10) : null;
    if (!Number.isFinite(anilistId)) anilistId = null;
    if (!anilistId && !d.title) return;
    var key = W.keyFor({ anilistId: anilistId, title: d.title || '' });
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'wh-save';
    saveBtn.setAttribute('data-manga-wl', '1');
    function refresh() {
      if (!document.contains(saveBtn)) {
        document.removeEventListener('mpv2:history', refresh);
        return;
      }
      var saved = W.isSaved(key);
      saveBtn.classList.toggle('saved', saved);
      saveBtn.innerHTML = icon('bookmark') +
        '<span>' + (saved ? 'Saved' : 'Watchlist') + '</span>';
      saveBtn.setAttribute('aria-pressed', String(saved));
      saveBtn.setAttribute('aria-label', saved ? 'Remove from watchlist' : 'Add to watchlist');
    }
    saveBtn.addEventListener('click', function () {
      var nowSaved = W.toggleWatchlist({
        key: key, kind: 'manga',
        title: d.title || '', poster: d.image || '', href: location.hash,
        provider: provider, pid: String(id != null ? id : (d.id != null ? d.id : ''))
      });
      refresh();
      if (window.MPV2 && typeof window.MPV2.toast === 'function') {
        window.MPV2.toast(nowSaved ? 'Saved to watchlist' : 'Removed from watchlist');
      }
    });
    actions.appendChild(saveBtn);
    document.addEventListener('mpv2:history', refresh);
    refresh();
  }

  /* ---------- playback progress tracking ---------- */
  var activeTrack = null; // { video, track } — saved on close
  function trackEntry(track, video) {
    var W = wh();
    return {
      key: W.keyFor(track.ctx),
      kind: track.ctx.isMovie ? 'movie' : 'anime',
      title: track.ctx.title || '',
      poster: track.ctx.poster || '',
      href: location.hash,
      provider: track.ctx.provider || '',
      pid: track.ctx.pid || '',
      anilistId: track.ctx.anilistId || null,
      season: track.ctx.season || 1,
      episode: track.n,
      position: Math.floor(video.currentTime || 0),
      duration: Math.floor(video.duration || 0),
      lang: track.lang || ''
    };
  }
  function saveTrack(video, track) {
    var W = wh();
    if (!W || !video || !track) return;
    if (!(video.currentTime > 3)) return; // ignore instant opens
    var entry = trackEntry(track, video);
    if (!(entry.duration > 0)) {
      // metadata not loaded yet — keep the previously known duration, if any
      var prev = W.getEntry(entry.key);
      if (prev && prev.duration > 0) entry.duration = prev.duration;
    }
    W.upsert(entry);
  }
  function wireHistoryTrack(video, shell, track) {
    var W = wh();
    if (!W || !track || !track.ctx) return;
    activeTrack = { video: video, track: track };
    var lastSave = 0;
    video.addEventListener('timeupdate', function () {
      var now = Date.now();
      if (now - lastSave < 8000) return;
      lastSave = now;
      saveTrack(video, track);
    });
    video.addEventListener('pause', function () { saveTrack(video, track); });
    video.addEventListener('ended', function () {
      var W2 = wh();
      if (W2) W2.upsert(trackEntry(track, video));
      activeTrack = null;
    });
    // resume where the user left off in this same episode
    var entry = W.getEntry(W.keyFor(track.ctx));
    if (entry && entry.episode === track.n && !W.isDone(entry) && entry.position > 10) {
      var at = entry.position;
      var seek = function () { try { video.currentTime = at; } catch (e) {} };
      video.addEventListener('loadedmetadata', function onM() {
        video.removeEventListener('loadedmetadata', onM);
        seek();
      });
      // hls.js path: metadata may already be parsed — try shortly after attach
      setTimeout(seek, 1500);
    }
  }

  /* ---------- Choose Provider dialog (matches Imran's reference) ---------- */
  function providersFor(avail) {
    var out = [], seen = {};
    (avail.servers || []).forEach(function (s) {
      var nm = s.serverName || 'HD-1';
      if (!seen[nm]) { seen[nm] = { kind: 'en', name: nm, sub: false, dub: false }; out.push(seen[nm]); }
      if (s.dataType === 'sub') seen[nm].sub = true;
      if (s.dataType === 'dub') seen[nm].dub = true;
    });
    if (avail.hindi) out.push({ kind: 'hi', name: 'Hindi', langs: ['Hindi'] });
    if (avail.hindi2) out.push({ kind: 'hi2', name: 'Hindi-2', langs: ['Hindi'] });
    if (avail.zanime) out.push({ kind: 'za', name: 'Z-Anime', langs: ['Japanese', 'English'] });
    if (avail.justanime) out.push({ kind: 'ja', name: 'JustAnime', langs: ['Japanese', 'English'] });
    return out;
  }
  function providerDesc(p) {
    if (p.kind === 'hi') return 'Hindi dub · ToonStream';
    if (p.kind === 'hi2') return 'Hindi dub · Rare Animes';
    if (p.kind === 'za') return 'English sub & dub · Z-Player';
    if (p.kind === 'ja') return 'English sub & dub · senshi';
    var bits = [];
    if (p.sub) bits.push('sub'); if (p.dub) bits.push('dub');
    return 'English ' + (bits.join(' & ') || 'stream') + ' · FlixCloud';
  }
  function providerLangs(p) {
    if (p.kind === 'hi' || p.kind === 'hi2') return ['Hindi'];
    if (p.kind === 'za') return ['Japanese', 'English'];
    if (p.kind === 'ja') return ['Japanese', 'English'];
    var l = [];
    if (p.sub) l.push('Japanese');
    if (p.dub) l.push('English');
    return l;
  }

  var openDlg = null; // { n, avail, refresh } — refreshed when staged availability resolves
  var lastPlayerProvs = null; // provider list for the in-player server dropdown
  var histPushed = false; // we own the top history entry while the player is open
  // Phone/computer back button: minimize instead of leaving while full-screen.
  window.addEventListener('popstate', function () {
    var shell = document.querySelector('.st-player');
    if (shell && !shell.classList.contains('mini-mode')) {
      try { history.pushState({ playerOpen: true }, ''); } catch (e) {}
      setMiniMode(shell, true);
    }
    // already mini (or no player): browser navigates normally, mini floats on
  });
  // one document-level closer for all custom dropdowns (registered once)
  document.addEventListener('click', function () { closeAllDd(); });

  /* ----- player session persistence (survive page refresh) ----- */
  // The watch-history store already persists per-episode position and the
  // player auto-seeks to it on open — so the session only needs the routing
  // info (series, episode, provider, language) to rebuild the shell.
  var PLAYER_SESSION_KEY = 'mpv2_player_session_v1';
  function savePlayerSession(ctx, n, prov, lang) {
    try {
      sessionStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify({
        ctx: { title: ctx.title, poster: ctx.poster, anilistId: ctx.anilistId,
               episodes: ctx.episodes, provider: ctx.provider, id: ctx.id,
               mediaType: ctx.mediaType, isMovie: !!ctx.isMovie },
        n: n,
        prov: { name: prov.name, kind: prov.kind || 'en' },
        lang: lang
      }));
    } catch (e) {}
  }
  function readPlayerSession() {
    try {
      var raw = sessionStorage.getItem(PLAYER_SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.ctx || !s.ctx.title || !s.n || !s.prov || !s.prov.name) return null;
      return s;
    } catch (e) { return null; }
  }
  function clearPlayerSession() {
    try { sessionStorage.removeItem(PLAYER_SESSION_KEY); } catch (e) {}
  }
  // Flush the freshest playback position on refresh/close so the resume
  // seek (via the watch-history store) is never more than a second stale.
  window.addEventListener('beforeunload', function () {
    if (activeTrack && activeTrack.video) {
      try { saveTrack(activeTrack.video, activeTrack.track); } catch (e) {}
    }
  });
  var lastEmptyToast = 0; // throttle for the no-providers toast in openProviderDialog
  function openProviderDialog(ctx, n, avail) {
    closeDialog();
    var provs = providersFor(avail);
    // No servers staged: say so instead of silently doing nothing (this is
    // the movie Play path — checkEpisodeStaged calls back once per check,
    // so throttle the toast to avoid doubles).
    if (!provs.length) {
      var now = Date.now();
      if (now - lastEmptyToast > 2500) {
        lastEmptyToast = now;
        if (window.MPV2 && typeof window.MPV2.toast === 'function') {
          window.MPV2.toast('No streams found for this title yet');
        }
      }
      return;
    }
    var scrim = document.createElement('div');
    scrim.className = 'st-scrim';
    scrim.innerHTML =
      '<div class="st-dialog" role="dialog" aria-modal="true" aria-label="Choose provider">' +
        '<button class="st-x" type="button" aria-label="Close">' + icon('x') + '</button>' +
        '<h3>Choose Provider</h3>' +
        '<p class="st-sub">Select a server to start streaming</p>' +
        '<div class="st-provs"></div>' +
        '<div class="st-langwrap"><div class="st-langlabel">Language</div><div class="st-langs"></div></div>' +
        '<button class="st-start" type="button">Start Watching</button>' +
      '</div>';
    document.body.appendChild(scrim);
    if (window.MPV2 && window.MPV2.lockBodyScroll) window.MPV2.lockBodyScroll();
    var provBox = scrim.querySelector('.st-provs');
    var langBox = scrim.querySelector('.st-langs');
    var startBtn = scrim.querySelector('.st-start');
    var selProv = provs[0], selLang = null;

    function renderProvs() {
      provs = providersFor(avail);
      if (provs.indexOf(selProv) < 0) selProv = provs[0] || null;
      provBox.innerHTML = '';
      provs.forEach(function (p) { provBox.appendChild(provButton(p)); });
      renderLangs();
    }
    function provButton(p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-prov' + (p === selProv ? ' sel' : '');
      b.innerHTML =
        '<span class="st-prov-ic">' + icon('globe') + '</span>' +
        '<span class="st-prov-tx"><b>' + esc(p.name) + '</b><i>' + esc(providerDesc(p)) + '</i></span>' +
        '<span class="st-prov-go">' + icon('globe') + '</span>';
      b.addEventListener('click', function () {
        selProv = p;
        Array.prototype.forEach.call(provBox.children, function (c) { c.classList.remove('sel'); });
        b.classList.add('sel');
        renderLangs();
      });
      return b;
    }

    function renderLangs() {
      var langs = providerLangs(selProv);
      if (!selLang || langs.indexOf(selLang) < 0) selLang = langs[0] || null;
      langBox.innerHTML = langs.map(function (l) {
        return '<button type="button" class="st-lang' + (l === selLang ? ' sel' : '') +
          '" data-lang="' + esc(l) + '">' + esc(l) + '</button>';
      }).join('');
      startBtn.disabled = !selLang;
    }
    provs.forEach(function (p) { provBox.appendChild(provButton(p)); });
    openDlg = { n: n, avail: avail, refresh: renderProvs };
    langBox.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-lang]') : null;
      if (!t) return;
      selLang = t.getAttribute('data-lang');
      Array.prototype.forEach.call(langBox.children, function (c) {
        c.classList.toggle('sel', c === t);
      });
      startBtn.disabled = !selLang;
    });
    renderLangs();
    startBtn.addEventListener('click', function () {
      if (!selLang) return;
      closeDialog();
      lastPlayerProvs = providersFor(avail);
      startWatch(ctx, n, selProv, selLang);
    });
    scrim.querySelector('.st-x').addEventListener('click', closeDialog);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeDialog(); });
    document.addEventListener('keydown', escClose);
  }
  function escClose(e) {
    if (e.key === 'Escape') {
      if (document.querySelector('.st-yt-dd.open')) { closeAllDd(); return; }
      closeDialog(); closePlayer();
    }
  }
  function closeDialog() {
    openDlg = null;
    var s = document.querySelector('.st-scrim'); if (s) s.remove();
    if (window.MPV2 && window.MPV2.unlockBodyScroll) window.MPV2.unlockBodyScroll();
    document.removeEventListener('keydown', escClose);
  }

  /* ---------- in-app player ---------- */
  var playerHls = null, playerBlobUrls = [];
  function closePlayer() {
    if (activeTrack) {
      try { saveTrack(activeTrack.video, activeTrack.track); } catch (e) {}
      activeTrack = null;
    }
    if (playerHls) { try { playerHls.destroy(); } catch (e) {} playerHls = null; }
    playerBlobUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    playerBlobUrls = [];
    var p = document.querySelector('.st-player');
    if (p) {
      if (p._ytRevStop) { try { p._ytRevStop(); } catch (e) {} }
      if (p._ytCdStop) { try { p._ytCdStop(); } catch (e) {} }
      p.remove();
    }
    document.removeEventListener('keydown', escClose);
    histPushed = false;
    clearPlayerSession();
  }

  function startWatch(ctx, n, prov, lang) {
    var fresh = !document.querySelector('.st-player');
    var shell = openPlayerShell(ctx, n, prov.name, lang);
    savePlayerSession(ctx, n, prov, lang);
    var track = { ctx: ctx, n: n, prov: prov, lang: lang };
    var done = false;
    function resolve() {
      if (prov.kind === 'hi') {
        return hindiWatch(ctx.title, n).then(function (w) {
          return { url: w.stream, audioTracks: [], subtitles: [], providerLabel: 'Hindi · ToonStream' };
        });
      }
      if (prov.kind === 'hi2') {
        // Hindi-2: the phone discovers the embed fileId (search/episodes via
        // the worker), then the backend resolves + proxies the stream from
        // its own egress IP — the CDN's signature requires the embed page
        // and playlist to come from the same IP, which the worker cannot do.
        return window.cdResolveFileId(ctx.title, n).then(function (r) {
          return { url: location.origin + '/api/stream/hi2/pl?fid=' +
              encodeURIComponent(r.fileId),
            audioTracks: [], subtitles: [],
            providerLabel: 'Hindi-2 · Rare Animes' };
        });
      }
      if (prov.kind === 'ja') {
        // JustAnime (Z-Anime Provider 2): senshi API returns a direct HLS
        // URL; the host is CORS-open so the player loads it as-is.
        var audio = (lang === 'English') ? 'dub' : 'sub';
        return window.JustAnimeProvider.watch(ctx.anilistId, n, audio).then(function (w) {
          return { url: w.url, audioTracks: [], subtitles: w.subtitles || [],
            providerLabel: 'JustAnime · senshi' };
        });
      }
      if (prov.kind === 'za') {
        // Z-Anime: the worker serves a full HTML player page, so we hand
        // back an embed URL and let the player shell load it in an iframe.
        var audio = (lang === 'English') ? 'dub' : 'sub';
        // Play from the first server that probed OK (falls back to hd-1).
        return window.ZAnimeProvider.bestServer(ctx.anilistId, n, audio).then(function (srv) {
          var embed = window.ZAnimeProvider.embedUrl(ctx.anilistId, n, audio, srv);
          return { embed: embed, audioTracks: [], subtitles: [],
            providerLabel: 'Z-Anime · Z-Player' };
        });
      }
      return enReanimeId(ctx.anilistId, ctx.title).then(function (animeId) {
        if (!animeId) throw new Error('Could not match this title on the stream server');
        return enWatch(animeId, ctx.anilistId, n, lang === 'English' ? 'dub' : 'sub');
      }).then(function (w) {
        return {
          url: w.stream,
          audioTracks: w.audioTracks || [],
          subtitles: w.subtitles || [],
          providerLabel: prov.name + ' · FlixCloud'
        };
      });
    }
    resolve().then(function (s) {
      if (done) return;
      attachStream(shell, s, lang, track);
    }, function (err) {
      if (done) return;
      playerFail(shell, err && err.message ? err.message : 'Could not load this stream');
    });
    shell.querySelector('.st-p-retry').addEventListener('click', function () {
      shell.querySelector('.st-p-error').classList.add('hidden');
      shell.querySelector('.st-p-loading').classList.remove('hidden');
      resolve().then(function (s) { attachStream(shell, s, lang, track); },
        function (err) { playerFail(shell, err && err.message ? err.message : 'Could not load this stream'); });
    });
    // Episode navigation: jump straight to the adjacent episode with the
    // same provider + language (no dialog in between).
    function goEp(nn) {
      if (ctx.isMovie) return;
      if (nn < 1) return;
      if (ctx.episodes && nn > ctx.episodes) return;
      startWatch(ctx, nn, prov, lang);
    }
    shell._ytGoEp = goEp;
    shell._ytNav = { ctx: ctx, n: n, prov: prov, lang: lang, provs: lastPlayerProvs || [prov] };
    buildYtDropdowns(shell);
    if (fresh && !histPushed) {
      try { history.pushState({ playerOpen: true }, ''); } catch (e) {}
      histPushed = true;
    }
    var prevBtn = shell.querySelector('.st-p-prev');
    var nextBtn = shell.querySelector('.st-p-next');
    if (prevBtn) {
      if (n <= 1) prevBtn.disabled = true;
      prevBtn.addEventListener('click', function () { goEp(n - 1); });
    }
    if (nextBtn) {
      if (ctx.episodes && n >= ctx.episodes) nextBtn.disabled = true;
      nextBtn.addEventListener('click', function () { goEp(n + 1); });
    }
    return function () { done = true; };
  }

  /* ---------- player touch gestures ----------
   * Double-tap left/right: seek -10s/+10s · double-tap center: play/pause.
   * Vertical swipe on left half: brightness · right half: volume.
   * Pinch out/in: toggle fill (cover) / fit (contain).
   * Listeners are passive so native <video> controls keep working. */
  function wireGestures(shell, video) {
    var ind = shell.querySelector('.st-gesture-ind');
    var indT = null;
    function show(html) {
      if (!ind) return;
      ind.innerHTML = html;
      ind.classList.add('on');
      clearTimeout(indT);
      indT = setTimeout(function () { ind.classList.remove('on'); }, 750);
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    var bright = 1;
    var t1 = null;          // single-touch tracking
    var lastTap = 0;        // double-tap detection
    var pinchD0 = 0;        // pinch start distance
    var filled = false;     // object-fit: cover?
    function tdist(a, b) {
      var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    video.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinchD0 = tdist(e.touches[0], e.touches[1]);
        t1 = null;
      } else if (e.touches.length === 1) {
        var t = e.touches[0];
        t1 = { x0: t.clientX, y0: t.clientY, lx: t.clientX, ly: t.clientY,
               t0: Date.now(), vMode: null, startVal: 0 };
      }
    }, { passive: true });
    video.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinchD0 > 0) {
        var d = tdist(e.touches[0], e.touches[1]);
        var ratio = d / pinchD0;
        if (!filled && ratio > 1.35) {
          filled = true; video.style.objectFit = 'cover';
          pinchD0 = d; show('Fill');
        } else if (filled && ratio < 0.7) {
          filled = false; video.style.objectFit = 'contain';
          pinchD0 = d; show('Fit');
        }
        return;
      }
      if (!t1 || e.touches.length !== 1) return;
      var t = e.touches[0];
      t1.lx = t.clientX; t1.ly = t.clientY;
      var dy = t.clientY - t1.y0, dx = t.clientX - t1.x0;
      if (!t1.vMode && Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        t1.vMode = t1.x0 < window.innerWidth / 2 ? 'bright' : 'vol';
        t1.startVal = t1.vMode === 'bright' ? bright : video.volume;
      }
      if (t1.vMode) {
        var delta = (t1.y0 - t.clientY) / 220; // swipe up = increase
        if (t1.vMode === 'bright') {
          bright = clamp(t1.startVal + delta, 0.35, 1.6);
          video.style.filter = bright === 1 ? '' : 'brightness(' + bright.toFixed(2) + ')';
          show('Brightness ' + Math.round(bright * 100) + '%');
        } else {
          var v = clamp(t1.startVal + delta, 0, 1);
          try { video.volume = v; } catch (err) {}
          if (v > 0 && video.muted) { try { video.muted = false; } catch (err2) {} }
          show('Volume ' + Math.round(v * 100) + '%');
        }
      }
    }, { passive: true });
    video.addEventListener('touchend', function (e) {
      if (pinchD0 > 0 && e.touches.length < 2) pinchD0 = 0;
      if (!t1 || e.touches.length !== 0) return;
      var dt = Date.now() - t1.t0;
      var moved = Math.abs(t1.lx - t1.x0) > 12 || Math.abs(t1.ly - t1.y0) > 12;
      var x = t1.x0;
      t1 = null;
      if (moved || dt > 350) return;
      // quick tap: second tap within 350ms = double-tap
      var now = Date.now();
      if (now - lastTap < 350) {
        lastTap = 0;
        var w = window.innerWidth;
        try {
          if (x < w * 0.35) {
            video.currentTime = Math.max(0, video.currentTime - 10);
            show('<b>&minus;10s</b>');
          } else if (x > w * 0.65) {
            var dur = video.duration || Infinity;
            video.currentTime = Math.min(dur, video.currentTime + 10);
            show('<b>+10s</b>');
          } else if (video.paused) { video.play(); } else { video.pause(); }
        } catch (err) {}
      } else {
        lastTap = now;
      }
    }, { passive: true });
  }

  // Mini-player: shrink the shell to a floating draggable box. The <video>
  // element itself is never moved, so playback, HLS, audio tracks and
  // subtitles keep running untouched.
  function setMiniMode(el, on) {
    el.classList.toggle('mini-mode', !!on);
    var video = el.querySelector('.st-p-video');
    video.controls = !on;                    // hide native controls in mini
    video.style.pointerEvents = on ? 'none' : ''; // let drag work over video
    if (!on) {                               // maximize: clear drag offsets
      el.style.left = ''; el.style.top = '';
      el.style.right = ''; el.style.bottom = '';
    } else if (el._miniPos) {                // restore last drag position
      el.style.left = el._miniPos.x + 'px'; el.style.top = el._miniPos.y + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    }
    var pp = el.querySelector('.st-mini-pp');
    if (pp) pp.innerHTML = video.paused ? icon('play') : icon('pause');
  }
  // Touch + mouse drag for the mini-player. Ignored unless minimized, and
  // never starts from a control (button/select/link).
  function makeMiniDraggable(el) {
    var pid = null, dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    el.addEventListener('pointerdown', function (e) {
      if (!el.classList.contains('mini-mode')) return;
      if (e.target.closest && e.target.closest('button,select,a,input')) return;
      dragging = true; pid = e.pointerId;
      var r = el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { el.setPointerCapture(pid); } catch (err) {}
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pid) return;
      var x = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, ox + e.clientX - sx));
      var y = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, oy + e.clientY - sy));
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      el._miniPos = { x: x, y: y };
    });
    function end(e) { if (e.pointerId === pid) { dragging = false; pid = null; } }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function openPlayerShell(ctx, n, provName, lang) {
    closePlayer();
    var el = document.createElement('div');
    el.className = 'st-player st-yt';
    el.innerHTML =
      '<div class="st-yt-main">' +
        '<div class="st-yt-video-wrap">' +
          '<video class="st-p-video" controls playsinline preload="auto"></video>' +
          '<div class="st-gesture-ind" aria-hidden="true"></div>' +
          '<div class="st-p-loading"><span class="st-p-spin"></span><i>Loading stream…</i></div>' +
          '<div class="st-p-error hidden"><b>Stream failed</b><p></p>' +
            '<button class="st-p-retry" type="button">Retry</button></div>' +
        '</div>' +
        '<div class="st-yt-info">' +
          '<h2 class="st-yt-series">' + esc(ctx.title || 'Episode ' + n) + '</h2>' +
          '<p class="st-yt-ep-title">' + (ctx.isMovie ? 'Movie' : 'Episode ' + n) +
            ' · ' + esc(provName) + ' · ' + esc(lang) + '</p>' +
          '<div class="st-yt-actions">' +
            (ctx.isMovie ? '' :
              '<button class="st-p-btn st-yt-btn st-p-prev" type="button" aria-label="Previous episode">' + icon('arrowLeft') + '</button>' +
              '<button class="st-p-btn st-yt-btn st-p-next" type="button" aria-label="Next episode">' + icon('arrowRight') + '</button>') +
            '<button class="st-p-btn st-yt-btn st-p-audio hidden" type="button" aria-label="Audio track">Audio</button>' +
            '<button class="st-p-btn st-yt-btn st-p-subs hidden" type="button" aria-label="Subtitles">Subs</button>' +
            '<button class="st-p-btn st-yt-btn st-p-back" type="button" aria-label="Back">' + icon('minimize') + '</button>' +
          '</div>' +
        '</div>' +
        '<section class="st-yt-reviews" aria-label="Reviews"><div class="st-yt-sec-head"><h3>Reviews</h3></div>' +
          '<div class="st-yt-rev-view"><div class="st-yt-rev-track"></div></div>' +
          '<div class="st-yt-rev-dots"></div></section>' +
      '</div>' +
      (ctx.isMovie ? '' :
      '<aside class="st-yt-side" aria-label="Episodes">' +
        '<div class="st-yt-countdown hidden"></div>' +
        '<div class="st-yt-sec-head"><h3>Episodes</h3><span class="st-yt-epcount"></span></div>' +
        '<div class="st-yt-eplist"></div>' +
      '</aside>') +
      '<div class="st-p-menu hidden"></div>';
    document.body.appendChild(el);
    el.querySelector('.st-p-back').addEventListener('click', function () { setMiniMode(el, true); });
    // floating mini-player bar: play/pause, maximize, close
    var pVideo = el.querySelector('.st-p-video');
    var miniBar = document.createElement('div');
    miniBar.className = 'st-mini-bar';
    miniBar.innerHTML =
      '<button class="st-mini-btn st-mini-pp" type="button" aria-label="Play or pause"></button>' +
      '<span class="st-mini-title">' + esc(ctx.title || '') + '</span>' +
      '<button class="st-mini-btn st-mini-max" type="button" aria-label="Maximize player">' + icon('maximize') + '</button>' +
      '<button class="st-mini-btn st-mini-x" type="button" aria-label="Close player">' + icon('x') + '</button>';
    el.querySelector('.st-yt-video-wrap').appendChild(miniBar);
    var ppBtn = miniBar.querySelector('.st-mini-pp');
    function syncPp() { ppBtn.innerHTML = pVideo.paused ? icon('play') : icon('pause'); }
    ppBtn.addEventListener('click', function () { if (pVideo.paused) pVideo.play(); else pVideo.pause(); });
    pVideo.addEventListener('play', syncPp);
    pVideo.addEventListener('pause', syncPp);
    miniBar.querySelector('.st-mini-max').addEventListener('click', function () { setMiniMode(el, false); });
    miniBar.querySelector('.st-mini-x').addEventListener('click', closePlayer);
    makeMiniDraggable(el);
    syncPp();
    document.addEventListener('keydown', escClose);
    buildYtReviews(el);
    if (!ctx.isMovie) { buildYtEpisodes(el, ctx, n); buildYtCountdown(el); }
    return el;
  }
  /* ----- YouTube-style: auto-scrolling reviews (every 6s) ----- */
  function buildYtReviews(el) {
    var d = (window.MPV2 && window.MPV2.getLastDetail) ? window.MPV2.getLastDetail() : null;
    var revs = (d && d.reviews) || [];
    var sec = el.querySelector('.st-yt-reviews');
    if (!revs.length) {
      sec.innerHTML = '<div class="st-yt-sec-head"><h3>Reviews</h3></div>' +
        '<p class="st-yt-empty">No reviews yet.</p>';
      return;
    }
    var track = sec.querySelector('.st-yt-rev-track');
    var dotsBox = sec.querySelector('.st-yt-rev-dots');
    track.innerHTML = revs.slice(0, 10).map(function (rv) {
      var body = String(rv.body || '');
      return '<article class="st-yt-rev-card">' +
        '<div class="st-yt-rev-who"><b>' + esc(rv.user || 'Anonymous') + '</b>' +
        (rv.score != null ? '<span>★ ' + esc(String(rv.score)) + '</span>' : '') + '</div>' +
        (rv.summary ? '<p class="st-yt-rev-sum">' + esc(rv.summary) + '</p>' : '') +
        '<p class="st-yt-rev-body">' + esc(body.slice(0, 280)) + (body.length > 280 ? '…' : '') + '</p></article>';
    }).join('');
    var cards = track.children.length, idx = 0, timer = null;
    dotsBox.innerHTML = Array.prototype.map.call(track.children, function (_, i) {
      return '<button type="button" data-dot="' + i + '" aria-label="Review ' + (i + 1) + '"></button>';
    }).join('');
    function go(i) {
      idx = (i + cards) % cards;
      track.style.transform = 'translateX(-' + (idx * 100) + '%)';
      Array.prototype.forEach.call(dotsBox.children, function (dt, j) {
        dt.classList.toggle('on', j === idx);
      });
    }
    function play() { stop(); timer = setInterval(function () { go(idx + 1); }, 6000); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    el._ytRevStop = stop;
    dotsBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dot]');
      if (b) { go(parseInt(b.getAttribute('data-dot'), 10)); play(); }
    });
    var view = sec.querySelector('.st-yt-rev-view');
    view.addEventListener('pointerenter', stop);
    view.addEventListener('pointerleave', play);
    go(0); play();
  }

  /* ----- YouTube-style: episode sidebar with watch progress ----- */
  function buildYtEpisodes(el, ctx, curN) {
    var side = el.querySelector('.st-yt-side');
    var total = ctx.episodes || 0;
    if (!side || !total) { if (side) side.style.display = 'none'; return; }
    var W = window.MPV2.Watch;
    var prog = W ? W.getEpProgress(W.keyFor(ctx)) : {};
    var thumbs = (window.MPV2 && window.MPV2.getEpisodeThumbs) ? window.MPV2.getEpisodeThumbs() : {};
    var fallback = ctx.poster || '';
    side.querySelector('.st-yt-epcount').textContent = total + ' eps';
    var html = '';
    for (var n = 1; n <= total; n++) {
      var p = prog[n], pct = 0, done = false;
      if (p && p.d > 0) { pct = Math.min(100, Math.round((p.p / p.d) * 100)); done = !!p.done; }
      var bg = thumbs[n] || fallback;
      html += '<button type="button" class="st-yt-ep' + (n === curN ? ' cur' : '') + (bg ? ' has-bg' : '') +
        '" data-ep="' + n + '"' + (bg ? ' style="--ep-bg:url(\'' + bg.replace(/'/g, '%27') + '\')"' : '') + '>' +
        '<span class="st-yt-ep-n">' + n + '</span>' +
        '<span class="st-yt-ep-tx"><b>Episode ' + n + '</b>' +
        '<span class="st-yt-ep-sub">' + (done ? 'Watched' : pct > 0 ? pct + '% watched' : 'Not started') + '</span></span>' +
        '<span class="st-yt-ep-bar"><span style="width:' + pct + '%"></span></span></button>';
    }
    var list = side.querySelector('.st-yt-eplist');
    list.innerHTML = html;
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ep]');
      if (b) {
        var nn = parseInt(b.getAttribute('data-ep'), 10);
        if (nn !== curN && el._ytGoEp) el._ytGoEp(nn);
      }
    });
    var cur = list.querySelector('.st-yt-ep.cur');
    if (cur) { try { cur.scrollIntoView({ block: 'center' }); } catch (e) {} }
  }

  /* ----- YouTube-style: next-episode release countdown ----- */
  function buildYtCountdown(el) {
    var d = (window.MPV2 && window.MPV2.getLastDetail) ? window.MPV2.getLastDetail() : null;
    var na = d && d.nextAiring;
    var box = el.querySelector('.st-yt-countdown');
    if (!box || !na || !na.airingAt || na.airingAt <= Date.now()) return;
    box.classList.remove('hidden');
    function tick() {
      var ms = na.airingAt - Date.now();
      if (ms <= 0) {
        box.innerHTML = '<b class="st-yt-cd-out">EP ' + esc(String(na.episode || '')) + '</b> is out now';
        stop(); return;
      }
      var s = Math.floor(ms / 1000);
      var dd = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600),
          mm = Math.floor(s % 3600 / 60), ss = s % 60;
      function pad(x) { return (x < 10 ? '0' : '') + x; }
      box.innerHTML = '<span class="st-yt-cd-label">EP ' + esc(String(na.episode || '?')) + ' drops in</span>' +
        '<span class="st-yt-cd-boxes"><b>' + dd + '<i>d</i></b><b>' + pad(hh) + '<i>h</i></b>' +
        '<b>' + pad(mm) + '<i>m</i></b><b>' + pad(ss) + '<i>s</i></b></span>';
    }
    function stop() { if (el._ytCdT) clearInterval(el._ytCdT); el._ytCdT = null; }
    el._ytCdStop = stop;
    el._ytCdT = setInterval(tick, 1000);
    tick();
  }

  /* ----- YouTube-style: custom themed server/audio dropdowns ----- */
  // Native <select> option lists are OS-rendered and unstyleable, so these
  // are button + popup-list dropdowns in the app's dark glass theme.
  function closeAllDd() {
    Array.prototype.forEach.call(document.querySelectorAll('.st-yt-dd.open'), function (w) {
      if (w._ddClose) w._ddClose();
    });
  }
  function ytDropdown(o) {
    // o: { label, value, options: [String], onPick(value) }
    var wrap = document.createElement('div');
    wrap.className = 'st-yt-dd';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'st-yt-dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', o.label);
    var val = document.createElement('span');
    val.className = 'st-yt-dd-val';
    val.textContent = o.value;
    btn.appendChild(val);
    btn.insertAdjacentHTML('beforeend', icon('chevD'));
    var list = document.createElement('div');
    list.className = 'st-yt-dd-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    o.options.forEach(function (opt) {
      var it = document.createElement('button');
      it.type = 'button';
      it.className = 'st-yt-dd-opt' + (opt === o.value ? ' sel' : '');
      it.setAttribute('role', 'option');
      it.setAttribute('aria-selected', opt === o.value ? 'true' : 'false');
      it.textContent = opt;
      it.addEventListener('click', function () { pick(opt); });
      list.appendChild(it);
    });
    function open() {
      closeAllDd();
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
      var sel = list.querySelector('.sel');
      if (sel) sel.focus();
    }
    function close() {
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('open');
    }
    function pick(v) {
      close();
      if (v === o.value) return;
      o.value = v; val.textContent = v;
      Array.prototype.forEach.call(list.children, function (c) {
        var s = c.textContent === v;
        c.classList.toggle('sel', s);
        c.setAttribute('aria-selected', s ? 'true' : 'false');
      });
      o.onPick(v);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); if (list.hidden) open(); else close(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); btn.blur(); }
      else if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && list.hidden) {
        e.preventDefault(); e.stopPropagation(); open();
      }
    });
    list.addEventListener('keydown', function (e) {
      e.stopPropagation();
      var items = Array.prototype.slice.call(list.children);
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { close(); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      else if (e.key === 'Enter' && i >= 0) { items[i].click(); }
    });
    wrap.appendChild(btn); wrap.appendChild(list);
    wrap._ddClose = close;
    return wrap;
  }
  function buildYtDropdowns(el) {
    var nav = el._ytNav;
    if (!nav) return;
    var wrap = el.querySelector('.st-yt-actions');
    if (!wrap) return;
    var provs = nav.provs || [];
    if (provs.length > 1) {
      wrap.appendChild(ytDropdown({
        label: 'Streaming server', value: nav.prov.name,
        options: provs.map(function (p) { return p.name; }),
        onPick: function (v) {
          var np = null;
          provs.forEach(function (p) { if (p.name === v) np = p; });
          if (np && np.name !== nav.prov.name) {
            var langs = providerLangs(np);
            startWatch(nav.ctx, nav.n, np, langs.indexOf(nav.lang) >= 0 ? nav.lang : langs[0]);
          }
        }
      }));
    }
    var langs = providerLangs(nav.prov);
    if (langs.length > 1) {
      wrap.appendChild(ytDropdown({
        label: 'Audio language', value: nav.lang, options: langs,
        onPick: function (v) { if (v !== nav.lang) startWatch(nav.ctx, nav.n, nav.prov, v); }
      }));
    }
  }

  function playerFail(shell, msg) {
    shell.querySelector('.st-p-loading').classList.add('hidden');
    var err = shell.querySelector('.st-p-error');
    err.querySelector('p').textContent = msg;
    err.classList.remove('hidden');
  }

  function attachStream(shell, s, wantLang, track) {
    // Z-Anime (and other embed providers): load the provider's own player
    // page in an iframe instead of our <video> element.
    if (s.embed) {
      shell.querySelector('.st-p-loading').classList.add('hidden');
      var video = shell.querySelector('.st-p-video');
      var frame = document.createElement('iframe');
      frame.className = 'st-p-video st-p-embed';
      frame.src = s.embed;
      frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      frame.setAttribute('allowfullscreen', '');
      frame.style.border = '0';
      video.replaceWith(frame);
      return;
    }
    var video = shell.querySelector('.st-p-video');
    shell.querySelector('.st-p-loading').classList.add('hidden');
    wireHistoryTrack(video, shell, track);
    wireGestures(shell, video);
    // subtitles (proxied urls from the backend; srt -> vtt conversion)
    (s.subtitles || []).forEach(function (sub) {
      fetch(sub.url).then(function (r) {
        if (!r.ok) throw new Error('sub ' + r.status);
        return r.text();
      }).then(function (txt) {
        if (/^\[Script Info\]/m.test(txt)) return; // ASS: not renderable as <track>
        if (/\.srt(\?|$)/i.test(sub.url || '')) txt = srtToVtt(txt);
        else if (txt.indexOf('WEBVTT') !== 0) return;
        var track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = sub.label || sub.lang || 'Subtitles';
        track.srclang = sub.lang || 'en';
        var blob = new Blob([txt], { type: 'text/vtt' });
        var url = URL.createObjectURL(blob);
        playerBlobUrls.push(url);
        track.src = url;
        video.appendChild(track);
        buildSubMenu(shell, video);
      }).catch(function () {});
    });

    function audioTracksFromHls(tracks) {
      return (tracks || []).map(function (t, i) {
        return { idx: i, lang: t.lang || '', label: t.name || t.lang || ('Audio ' + (i + 1)) };
      });
    }
    function pickAudio(list) {
      // wantLang 'English' -> dub track (English audio); else Native.
      var wantDub = wantLang === 'English' || wantLang === 'Hindi';
      var pick = 0, i;
      for (i = 0; i < list.length; i++) {
        var l = (list[i].lang || '').toLowerCase(), nm = (list[i].label || '').toLowerCase();
        if (wantDub && (l.indexOf('eng') === 0 || nm.indexOf('english') >= 0 || nm.indexOf('dub') >= 0)) { pick = i; break; }
        if (!wantDub && (l.indexOf('jpn') === 0 || l.indexOf('ja') === 0 || nm.indexOf('native') >= 0 || nm.indexOf('japan') >= 0)) { pick = i; break; }
      }
      return pick;
    }
    function setAudio(list, i) {
      var btn = shell.querySelector('.st-p-audio');
      btn.textContent = list[i] ? list[i].label : 'Audio';
      if (playerHls) { try { playerHls.audioTrack = list[i].idx; } catch (e) {} }
      else {
        var at = video.audioTracks;
        if (at) { for (var k = 0; k < at.length; k++) at[k].enabled = (k === i); }
      }
    }
    function buildAudioMenu(list) {
      if (!list.length) return;
      var btn = shell.querySelector('.st-p-audio');
      btn.classList.remove('hidden');
      var cur = pickAudio(list);
      setAudio(list, cur);
      btn.onclick = function () {
        var menu = shell.querySelector('.st-p-menu');
        menu.innerHTML = '<b>Audio</b>' + list.map(function (t, i) {
          return '<button type="button" data-a="' + i + '"' + (i === cur ? ' class="sel"' : '') + '>' +
            esc(t.label) + '</button>';
        }).join('');
        menu.classList.toggle('hidden');
        menu.onclick = function (e) {
          var b = e.target.closest ? e.target.closest('[data-a]') : null;
          if (!b) return;
          cur = parseInt(b.getAttribute('data-a'), 10);
          setAudio(list, cur);
          menu.classList.add('hidden');
        };
      };
    }
    function buildSubMenu(shellEl, vid) {
      var tracks = vid.textTracks;
      if (!tracks || !tracks.length) return;
      var btn = shellEl.querySelector('.st-p-subs');
      btn.classList.remove('hidden');
      btn.onclick = function () {
        var menu = shellEl.querySelector('.st-p-menu');
        var html = '<b>Subtitles</b><button type="button" data-s="-1">Off</button>';
        for (var i = 0; i < tracks.length; i++) {
          html += '<button type="button" data-s="' + i + '"' +
            (tracks[i].mode === 'showing' ? ' class="sel"' : '') + '>' + esc(tracks[i].label || ('Sub ' + (i + 1))) + '</button>';
        }
        menu.innerHTML = html;
        menu.classList.toggle('hidden');
        menu.onclick = function (e) {
          var b = e.target.closest ? e.target.closest('[data-s]') : null;
          if (!b) return;
          var si = parseInt(b.getAttribute('data-s'), 10);
          for (var k = 0; k < tracks.length; k++) tracks[k].mode = (k === si) ? 'showing' : 'disabled';
          menu.classList.add('hidden');
        };
      };
    }

    if (window.Hls && window.Hls.isSupported()) {
      var hlsCfg = { maxBufferLength: 30 };
      var hls = new window.Hls(hlsCfg);
      playerHls = hls;
      hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, function (_, data) {
        buildAudioMenu(audioTracksFromHls(data.audioTracks));
      });
      hls.on(window.Hls.Events.ERROR, function (_, data) {
        if (data && data.fatal) {
          var reason = '';
          try {
            if (data.response && data.response.code) reason = ' [HTTP ' + data.response.code + ']';
            else if (data.details) reason = ' [' + data.details + ']';
            if (s && s.referer) {
              var rh = String(s.referer).match(/^https?:\/\/([^\/]+)/i);
              if (rh) reason += ' via ' + rh[1];
            } else if (data.frag && data.frag.url) {
              var hu = String(data.frag.url);
              reason += ' ' + hu.slice(0, hu.indexOf('/', 8) > 0 ? hu.indexOf('/', 8) : 60);
            }
          } catch (e) {}
          playerFail(shell, 'Playback error — try another provider' + reason);
        }
      });
      // Fall back to the API's track list if the manifest exposes none.
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        if (!(hls.audioTracks && hls.audioTracks.length) && (s.audioTracks || []).length) {
          buildAudioMenu((s.audioTracks || []).map(function (t, i) {
            return { idx: i, lang: t.lang || '', label: t.label || ('Audio ' + (i + 1)) };
          }));
        }
        var _pr = video.play(); if (_pr && _pr.catch) _pr.catch(function () {});
      });
      hls.loadSource(s.url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = s.url;
      video.addEventListener('loadedmetadata', function onMeta() {
        video.removeEventListener('loadedmetadata', onMeta);
        var at = video.audioTracks, list = [];
        if (at) for (var i = 0; i < at.length; i++) {
          list.push({ idx: i, lang: at[i].language || '', label: at[i].label || ('Audio ' + (i + 1)) });
        }
        if (!list.length && (s.audioTracks || []).length) {
          list = (s.audioTracks || []).map(function (t, i) {
            return { idx: i, lang: t.lang || '', label: t.label || ('Audio ' + (i + 1)) };
          });
        }
        buildAudioMenu(list);
      });
      var _pr = video.play(); if (_pr && _pr.catch) _pr.catch(function () {});
    } else {
      playerFail(shell, 'Streaming is not supported on this device');
    }
  }

  /* ---------- public ---------- */
  /* Unwrap a value that may be a string or a nested object ({english},
     {romaji}, {large}...) into a plain string. Never returns an object,
     so templates can't render "[object Object]". */
  function reStr(v) {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      var keys = ['english', 'romaji', 'title', 'name',
                  'large', 'medium', 'small', 'url', 'src'];
      for (var i = 0; i < keys.length; i++)
        if (typeof v[keys[i]] === 'string' && v[keys[i]]) return v[keys[i]];
      for (var k in v)
        if (typeof v[k] === 'string' && v[k]) return v[k];
    }
    return '';
  }
  window.MPV2.Stream = {
    wireDetail: wireDetail,
    checkEpisode: function (ctx, n) { return checkEpisodeStaged(ctx, n, function () {}); },
    openProviderDialog: openProviderDialog,
    // Direct playback for one episode (used by Recently Watched continue).
    playEpisode: function (ctxLike, n) {
      checkEpisodeStaged(ctxLike, n, function (avail) { openProviderDialog(ctxLike, n, avail); });
    },
    // God Mode: direct reanime catalog search (English), normalized.
    searchReanime: function (q) {
      return wGetJSON(REANIME + '/api/v1/search?q=' + encodeURIComponent(q) + '&limit=12')
        .then(function (d) {
          return (d.results || []).map(function (r) {
            if (!r) return null;
            var title = reStr(r.title) || reStr(r.name);
            if (!title) return null;
            var dub = r.has_dub || r.hasDub || /dub/i.test(title);
            return {
              title: title, image: reStr(r.poster) || reStr(r.image) || reStr(r.cover),
              type: (r.type === 'movie' || /movie/i.test(r.format || '')) ? 'movie' : 'series',
              server: 'Reanime', langs: ['English'],
              audio: dub ? ['Sub', 'Dub'] : ['Sub'],
              ref: { kind: 'reanime', animeId: r.anime_id, anilistId: r.anilist_id }
            };
          }).filter(Boolean);
        }, function () { return []; });
    }
  };

  // Refresh survival: rebuild the player shell from the saved session.
  // Stream URLs are re-resolved fresh (old ones may have expired); the
  // watch-history store restores the playback position automatically.
  (function () {
    var s = readPlayerSession();
    if (!s) return;
    clearPlayerSession(); // consume: startWatch re-saves on success; avoids boot loops on bad data
    try { startWatch(s.ctx, s.n, s.prov, s.lang); }
    catch (e) { /* stay on the page; session already consumed */ }
  })();
})();
