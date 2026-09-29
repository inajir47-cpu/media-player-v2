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
  window.hiProxyX = function (u, referer, origin) {
    var p = '/api/stream/r?u=' + stB64url(u);
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

  /* ---------- English backend API ---------- */
  var serversCache = {};
  function enServers(anilistId, ep) {
    var k = anilistId + ':' + ep;
    if (!serversCache[k]) {
      serversCache[k] = getJSON(API + '/en/servers?anilistId=' + anilistId + '&ep=' + ep)
        .then(function (d) { return d.servers || []; }, function () { return []; });
    }
    return serversCache[k];
  }
  // reanime slug for an episode resolve (matched by anilistId).
  var reanimeIdCache = {};
  function enReanimeId(anilistId, title) {
    var k = 'a' + anilistId;
    if (!reanimeIdCache[k]) {
      reanimeIdCache[k] = getJSON(API + '/en/search?q=' + encodeURIComponent(title))
        .then(function (d) {
          var rs = d.results || [], i;
          for (i = 0; i < rs.length; i++) if (rs[i].anilistId === anilistId) return rs[i].animeId;
          return rs.length ? rs[0].animeId : null;
        }, function () { return null; });
    }
    return reanimeIdCache[k];
  }
  function enWatch(animeId, anilistId, ep, type) {
    return getJSON(API + '/en/watch?animeId=' + encodeURIComponent(animeId) +
      '&anilistId=' + anilistId + '&ep=' + ep + (type ? '&type=' + type : ''));
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
  function stSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hindiWithRetry(title, n, attempt) {
    return hindiHasEpisode(title, n).then(function (h) {
      if (h || attempt >= 2) return h;
      return stSleep(9000).then(function () { return hindiWithRetry(title, n, attempt + 1); });
    }, function () {
      if (attempt >= 2) return null;
      return stSleep(9000).then(function () { return hindiWithRetry(title, n, attempt + 1); });
    });
  }
  // Staged: paints EN badges as soon as ready, re-paints when Hindi resolves.
  function checkEpisodeStaged(ctx, n, cb) {
    var avail = { sub: false, dub: false, hindi: false, servers: [] };
    var jobs = [];
    if (ctx.anilistId) {
      jobs.push(enServers(ctx.anilistId, n).then(function (ss) {
        avail.servers = ss;
        avail.sub = ss.some(function (s) { return s.dataType === 'sub'; });
        avail.dub = ss.some(function (s) { return s.dataType === 'dub'; });
        cb(avail);
      }));
    }
    if (ctx.title && typeof window.hiSearch === 'function') {
      jobs.push(hindiWithRetry(ctx.title, n, 0).then(function (h) {
        avail.hindi = !!h;
        cb(avail);
      }));
    }
    return Promise.all(jobs).then(function () { return avail; });
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
          paintCard(job.card, job.ctx, job.n, avail);
        }).catch(function () {}).then(function () { running--; pump(); });
      })(pending.shift());
    }
  }
  function paintCard(card, ctx, n, avail) {
    if (openDlg && openDlg.n === n) { try { openDlg.refresh(); } catch (e) {} }
    var old = card.querySelector('.st-badges'); if (old) old.remove();
    var oldG = card.querySelector('.st-globe'); if (oldG) oldG.remove();
    if (!avail.sub && !avail.dub && !avail.hindi) return;
    var tags = '';
    if (avail.sub) tags += '<i class="st-b st-sub">SUB</i>';
    if (avail.dub) tags += '<i class="st-b st-dub">DUB</i>';
    if (avail.hindi) tags += '<i class="st-b st-hi">HINDI</i>';
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
    var actions = card.querySelector('.episode-actions');
    if (actions) actions.appendChild(btn); else card.appendChild(btn);
  }

  function wireDetail(mount, provider, id, d, mediaType) {
    var isManga = (d.mediaType || mediaType) === 'MANGA';
    if (isManga) return;
    var prov = d.provider || provider;
    var anilistId = (prov === 'anilist' && d.id) ? parseInt(d.id, 10) : null;
    if (!Number.isFinite(anilistId)) anilistId = null;
    var ctx = { anilistId: anilistId, title: d.title || '' };
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
    return out;
  }
  function providerDesc(p) {
    if (p.kind === 'hi') return 'Hindi dub · ToonStream';
    var bits = [];
    if (p.sub) bits.push('sub'); if (p.dub) bits.push('dub');
    return 'English ' + (bits.join(' & ') || 'stream') + ' · FlixCloud';
  }
  function providerLangs(p) {
    if (p.kind === 'hi') return ['Hindi'];
    var l = [];
    if (p.sub) l.push('Japanese');
    if (p.dub) l.push('English');
    return l;
  }

  var openDlg = null; // { n, avail, refresh } — refreshed when staged availability resolves
  function openProviderDialog(ctx, n, avail) {
    closeDialog();
    var provs = providersFor(avail);
    if (!provs.length) return;
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
      startWatch(ctx, n, selProv, selLang);
    });
    scrim.querySelector('.st-x').addEventListener('click', closeDialog);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeDialog(); });
    document.addEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') { closeDialog(); closePlayer(); } }
  function closeDialog() {
    openDlg = null;
    var s = document.querySelector('.st-scrim'); if (s) s.remove();
    document.removeEventListener('keydown', escClose);
  }

  /* ---------- in-app player ---------- */
  var playerHls = null, playerBlobUrls = [];
  function closePlayer() {
    if (playerHls) { try { playerHls.destroy(); } catch (e) {} playerHls = null; }
    playerBlobUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    playerBlobUrls = [];
    var p = document.querySelector('.st-player'); if (p) p.remove();
    document.removeEventListener('keydown', escClose);
  }

  function startWatch(ctx, n, prov, lang) {
    var shell = openPlayerShell(ctx, n, prov.name, lang);
    var done = false;
    function resolve() {
      if (prov.kind === 'hi') {
        return hindiWatch(ctx.title, n).then(function (w) {
          return { url: w.stream, audioTracks: [], subtitles: [], providerLabel: 'Hindi · ToonStream' };
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
      attachStream(shell, s, lang);
    }, function (err) {
      if (done) return;
      playerFail(shell, err && err.message ? err.message : 'Could not load this stream');
    });
    shell.querySelector('.st-p-retry').addEventListener('click', function () {
      shell.querySelector('.st-p-error').classList.add('hidden');
      shell.querySelector('.st-p-loading').classList.remove('hidden');
      resolve().then(function (s) { attachStream(shell, s, lang); },
        function (err) { playerFail(shell, err && err.message ? err.message : 'Could not load this stream'); });
    });
    return function () { done = true; };
  }

  function openPlayerShell(ctx, n, provName, lang) {
    closePlayer();
    var el = document.createElement('div');
    el.className = 'st-player';
    el.innerHTML =
      '<div class="st-p-top">' +
        '<button class="st-p-btn st-p-back" type="button" aria-label="Back">' + icon('x') + '</button>' +
        '<div class="st-p-title"><b>' + esc(ctx.title || 'Episode ' + n) + '</b>' +
          '<i>EP ' + n + ' · ' + esc(provName) + ' · ' + esc(lang) + '</i></div>' +
        '<button class="st-p-btn st-p-audio hidden" type="button" aria-label="Audio track">Native</button>' +
        '<button class="st-p-btn st-p-subs hidden" type="button" aria-label="Subtitles">Subs</button>' +
      '</div>' +
      '<video class="st-p-video" controls playsinline preload="auto"></video>' +
      '<div class="st-p-loading"><span class="st-p-spin"></span><i>Loading stream…</i></div>' +
      '<div class="st-p-error hidden"><b>Stream failed</b><p></p>' +
        '<button class="st-p-retry" type="button">Retry</button></div>' +
      '<div class="st-p-menu hidden"></div>';
    document.body.appendChild(el);
    el.querySelector('.st-p-back').addEventListener('click', closePlayer);
    document.addEventListener('keydown', escClose);
    return el;
  }
  function playerFail(shell, msg) {
    shell.querySelector('.st-p-loading').classList.add('hidden');
    var err = shell.querySelector('.st-p-error');
    err.querySelector('p').textContent = msg;
    err.classList.remove('hidden');
  }

  function attachStream(shell, s, wantLang) {
    var video = shell.querySelector('.st-p-video');
    shell.querySelector('.st-p-loading').classList.add('hidden');
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
      var hls = new window.Hls({ maxBufferLength: 30 });
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
  window.MPV2.Stream = {
    wireDetail: wireDetail,
    checkEpisode: function (ctx, n) { return checkEpisodeStaged(ctx, n, function () {}); },
    openProviderDialog: openProviderDialog
  };
})();
