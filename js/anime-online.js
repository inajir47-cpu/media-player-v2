/* ============================================================================
 * MEDIA PLAYER V2 · ONLINE PHASE — Discover tab + deep anime info (UI)
 * ----------------------------------------------------------------------------
 * New "Discover" tab for the Animation section (registered, not hard-wired):
 *   · TOP 010 with Today / Week / Month pill tabs and 01–10 rank badges
 *   · Genre chips + sort + paginated grid ("Load more")
 *   · Provider switcher injected into Animation → Settings ("Online data")
 *   · Deep-info detail route  #/animation/online/<provider>/<id>
 *     seasons, airing countdown, cast & characters, full synopsis, trailer
 *   · Character detail route  #/animation/online/<provider>/character/<id>
 *     (cast cards are tappable) — about, facts, animeography, voice actors
 * All data flows through MPV2.AnimeAPI; this file only renders + wires.
 * ========================================================================== */
(function () {
  'use strict';

  function API() { return window.MPV2.AnimeAPI; }
  function esc(s) { return window.MPV2.esc(s); }
  function icon(n, c) { return window.MPV2.icon(n, c); }
  function pageHead(sec, t, s) { return window.MPV2.pageHead(sec, t, s); }
  function emptyState(i, t, s) { return window.MPV2.emptyState(i, t, s); }

  var SEC_ID = 'animation';
  var state = null; // per-render Discover state
  // Last rendered title detail + its provider, for the rating/reviews popup
  // and character popups (all prefetched when the detail page loads).
  var lastDetail = null, lastDetailProvider = null;

  // Generic bottom-sheet modal. Reuses the .st-scrim/.st-dialog dialog chrome
  // from the provider chooser so popups look consistent.
  function openPopup(title, sub, bodyHtml) {
    closePopup();
    var scrim = document.createElement('div');
    scrim.className = 'st-scrim';
    scrim.innerHTML =
      '<div class="st-dialog rv-dialog" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<button class="st-x" type="button" aria-label="Close">' + icon('x') + '</button>' +
        '<h3>' + esc(title) + '</h3>' +
        (sub ? '<p class="st-sub">' + esc(sub) + '</p>' : '') +
        '<div class="rv-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(scrim);
    function onKey(e) { if (e.key === 'Escape') closePopup(); }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closePopup(); });
    scrim.querySelector('.st-x').addEventListener('click', closePopup);
    document.addEventListener('keydown', onKey);
    scrim._onKey = onKey;
    return scrim;
  }
  function closePopup() {
    var s = document.querySelector('.st-scrim .rv-dialog');
    if (s) {
      var scrim = s.parentElement;
      if (scrim && scrim._onKey) document.removeEventListener('keydown', scrim._onKey);
      if (scrim) scrim.remove();
    }
  }

  /* -------------------- rating details + reviews popup -------------------- */

  // Simple AniList-flavoured markdown for review bodies.
  function rvMd(s) {
    var t = esc(s || '').trim();
    if (!t) return '';
    return t
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_]+)__/g, '<b>$1</b>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/~!([\s\S]+?)!~/g, '<span class="spoiler">$1</span>')
      .replace(/\n{2,}/g, '</p><p class="rv-p">').replace(/\n/g, '<br>');
  }

  function openReviewsPopup(d) {
    var dist = (d.scoreDist || []).slice().sort(function (a, b) { return b.score - a.score; });
    var revs = d.reviews || [];
    var total = dist.reduce(function (a, s) { return a + (s.amount || 0); }, 0);
    var max = dist.reduce(function (m, s) { return Math.max(m, s.amount || 0); }, 0);
    var head =
      '<div class="rv-score-head"><div class="rv-score-big">★ ' + esc((d.score / 10).toFixed(1)) + '</div>' +
      '<div class="rv-score-sub">' + Number(total).toLocaleString('en-US') + ' ratings</div></div>' +
      (dist.length ? '<div class="rv-bars">' + dist.map(function (s) {
        var pct = max ? Math.round((s.amount / max) * 100) : 0;
        return '<div class="rv-bar-row"><span class="rv-bar-score">' + esc(String(s.score)) + '</span>' +
          '<span class="rv-bar-track"><span class="rv-bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="rv-bar-n">' + Number(s.amount || 0).toLocaleString('en-US') + '</span></div>';
      }).join('') + '</div>' : '');
    var list = revs.length ? '<h4 class="rv-sec">Reviews</h4>' + revs.map(function (rv, i) {
      var body = rvMd(rv.body);
      var long = (rv.body || '').length > 420;
      var shown = long ? rvMd(rv.body.slice(0, 420)) + '…' : body;
      var date = rv.createdAt
        ? new Date(rv.createdAt * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
      return '<article class="rv-card">' +
        '<div class="rv-head">' +
          (rv.avatar ? '<img class="rv-avatar" src="' + esc(rv.avatar) + '" alt="" loading="lazy">' :
                       '<span class="rv-avatar rv-avatar-fb">' + esc((rv.user || '?').charAt(0).toUpperCase()) + '</span>') +
          '<div class="rv-who"><b>' + esc(rv.user) + '</b>' +
            '<span>' + esc(date) + (rv.score != null ? ' · ★ ' + esc(String(rv.score)) : '') + '</span></div>' +
        '</div>' +
        (rv.summary ? '<div class="rv-summary">' + esc(rv.summary) + '</div>' : '') +
        '<div class="rv-text"><p class="rv-p">' + shown + '</p>' +
          (long ? '<div class="rv-full" hidden><p class="rv-p">' + body + '</p></div>' +
                   '<button type="button" class="rv-more" data-rv-toggle>Show more</button>' : '') +
        '</div></article>';
    }).join('') : '<p class="rv-empty">No reviews yet.</p>';
    var scrim = openPopup('Rating & Reviews', d.title, head + list);
    scrim.addEventListener('click', function (e) {
      var t = e.target.closest('[data-rv-toggle]');
      if (!t) return;
      var full = t.parentElement.querySelector('.rv-full');
      var open = full.hidden;
      full.hidden = !open;
      t.textContent = open ? 'Show less' : 'Show more';
    });
  }

  /* ------------------------- character popup ----------------------------- */

  function characterPopupHtml(c) {
    var anime = (c.anime || []).length
      ? '<h4 class="rv-sec">Appears in</h4><div class="ch-pop-grid">' +
        c.anime.map(function (a) {
          return '<div class="ch-pop-item"><img src="' + esc(a.image) + '" alt="' + esc(a.title) +
            '" loading="lazy"><span>' + esc(a.title) + '</span></div>';
        }).join('') + '</div>' : '';
    var vas = (c.vas || []).length
      ? '<h4 class="rv-sec">Voice actors</h4><div class="cast-grid">' +
        c.vas.map(function (v) {
          return '<div class="cast-card"><img class="cast-card-photo" src="' + esc(v.image) +
            '" alt="' + esc(v.name) + '" loading="lazy">' +
            '<div class="cast-card-copy"><strong>' + esc(v.name) + '</strong>' +
            '<span>Japanese</span></div></div>';
        }).join('') + '</div>' : '';
    return '<header class="ch-pop-hero"><span class="poster-img big"><img src="' + esc(c.image) +
      '" alt="' + esc(c.name) + '"></span>' +
      '<div class="detail-copy"><h1 class="ch-pop-name">' + esc(c.name) + '</h1>' +
      (c.native ? '<p class="detail-meta dim">' + esc(c.native) + '</p>' : '') +
      charFacts(c) + '</div></header>' +
      '<h4 class="rv-sec">About</h4>' + charDescription(c) + anime + vas;
  }

  function openCharacterPopup(provider, id, name) {
    var scrim = openPopup(name || 'Character', providerName(),
      '<div class="rv-loading"><span class="spin"></span>Loading…</div>');
    var body = scrim.querySelector('.rv-body');
    API().characterDetail(provider, id, name).then(function (c) {
      if (body && body.isConnected) body.innerHTML = characterPopupHtml(c);
    }).catch(function () {
      if (body && body.isConnected) body.innerHTML = '<p class="rv-empty">Could not load character info.</p>';
    });
  }

  function providerName() { return API().PROVIDERS[API().getProvider()].name; }

  // Detail link for a normalized item. Manga cards point at the manga detail
  // route (#/.../online/<provider>/manga/<id>); anime cards at the plain one.
  function detailPath(item) {
    var manga = item && item.mediaType
      ? item.mediaType === 'MANGA'
      : (typeof state !== 'undefined' && state && state.type === 'MANGA');
    return '#/' + SEC_ID + '/online/' + item.provider + '/' +
      (manga ? 'manga/' : '') + encodeURIComponent(item.id);
  }

  function countLabel(item) {
    if ((item && item.mediaType) === 'MANGA' || (state && state.type === 'MANGA')) {
      return item.chapters ? item.chapters + ' ch' : '';
    }
    return item.episodes ? item.episodes + ' eps' : '';
  }

  // Human-readable media kind: Manga / Movie / Series / OVA / ONA / …
  function formatLabel(item) {
    if (!item) return '';
    if (item.mediaType === 'MANGA') return 'Manga';
    var f = String(item.format || '').toUpperCase();
    var m = { TV: 'Series', TV_SHORT: 'Series', MOVIE: 'Movie', OVA: 'OVA',
              ONA: 'ONA', SPECIAL: 'Special', MUSIC: 'Music' };
    return m[f] || '';
  }

  /* ------------------------------- cards -------------------------------- */

  function onlineCard(item) {
    var meta = [item.year || '', formatLabel(item), countLabel(item)].filter(Boolean).join(' · ');
    // Opening-theme preview on hover (desktop) / long-press (touch). Manga has no OP.
    var opAttrs = (item.mediaType !== 'MANGA' && item.provider && item.id)
      ? ' data-op-provider="' + item.provider + '" data-op-id="' + item.id + '"' : '';
    var opVideo = opAttrs
      ? '<video class="op-preview" muted loop playsinline preload="none" aria-hidden="true"></video>' : '';
    return '<a class="poster-card online-card" href="' + detailPath(item) + '"' + opAttrs + '>' +
      '<span class="poster-img"><img src="' + esc(item.image) + '" alt="' + esc(item.title) +
      ' poster" loading="lazy">' + posterScore(item) + opVideo + '</span>' +
      '<span class="poster-title">' + esc(item.title) + '</span>' +
      '<span class="poster-meta">' + esc(meta) + '</span></a>';
  }

  function scoreBadge(item) {
    if (item.score == null) return '';
    return '<span class="online-score">' + (item.score / 10).toFixed(1) + '</span>';
  }

  // Rating chip overlaid on the poster image itself.
  function posterScore(item) {
    if (item.score == null) return '';
    return '<span class="poster-score">' + (item.score / 10).toFixed(1) + '</span>';
  }

  /* -------------------------- Recommendations --------------------------- */
  // "Recommended for you" row, seeded from the current TOP 010 chart-topper.
  // Sits directly above the TOP 010 list on the home page.

  function recoHtml() {
    return '<section class="online-block" id="recoBlock"><div class="online-head">' +
      '<div><h2>Recommended for you</h2><p class="online-sub">More like the chart-topper · Source: ' +
      esc(providerName()) + '</p></div></div>' +
      '<div class="poster-row" id="recoRow">' + skeletonCards(6) + '</div></section>';
  }

  function loadReco(block, seed) {
    var sec = block.querySelector('#recoBlock');
    if (!sec) return;
    if (!seed || !seed.id || API().getProvider() === 'kitsu') { sec.style.display = 'none'; return; }
    sec.style.display = '';
    var row = block.querySelector('#recoRow');
    API().recommendations(seed.id, state.type).then(function (items) {
      if (!row.isConnected) return;
      if (!items.length) { sec.style.display = 'none'; return; }
      sec.querySelector('.online-sub').textContent =
        'More like ' + seed.title + ' · Source: ' + providerName();
      row.innerHTML = items.map(onlineCard).join('');
    }).catch(function () { sec.style.display = 'none'; });
  }

  /* ---------------------------- HERO CAROUSEL ---------------------------- */
  // Animation home hero: the currently-airing anime, trending anime + movie
  // of the week, a recommended movie + series, and 2 random manga picks.
  // The active slide's background plays the opening theme video — the same
  // AnimeThemes source the detail page uses.

  function heroKindLabel(it) {
    if ((it.mediaType || '') === 'MANGA') return 'Manga';
    var f = String(it.format || '').toUpperCase();
    if (f === 'MOVIE') return 'Movie';
    if (f === 'TV' || f === 'TV_SHORT') return 'TV Show';
    if (f === 'OVA') return 'OVA';
    if (f === 'ONA') return 'ONA';
    if (f === 'SPECIAL') return 'Special';
    if (f === 'MUSIC') return 'Music';
    return 'Anime';
  }
  function heroIsOnAir(it) {
    var s = String(it.status || '').toUpperCase();
    return s === 'RELEASING' || s === 'CURRENTLY_AIRING' || s === 'CURRENT';
  }
  function heroIsNew(it) {
    return !!it.year && it.year >= new Date().getFullYear();
  }
  function heroIsMovie(it) { return String(it.format || '').toUpperCase() === 'MOVIE'; }
  function heroIsSeries(it) {
    var f = String(it.format || '').toUpperCase();
    return (it.mediaType || 'ANIME') === 'ANIME' &&
      (f === 'TV' || f === 'TV_SHORT' || f === 'ONA' || f === '');
  }
  function heroDedupe(slides) {
    var seen = {}, out = [];
    (slides || []).forEach(function (s) {
      if (!s || !s.item || !s.item.id) return;
      var k = s.item.key || (s.item.provider + ':' + s.item.id);
      if (seen[k]) return;
      seen[k] = 1; out.push(s);
    });
    return out;
  }

  function heroSlides() {
    var api = API();
    function ok(p) { return p.catch(function () { return []; }); }
    return Promise.all([
      ok(api.top10('week', 'ANIME')),   // currently airing, most popular first
      ok(api.top10('today', 'ANIME')),  // trending anime of the week
      ok(api.byFormat('MOVIE', 1)),      // trending movies
      ok(api.top10('today', 'MANGA'))    // manga pool
    ]).then(function (r) {
      var airing = r[0] || [], trend = r[1] || [], movies = r[2] || [], manga = r[3] || [];
      var slides = [];
      function push(item, kicker) { if (item && item.id) slides.push({ item: item, kicker: kicker }); }
      push(airing[0], 'ON AIR');
      var t1 = trend[0] && (!airing[0] || trend[0].key !== airing[0].key) ? trend[0] : trend[1];
      push(t1, 'TRENDING');
      push(movies[0], 'TRENDING');
      var seed = trend[0] || airing[0] || {};
      var base = heroDedupe(slides);
      function withRecs(recs) {
        var rm = null, rs = null;
        (recs || []).forEach(function (it) {
          if (!rm && heroIsMovie(it)) rm = it;
          else if (!rs && heroIsSeries(it)) rs = it;
        });
        base.push({ item: rm, kicker: 'RECOMMENDED' });
        base.push({ item: rs, kicker: 'RECOMMENDED' });
        var pool = (manga || []).slice();
        for (var i = pool.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        base.push({ item: pool[0], kicker: 'MANGA PICK' });
        base.push({ item: pool[1], kicker: 'MANGA PICK' });
        return heroDedupe(base).slice(0, 8);
      }
      if (seed.id && api.getProvider() !== 'kitsu') return ok(api.recommendations(seed.id, 'ANIME')).then(withRecs);
      return withRecs([]);
    });
  }

  function heroBadges(s) {
    var it = s.item, b = [];
    b.push('<span class="hero-badge kind">' + esc(heroKindLabel(it)) + '</span>');
    if (heroIsOnAir(it)) b.push('<span class="hero-badge onair"><i></i>ON AIR</span>');
    if (heroIsNew(it)) b.push('<span class="hero-badge new">NEW</span>');
    return b.join('');
  }

  function heroSlideHtml(s, i) {
    var it = s.item;
    var bg = it.banner || it.image || '';
    var score = it.score ? '★ ' + (it.score / 10).toFixed(1) : '';
    var meta = [it.year || '', heroKindLabel(it), score].filter(Boolean).join(' · ');
    var desc = (it.synopsis || '').replace(/\s+/g, ' ').trim();
    return '<article class="hero-slide' + (i === 0 ? ' active' : '') + '" data-hero-slide="' + i + '">' +
      '<div class="hero-bg">' +
        (bg ? '<img src="' + esc(bg) + '" alt="" aria-hidden="true" loading="lazy">' : '') +
        '<video class="hero-video" muted loop playsinline preload="none" aria-hidden="true"></video>' +
      '</div><div class="hero-shade"></div>' +
      (it.poster || it.image
        ? '<div class="hero-poster"><img src="' + esc(it.poster || it.image) + '" alt="' + esc(it.title) + ' poster" loading="lazy" onerror="this.closest(\'.hero-poster\').style.display=\'none\'"></div>'
        : '') +
      '<div class="hero-copy">' +
        '<p class="hero-kicker">' + esc(s.kicker) + '</p>' +
        '<div class="hero-badges">' + heroBadges(s) + '</div>' +
        '<h2>' + esc(it.title) + '</h2>' +
        (meta ? '<p class="hero-meta">' + esc(meta) + '</p>' : '') +
        (desc ? '<p class="hero-desc">' + esc(desc) + '</p>' : '') +
        '<a class="hero-cta" href="' + detailPath(it) + '">View details</a>' +
      '</div></article>';
  }

  // Static fallback: the hero never renders broken if the APIs are down.
  function heroFallbackHtml() {
    return '<section class="hero"><div class="hero-copy">' +
      '<div class="label">Animation</div><h2>Continue where you left off</h2>' +
      '<p>Your featured title and viewing progress will live here as the library grows.</p>' +
      '</div></section>';
  }

  window.MPV2.heroHtml = function () {
    return '<section class="hero-carousel" id="heroCarousel" aria-label="Featured">' +
      '<div class="hero-track" id="heroTrack"><div class="hero-loading"><span></span></div></div>' +
      '<button class="hero-nav prev" data-hero-nav="-1" aria-label="Previous slide">‹</button>' +
      '<button class="hero-nav next" data-hero-nav="1" aria-label="Next slide">›</button>' +
      '<div class="hero-dots" id="heroDots"></div>' +
    '</section>';
  };

  function playMutedHero(v) {
    v.muted = true;
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }

  // Opening video for the active slide only — same source as the detail page.
  function heroVideoFor(wrap, s, idx) {
    var it = s.item;
    if ((it.mediaType || '') === 'MANGA' || !detailVideoAllowed()) return;
    var slides = wrap.querySelectorAll('.hero-slide');
    var slideEl = slides[idx];
    if (!slideEl) return;
    var v = slideEl.querySelector('.hero-video');
    if (!v) return;
    Array.prototype.forEach.call(wrap.querySelectorAll('.hero-video'), function (o) {
      if (o !== v) { try { o.pause(); } catch (e) {} }
    });
    if (!v.dataset.heroWired) {
      v.dataset.heroWired = '1';
      v.addEventListener('playing', function () { v.classList.add('hero-on'); });
      v.addEventListener('error', function () { v.classList.remove('hero-on'); v.removeAttribute('src'); });
    }
    if (v.dataset.heroSrc) {
      if (slideEl.classList.contains('active')) playMutedHero(v);
      return;
    }
    sharedOpVideoUrl(it).then(function (url) {
      if (!url || !v.isConnected) return;
      v.dataset.heroSrc = url;
      v.src = url;
      if (slideEl.classList.contains('active')) playMutedHero(v);
    });
  }

  function wireHero(wrap, slides) {
    var track = wrap.querySelector('#heroTrack');
    var dots = wrap.querySelector('#heroDots');
    var n = slides.length, cur = 0, timer = null;
    dots.innerHTML = slides.map(function (_, i) {
      return '<button data-hero-dot="' + i + '" aria-label="Go to slide ' + (i + 1) + '"' +
        (i === 0 ? ' class="active"' : '') + '></button>';
    }).join('');
    function activate(i) {
      cur = ((i % n) + n) % n;
      var els = track.querySelectorAll('.hero-slide');
      Array.prototype.forEach.call(els, function (el, k) { el.classList.toggle('active', k === cur); });
      Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('active', k === cur); });
      heroVideoFor(wrap, slides[cur], cur);
    }
    function play() {
      stop();
      if (n > 1 && detailVideoAllowed()) timer = setInterval(function () { activate(cur + 1); }, 10000);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    wrap.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-hero-nav]');
      if (nav) { activate(cur + parseInt(nav.getAttribute('data-hero-nav'), 10)); play(); return; }
      var dot = e.target.closest('[data-hero-dot]');
      if (dot) { activate(parseInt(dot.getAttribute('data-hero-dot'), 10)); play(); }
    });
    // Hold-to-pause (touch/mouse press) and hover-to-pause (real mouse only):
    // the carousel never auto-advances while the user is interacting with it.
    var held = false, hovering = false;
    function maybeResume() { if (!held && !hovering && wrap.isConnected) play(); }
    wrap.addEventListener('pointerdown', function () { held = true; stop(); }, { passive: true });
    function releaseHold() { if (!held) return; held = false; maybeResume(); }
    window.addEventListener('pointerup', releaseHold, { passive: true });
    window.addEventListener('pointercancel', releaseHold, { passive: true });
    wrap.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse') { hovering = true; stop(); }
    });
    wrap.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse') { hovering = false; maybeResume(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (!wrap.isConnected) return;
      if (document.hidden) stop(); else play();
    });
    activate(0); play();
  }

  window.MPV2.mountHero = function (sec, root) {
    var wrap = root.querySelector('#heroCarousel');
    if (!wrap || wrap.getAttribute('data-mounted')) return;
    wrap.setAttribute('data-mounted', '1');
    heroSlides().then(function (slides) {
      var track = wrap.querySelector('#heroTrack');
      if (!track || !track.isConnected) return;
      if (!slides.length) { wrap.outerHTML = heroFallbackHtml(); return; }
      track.innerHTML = slides.map(heroSlideHtml).join('');
      wireHero(wrap, slides);
    }).catch(function () {
      if (wrap.isConnected) wrap.outerHTML = heroFallbackHtml();
    });
  };

  /* ------------------------------ TOP 010 ------------------------------- */

  var RANGES = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'Week' },
    { id: 'month', label: 'Month' }
  ];

  function top10Html() {
    var manga = state.type === 'MANGA';
    var pills = RANGES.map(function (r) {
      return '<button class="pill' + (state.range === r.id ? ' active' : '') +
        '" data-range="' + r.id + '" role="tab" aria-selected="' +
        (state.range === r.id) + '">' + r.label + '</button>';
    }).join('');
    return '<section class="online-block"><div class="online-head">' +
        '<div><h2>TOP 010</h2><p class="online-sub">Trending ' + (manga ? 'manga' : 'anime') +
        ' · Source: ' + esc(providerName()) + '</p></div>' +
        '<div class="pill-row" role="tablist" aria-label="Time range">' + pills + '</div>' +
      '</div><div class="top10-viewport" id="top10Viewport"><div class="top10-list" id="top10List">' + skeletonRows(5) + '</div></div></section>';
  }

  function skeletonRows(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="top10-row sk-row"><span class="rank">--</span>' +
      '<span class="thumb sk"></span><span class="copy"><b class="sk-line sk"></b>' +
      '<small class="sk-line short sk"></small></span></div>';
    return h;
  }

  function rankRow(item, i) {
    var n = ('0' + (i + 1)).slice(-2);
    var sub = [item.year || '', formatLabel(item), (item.genres || []).slice(0, 2).join(' · ')]
      .filter(Boolean).join(' · ');
    // Banner on the right side of the row: anime rows play the opening video
    // over the poster; manga rows (no opening videos exist) show the poster,
    // which is also the fallback whenever a video fails to load.
    var screenInner = item.image
      ? '<img class="top10-poster" src="' + esc(item.image) + '" alt="" loading="lazy" aria-hidden="true">'
      : '';
    if (state.type !== 'MANGA' && item.provider && item.id) {
      screenInner += '<video class="top10-video" muted loop playsinline preload="auto" aria-hidden="true"' +
        ' data-op-provider="' + item.provider + '" data-op-id="' + item.id + '"' +
        ' data-op-title="' + esc(item.title) + '"></video>';
    }
    var opScreen = '<span class="top10-screen">' + screenInner + '</span>';
    return '<a class="top10-row" href="' + detailPath(item) + '">' +
      '<span class="rank">' + n + '</span>' +
      '<span class="thumb"><img src="' + esc(item.image) + '" alt="" loading="lazy"></span>' +
      '<span class="copy"><b><span class="t">' + esc(item.title) + '</span>' + scoreBadge(item) + '</b>' +
      '<small>' + esc(sub) + '</small></span>' + opScreen +
      '<span class="go">' + icon('chevron') + '</span></a>';
  }

  function loadTop10(root) {
    var list = root.querySelector('#top10List');
    list.innerHTML = skeletonRows(5);
    API().top10(state.range, state.type).then(function (items) {
      if (!list.isConnected) return;
      list.innerHTML = items.length
        ? items.map(rankRow).join('')
        : emptyState('info', 'Nothing here yet', 'Try another range or provider.');
      if (window.MPV2.OPVideos) window.MPV2.OPVideos.wireTop10(list, items);
      var vp = root.querySelector('#top10Viewport');
      if (vp) wireTop10Carousel(vp);
      loadReco(root, items[0]);
    }).catch(function (err) { if (list.isConnected) list.innerHTML = errorHtml(err); });
  }

  /* TOP 010 auto-carousel: desktop/tablet scrolls vertically showing 3 rows,
   * phones scroll horizontally showing 1 card (2 on wider phones).
   * Auto-advances like a moving carousel; any manual scroll pauses it for a
   * while, then it resumes. Rows are never detached, so the opening videos
   * keep playing in the background and never restart when scrolled back. */
  function carouselReduced() {
    try {
      var s = JSON.parse(localStorage.getItem('mpv2_settings_v1') || '{}');
      if (s.reduce) return true;
    } catch (e) {}
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function wireTop10Carousel(viewport) {
    if (!viewport || carouselReduced()) return;
    if (viewport._t10stop) viewport._t10stop();
    var list = viewport.querySelector('#top10List');
    if (!list) return;
    var GAP = 8, DWELL = 4200, RESUME_AFTER = 12000;
    var timer = null, resumeT = null;
    function horizontal() {
      return !!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
    }
    function step() {
      if (!viewport.isConnected || document.hidden) return;
      var rows = list.children;
      if (rows.length < 2) return;
      var r0 = rows[0].getBoundingClientRect();
      if (horizontal()) {
        var w = r0.width + GAP;
        if (!(w > 0)) return;
        var idx = Math.round(viewport.scrollLeft / w);
        var next = (idx + 1) % rows.length;
        viewport.scrollTo({ left: next * w, behavior: 'smooth' });
      } else {
        var h = r0.height + GAP;
        if (!(h > 0)) return;
        var top = Math.round(viewport.scrollTop / h) * h;
        var maxTop = viewport.scrollHeight - viewport.clientHeight;
        if (top + h > maxTop + 1) {
          viewport.scrollTo({ top: 0, behavior: 'smooth' }); // rewind to start
        } else {
          viewport.scrollTo({ top: top + h, behavior: 'smooth' });
        }
      }
    }
    function start() {
      stop();
      timer = setInterval(step, DWELL);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function onUserScroll() {
      stop();
      if (resumeT) clearTimeout(resumeT);
      resumeT = setTimeout(start, RESUME_AFTER);
    }
    viewport.addEventListener('wheel', onUserScroll, { passive: true });
    viewport.addEventListener('touchstart', onUserScroll, { passive: true });
    viewport._t10stop = function () {
      stop();
      if (resumeT) { clearTimeout(resumeT); resumeT = null; }
    };
    start();
  }

  function errorHtml(err, showDetail) {
    var hint = /jikan/i.test(err && err.message || '')
      ? 'MyAnimeList is not responding right now — switch provider in Settings.'
      : 'Check your connection and try again.';
    var tech = (showDetail && err && err.message)
      ? '<small class="err-tech">' + esc(String(err.message)).slice(0, 140) + '</small>' : '';
    return '<div class="online-error">' + icon('info') +
      '<p><b>Could not load data.</b><br>' + esc(hint) + '</p>' + tech +
      '<button class="retry-btn" data-retry>Retry</button></div>';
  }

  /* ------------------------------ genres -------------------------------- */

  function genreHtml() {
    var chips = API().GENRES.map(function (g) {
      return '<button class="chip' + (state.genre === g ? ' active' : '') +
        '" data-genre="' + esc(g) + '">' + esc(g) + '</button>';
    }).join('');
    var sorts = [['popularity', 'Popularity'], ['score', 'Score'], ['latest', 'Latest']]
      .map(function (s) {
        return '<button class="pill small' + (state.sort === s[0] ? ' active' : '') +
          '" data-sort="' + s[0] + '">' + s[1] + '</button>';
      }).join('');
    return '<section class="online-block"><div class="online-head"><div><h2>Genres</h2>' +
        '<p class="online-sub">Browse by category · Source: ' + esc(providerName()) + '</p></div>' +
        '<div class="pill-row" aria-label="Sort">' + sorts + '</div></div>' +
      '<div class="chip-row" aria-label="Genres">' + chips + '</div>' +
      '<div class="poster-grid online-grid" id="genreGrid">' + skeletonCards(6) + '</div>' +
      '<div class="load-more-wrap"><div class="infinite-sentinel" id="genreSentinel" aria-hidden="true"></div></div>' +
      '</section>';
  }

  function skeletonCards(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="poster-card sk-card"><span class="poster-img sk"></span>' +
      '<span class="sk-line sk"></span><span class="sk-line short sk"></span></div>';
    return h;
  }

  function loadGenre(root, append) {
    var grid = root.querySelector('#genreGrid');
    var sentinel = root.querySelector('#genreSentinel');
    if (state.loading) return;
    if (!append) grid.innerHTML = skeletonCards(6);
    state.loading = true;
    if (sentinel) sentinel.classList.add('loading');
    API().byGenre(state.genre, state.page, state.sort, state.type).then(function (res) {
      state.loading = false;
      if (sentinel) sentinel.classList.remove('loading');
      if (!grid.isConnected) return;
      if (!append) state.items = [];
      state.items = state.items.concat(res.items);
      state.hasMore = res.hasMore;
      grid.innerHTML = state.items.length
        ? state.items.map(onlineCard).join('')
        : emptyState('info', 'No titles found', 'Try another genre or provider.');
    }).catch(function (err) {
      state.loading = false;
      if (sentinel) sentinel.classList.remove('loading');
      if (!grid.isConnected) return;
      if (!append) grid.innerHTML = errorHtml(err);
    });
  }

  /* ------------------------------ Search -------------------------------- */
  // Live search across anime (incl. movies) + manga, rendered by the app's
  // default Search tab (#/animation/search).

  function searchResultsHtml(q, res) {
    var a = res.anime || [], m = res.manga || [];
    if (!a.length && !m.length)
      return emptyState('search', 'No results', 'Try a different title.');
    return '<div class="online-search-head"><h3>Results for &ldquo;' + esc(q) + '&rdquo;</h3></div>' +
      (a.length ? '<p class="online-sub2">Anime &amp; movies</p>' +
        '<div class="poster-grid online-grid">' + a.map(onlineCard).join('') + '</div>' : '') +
      (m.length ? '<p class="online-sub2">Manga</p>' +
        '<div class="poster-grid online-grid">' + m.map(onlineCard).join('') + '</div>' : '');
  }

  /* --------------------------- Discover block --------------------------- */
  // Discover lives on the Animation home page (after the hero carousel and
  // Recently Added), not as its own tab. The HTML is rendered inline by the
  // home page; this module mounts (wires + loads) it afterwards.

  function resetDiscoverState(type) {
    state = { type: type === 'MANGA' ? 'MANGA' : 'ANIME',
              range: 'today', genre: 'Action', sort: 'popularity',
              page: 1, items: [], hasMore: false, loading: false };
  }

  window.MPV2.discoverBlockHtml = function (sec) {
    resetDiscoverState('ANIME');
    return '<section class="row online-discover-block" id="discoverBlock">' +
      '<div class="row-head"><h2>Discover</h2>' +
      '<span class="muted-link">Live rankings · ' + esc(providerName()) + '</span></div>' +
      '<div class="online-wrap">' + recoHtml() + top10Html() + genreHtml() + '</div></section>';
  };

  window.MPV2.mountDiscoverBlock = function (sec, root) {
    var block = root.querySelector('#discoverBlock');
    if (!block || block.getAttribute('data-mounted')) return;
    block.setAttribute('data-mounted', '1');
    wireDiscover(sec, block);
    loadTop10(block);
    loadGenre(block, false);
  };

  /* ---------------------------- Manga block ----------------------------- */
  // Manga lives on the Animation "Manga" tab: TOP 010 manga + recommendations
  // seeded from its chart-topper + genre browse. Reuses the same builders and
  // module state as Discover; only one block is ever mounted at a time.

  window.MPV2.mangaBlockHtml = function (sec) {
    resetDiscoverState('MANGA');
    return '<section class="row online-discover-block" id="mangaBlock">' +
      '<div class="row-head"><h2>Manga</h2>' +
      '<span class="muted-link">Live rankings · ' + esc(providerName()) + '</span></div>' +
      '<div class="online-wrap">' + recoHtml() + top10Html() + genreHtml() + '</div></section>';
  };

  window.MPV2.mountMangaBlock = function (sec, root) {
    var block = root.querySelector('#mangaBlock');
    if (!block || block.getAttribute('data-mounted')) return;
    block.setAttribute('data-mounted', '1');
    wireDiscover(sec, block);
    loadTop10(block);
    loadGenre(block, false);
  };

  /* ----------------------------- Anime tab ---------------------------- */
  // The Animation "Anime" tab leads with live Series / Movies / OVAs rows
  // (mirroring how the Manga tab leads with the live manga block); the
  // local anime catalogue renders below it.

  var FORMAT_ROWS = [
    { format: 'TV',    label: 'Series' },
    { format: 'MOVIE', label: 'Movies' },
    { format: 'OVA',   label: 'OVAs' }
  ];

  window.MPV2.animeTabHtml = function (sec) {
    resetDiscoverState('ANIME');
    var rows = FORMAT_ROWS.map(function (fr) {
      return '<section class="online-block"><div class="online-head">' +
        '<div><h2>' + fr.label + '</h2><p class="online-sub">Top ' +
        fr.label.toLowerCase() + ' · Source: ' + esc(providerName()) + '</p></div></div>' +
        '<div class="poster-row" data-frow="' + fr.format + '">' + skeletonCards(6) +
        '</div></section>';
    }).join('');
    return '<section class="row online-discover-block" id="animeTabBlock">' +
      '<div class="row-head"><h2>Anime</h2>' +
      '<span class="muted-link">Live library · ' + esc(providerName()) + '</span></div>' +
      '<div class="online-wrap">' + rows + '</div></section>';
  };

  window.MPV2.mountAnimeTab = function (sec, root) {
    var block = root.querySelector('#animeTabBlock');
    if (!block || block.getAttribute('data-mounted')) return;
    block.setAttribute('data-mounted', '1');
    FORMAT_ROWS.forEach(function (fr) {
      var row = block.querySelector('[data-frow="' + fr.format + '"]');
      if (!row) return;
      API().byFormat(fr.format, 1).then(function (items) {
        if (!row.isConnected) return;
        row.innerHTML = items.length
          ? items.map(onlineCard).join('')
          : emptyState('info', 'No titles found', 'Try another provider in Settings.');
      }).catch(function (err) { if (row.isConnected) row.innerHTML = errorHtml(err); });
    });
  };

  function wireDiscover(sec, root) {
    root.addEventListener('click', function (e) {
      var r = e.target.closest('[data-range]');
      if (r) {
        state.range = r.getAttribute('data-range');
        root.querySelectorAll('[data-range]').forEach(function (b) {
          var on = b === r;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
        });
        loadTop10(root);
        return;
      }
      var g = e.target.closest('[data-genre]');
      if (g) {
        state.genre = g.getAttribute('data-genre');
        state.page = 1;
        root.querySelectorAll('[data-genre]').forEach(function (b) {
          b.classList.toggle('active', b === g);
        });
        loadGenre(root, false);
        return;
      }
      var s = e.target.closest('[data-sort]');
      if (s) {
        state.sort = s.getAttribute('data-sort');
        state.page = 1;
        root.querySelectorAll('[data-sort]').forEach(function (b) {
          b.classList.toggle('active', b === s);
        });
        loadGenre(root, false);
        return;
      }
      if (e.target.closest('[data-retry]')) {
        loadTop10(root);
        loadGenre(root, false);
      }
    });
    // Infinite scroll: auto-fetch the next page when the sentinel scrolls
    // into view (600px before it, so there's no visible gap).
    var sentinel = root.querySelector('#genreSentinel');
    if (sentinel && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0] && entries[0].isIntersecting && state.hasMore && !state.loading) {
          state.page += 1;
          loadGenre(root, true);
        }
      }, { rootMargin: '600px 0px' });
      io.observe(sentinel);
    }
  }

  // Shared with the app's default Search tab.
  window.MPV2.onlineCard = onlineCard;
  window.MPV2.searchResultsHtml = searchResultsHtml;
  window.MPV2.onlineSkeletons = skeletonCards;
  window.MPV2.onlineErrorHtml = errorHtml;

  /* ------------------------- provider settings -------------------------- */

  window.MPV2.onlineSettingsHtml = function (sec) {
    if (!sec || sec.id !== SEC_ID) return '';
    var cur = API().getProvider();
    var hasTmdb = !!(API().getTmdbKey && API().getTmdbKey());
    var btns = Object.keys(API().PROVIDERS).map(function (k) {
      var p = API().PROVIDERS[k];
      return '<button class="segment' + (cur === k ? ' active' : '') + '" data-provider="' + k +
        '" role="radio" aria-checked="' + (cur === k) + '" title="' + esc(p.note) + '">' +
        '<span>' + esc(p.name) + '</span></button>';
    }).join('');
    return '<section class="settings-group"><h2>Online data</h2>' +
      '<div class="theme-block"><p class="theme-label">Anime &amp; manga data provider</p>' +
      '<div class="segmented" role="radiogroup" aria-label="Anime and manga data provider">' + btns + '</div>' +
      '<p class="provider-note">Switching provider reloads Discover and Manga with the new source. ' +
      'Jikan (MyAnimeList) can be slow or unreachable at times.</p>' +
      '</div>' +
      '<div class="theme-block"><p class="theme-label">TMDB API key <span class="tmdb-opt">(optional)</span></p>' +
      '<p class="provider-note">TMDB is free — grab a key at themoviedb.org → Settings → API, paste it here, ' +
      'and every episode gets its own still photo instead of the series poster.</p>' +
      '<div class="tmdb-key-row"><input type="password" data-tmdb-key autocomplete="off" spellcheck="false" ' +
      'placeholder="' + (hasTmdb ? 'Key saved ✓ — paste a new key to replace it' : 'Paste your free TMDB API key (v3)') + '" aria-label="TMDB API key">' +
      '<button class="tmdb-btn" data-tmdb-save>Save</button>' +
      (hasTmdb ? '<button class="tmdb-btn tmdb-ghost" data-tmdb-clear>Clear</button>' : '') + '</div>' +
      (hasTmdb ? '<p class="provider-note tmdb-ok">TMDB key saved — full episode stills are active.</p>' : '') +
      '</div></section>';
  };

  window.MPV2.wireOnlineSettings = function (sec, root) {
    if (!sec || sec.id !== SEC_ID) return;
    root.querySelectorAll('[data-provider]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-provider');
        if (key === API().getProvider()) return;
        API().setProvider(key);
        root.querySelectorAll('[data-provider]').forEach(function (o) {
          var on = o === b;
          o.classList.toggle('active', on);
          o.setAttribute('aria-checked', String(on));
        });
        window.MPV2.toast('Provider · ' + API().PROVIDERS[key].name);
        // Immediately refresh Discover if it is visible (now on the home page).
        var h = location.hash || '';
        var onHome = h === '#/' + SEC_ID || h === '#/' + SEC_ID + '/' || h === '#/' + SEC_ID + '/home';
        if (h.indexOf('#/' + SEC_ID + '/discover') === 0 || onHome) {
          window.MPV2.render();
        }
      });
    });
    var saveBtn = root.querySelector('[data-tmdb-save]');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var inp = root.querySelector('[data-tmdb-key]');
      var v = inp ? inp.value.trim() : '';
      if (!v) { window.MPV2.toast('Paste your TMDB API key first'); return; }
      API().setTmdbKey(v);
      window.MPV2.toast('TMDB key saved — episode stills active');
      window.MPV2.render();
    });
    var clearBtn = root.querySelector('[data-tmdb-clear]');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      API().setTmdbKey('');
      window.MPV2.toast('TMDB key removed');
      window.MPV2.render();
    });
  };

  /* --------------------------- deep detail ------------------------------ */

  function countdown(airingAt) {
    if (!airingAt) return '';
    var ms = airingAt - Date.now();
    if (ms <= 0) return 'airing now';
    var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    return 'in ' + (d ? d + 'd ' : '') + (h || d ? h + 'h ' : '') + m + 'm';
  }

  function castCard(c, provider) {
    var vaLine = c.va ? '<span>' + esc(c.role) + ' · ' + esc(c.va.name) + '</span>' +
      '<small>Voice · Japanese</small>' : '<span>' + esc(c.role) + '</span>';
    var vaPhoto = c.va && c.va.image
      ? '<img class="cast-va-photo" src="' + esc(c.va.image) + '" alt="' + esc(c.va.name) + '" loading="lazy">'
      : '<span class="cast-card-arrow">' + icon('chevron') + '</span>';
    var link = c.id && provider
      ? ' data-char-provider="' + esc(provider) + '" data-char-id="' + esc(String(c.id)) +
        '" data-char-name="' + esc(c.name || '') +
        '" tabindex="0" role="link" aria-label="' + esc(c.name) + ' details"'
      : '';
    return '<div class="cast-card online-cast' + (link ? ' is-link' : '') + '"' + link +
      '><img class="cast-card-photo" src="' + esc(c.image) +
      '" alt="' + esc(c.name) + '" loading="lazy">' +
      '<div class="cast-card-copy"><strong>' + esc(c.name) + '</strong>' + vaLine + '</div>' +
      vaPhoto + '</div>';
  }

  /* ------------- Detail background opening video (AnimeThemes) ------------- */
  // Same API the Konosuba player uses for its trailer/opening videos:
  // raw .webm files from api.animethemes.moe, looked up by AniList ID first,
  // falling back to a title search for other providers.
  var openingCache = {};
  function fetchOpeningVideo(anilistId, title) {
    var key = 'a' + (anilistId || '') + '|' + String(title || '').toLowerCase().trim();
    if (openingCache[key]) return openingCache[key];
    function firstWebm(anime) {
      var themes = (anime && anime.animethemes) || [];
      for (var i = 0; i < themes.length; i++) {
        var entries = themes[i].animethemeentries || [];
        for (var j = 0; j < entries.length; j++) {
          var videos = entries[j].videos || [];
          for (var k = 0; k < videos.length; k++) {
            if (videos[k].link && videos[k].link.indexOf('.webm') > 0) return videos[k].link;
          }
        }
      }
      return null;
    }
    function byTitle() {
      if (!title) return Promise.resolve(null);
      return fetch('https://api.animethemes.moe/search?q=' + encodeURIComponent(title) +
        '&fields[search]=anime&include[anime]=animethemes.animethemeentries.videos')
        .then(function (r) { return r.json(); })
        .then(function (d) { return firstWebm((d.search && d.search.anime && d.search.anime[0]) || null); })
        .catch(function () { return null; });
    }
    var first = anilistId
      ? fetch('https://api.animethemes.moe/anime?filter[has]=resources&filter[site]=AniList' +
          '&filter[external_id]=' + encodeURIComponent(anilistId) +
          '&include=animethemes.animethemeentries.videos')
        .then(function (r) { return r.json(); })
        .then(function (d) { return firstWebm((d.anime && d.anime[0]) || null); })
        .catch(function () { return null; })
      : Promise.resolve(null);
    var p = first.then(function (url) { return url ? url : byTitle(); });
    openingCache[key] = p;
    return p;
  }

  // One shared opening-video pipeline for the hero carousel, TOP 010 and the
  // detail page (see js/op-videos.js): the same anime resolves to the same
  // file, the lookup is cached persistently, and the service worker downloads
  // the file once and reuses it everywhere. Falls back to fetchOpeningVideo
  // when the shared module is unavailable or finds nothing.
  function sharedOpVideoUrl(item) {
    function legacy() {
      var anilistId = item && item.provider === 'anilist' ? item.id : null;
      return fetchOpeningVideo(anilistId, item && item.title);
    }
    var ov = window.MPV2 && window.MPV2.OPVideos;
    if (ov && item && item.provider && item.id) {
      return ov.playUrl(item.provider, item.id, item.title).then(function (url) {
        return url || legacy();
      });
    }
    return legacy();
  }

  function detailVideoAllowed() {
    try {
      var s = JSON.parse(localStorage.getItem('mpv2_settings_v1') || '{}');
      if (s.autoplay === false || s.reduce) return false;
    } catch (e) {}
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return true;
  }

  // Faded, muted, looping opening video on the right side of the detail hero
  // card — the same placement as the Konosuba player's trailer layer.
  function mountDetailVideo(mount, d, mediaType) {
    var isManga = (d.mediaType || mediaType) === 'MANGA';
    if (isManga || !detailVideoAllowed()) return;
    sharedOpVideoUrl(d).then(function (url) {
      if (!url) return;
      var det = mount.querySelector('.online-detail');
      if (!det) return;
      var hero = det.querySelector('header.detail-hero');
      if (!hero || hero.querySelector('.detail-side-video')) return;
      var v = document.createElement('video');
      v.className = 'detail-side-video';
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.preload = 'metadata'; v.src = url;
      v.addEventListener('playing', function () { hero.classList.add('has-side-video'); });
      v.addEventListener('error', function () { v.remove(); });
      hero.insertBefore(v, hero.firstChild);
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () { /* autoplay blocked: hero stays */ });
    });
  }

  window.MPV2.renderOnlineDetail = function (sectionId, provider, id, mediaType) {
    var sec = window.MPV2.SECTIONS[sectionId] || window.MPV2.SECTIONS[SEC_ID];
    var mount = document.querySelector('#view') || document.querySelector('#app');
    document.title = 'Loading… · ' + sec.name + ' · Media Player V2';
    mount.innerHTML = pageHead(sec, 'Loading', 'Fetching title details…') +
      '<div class="online-wrap">' + skeletonCards(3) + '</div>';
    window.scrollTo(0, 0);
    API().detail(provider, id, mediaType).then(function (d) {
      document.title = d.title + ' · ' + sec.name + ' · Media Player V2';
      mount.innerHTML = detailHtml(sec, d, mediaType);
      lastDetail = d; lastDetailProvider = provider;
      // Prefetch character details for every displayed cast card now, so the
      // character popup opens instantly (results are cached 7 days).
      (d.characters || []).forEach(function (c) {
        if (c && c.id) API().characterDetail(provider, c.id, c.name).catch(function () {});
      });
      tintFromPoster(mount, d.image);
      mountDetailVideo(mount, d, mediaType);
      mountEpList(mount, provider, id, d, (d.mediaType || mediaType) === 'MANGA');
      whenStreamReady(function (S) { S.wireDetail(mount, provider, id, d, mediaType); });
      var woBtn = mount.querySelector('[data-watch-order]');
      if (woBtn) woBtn.addEventListener('click', function () { openWatchOrder(provider, d); });
      ensureCountdownTicker();
      window.scrollTo(0, 0);
    }).catch(function (err) {
      mount.innerHTML = pageHead(sec, 'Details', 'Something went wrong.') +
        '<div class="online-wrap">' + errorHtml(err) + '</div>';
      mount.addEventListener('click', function (e) {
        if (e.target.closest('[data-retry]')) window.MPV2.renderOnlineDetail(sectionId, provider, id, mediaType);
      });
    });
  };

  function detailHtml(sec, d, mediaType) {
    var isManga = (d.mediaType || mediaType) === 'MANGA';
    var isMovie = !isManga && String(d.format || '').toUpperCase() === 'MOVIE';
    var counts = isManga
      ? [d.chapters ? d.chapters + ' chapters' : '', d.volumes ? d.volumes + ' volumes' : '']
      : [(d.episodes && !isMovie) ? d.episodes + ' episodes' : ''];
    var meta = [prettyStatus(d.status, isManga), d.year || '', formatLabel(d)]
      .concat(counts)
      .filter(Boolean).join(' · ');
    // Tappable rating: opens the rating-details + reviews popup. The review
    // data rides along with the detail query, so the popup opens instantly.
    var hasRatingData = d.score != null &&
      (((d.reviews || []).length) || ((d.scoreDist || []).length));
    var ratingBtn = d.score != null
      ? (hasRatingData
        ? '<button type="button" class="rating-btn" data-open-reviews aria-label="Rating details and reviews">★ ' +
          esc((d.score / 10).toFixed(1)) + '</button>'
        : '<span class="rating-static">★ ' + esc((d.score / 10).toFixed(1)) + '</span>')
      : '';
    var air = '';
    if (!isManga && d.nextAiring && d.nextAiring.airingAt) {
      var at = new Date(d.nextAiring.airingAt);
      var dateStr = at.toLocaleDateString(undefined, { weekday: 'long' }) + ', ' +
        at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      air = '<div class="next-airing"><div class="na-top">' +
        '<span class="na-pill"><span class="na-dot"></span>NEXT AIRING</span>' +
        '<span class="na-ep">EP ' + esc(String(d.nextAiring.episode || '?')) + '</span></div>' +
        '<p class="na-date">' + esc(dateStr) + '</p>' +
        cdBoxesHtml(d.nextAiring.airingAt, false) + '</div>';
    } else if (!isManga && d.nextAiring && d.nextAiring.text) {
      air = '<div class="airing-banner">' + icon('bell') + '<span>Episode ' +
        esc(String(d.nextAiring.episode || '?')) + ' ' + esc(d.nextAiring.text) +
        '</span></div>';
    }
    var trailer = d.trailerYoutube
      ? '<a class="trailer-btn" href="https://www.youtube.com/watch?v=' + esc(d.trailerYoutube) +
        '" target="_blank" rel="noopener">' + icon('film') + '<span>Trailer</span></a>' : '';
    var watchOrder = (!isManga && ((d.relations && d.relations.length) || d.nextAiring))
      ? '<button class="trailer-btn wo-btn" data-watch-order>' + icon('list') +
        '<span>Watch Order</span></button>' : '';
    var coming = d.startTs && d.startTs > Date.now()
      ? '<div class="detail-coming"><span class="coming-label">COMING SOON</span>' +
        cdBoxesHtml(d.startTs, true) + '</div>' : '';
    var backHref = '#/' + SEC_ID + (isManga ? '/manga' : '/discover');
    var seasons = (d.seasons || []).length
      ? '<section class="online-block"><h2>' + (isManga ? 'Series' : 'Seasons') + '</h2><div class="season-row">' +
        d.seasons.map(function (s) {
          var href = s.id && s.image !== undefined && String(s.id) !== String(d.id)
            ? '#/' + SEC_ID + '/online/' + d.provider + '/' + (isManga ? 'manga/' : '') +
              encodeURIComponent(s.id) : null;
          var cnt = isManga ? (s.chapters ? s.chapters + ' ch' : '') : (s.episodes ? s.episodes + ' eps' : '');
          var inner = '<span class="thumb"><img src="' + esc(s.image || d.image) + '" alt="" loading="lazy"></span>' +
            '<b>' + esc(s.title) + '</b><small>' + esc([s.kind, s.year || '', cnt]
              .filter(Boolean).join(' · ')) + '</small>';
          return href ? '<a class="season-card" href="' + href + '">' + inner + '</a>'
                      : '<div class="season-card">' + inner + '</div>';
        }).join('') + '</div></section>' : '';
    var cast = (d.characters || []).length
      ? '<section class="online-block"><h2>Cast &amp; Characters</h2><div class="cast-grid">' +
        d.characters.map(function (c) { return castCard(c, d.provider); }).join('') + '</div></section>' : '';
    var rel = (d.relations || []).length
      ? '<section class="online-block"><h2>Related</h2><div class="poster-grid online-grid">' +
        d.relations.map(function (r) {
          var rManga = r.format === 'MANGA';
          return '<a class="poster-card" href="#/' + SEC_ID + '/online/' + d.provider + '/' +
            (rManga ? 'manga/' : '') + encodeURIComponent(r.id) + '"><span class="poster-img"><img src="' +
            esc(r.image) + '" alt="' + esc(r.title) + '" loading="lazy">' + posterScore(r) +
            '</span><span class="poster-title">' +
            esc(r.title) + '</span><span class="poster-meta">' + esc(r.kind || '') + '</span></a>';
        }).join('') + '</div></section>' : '';
    var studios = (d.studios || []).length ? '<p class="detail-studios">' + esc(d.studios.join(' · ')) + '</p>' : '';
    return '<div class="online-detail" data-tone-root>' +
      (d.banner ? '<div class="detail-banner"><img src="' + esc(d.banner) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="online-wrap"><a class="back-link" href="' + backHref + '">' +
        icon('arrowLeft') + '<span>' + (isManga ? 'Manga' : 'Discover') + '</span></a>' + air +
        '<header class="detail-hero"><span class="poster-img big"><img src="' + esc(d.image) +
          '" alt="' + esc(d.title) + ' poster"></span>' +
        '<div class="detail-copy"><p class="detail-kicker">' + esc(providerName()) + '</p>' +
          '<h1>' + esc(d.title) + '</h1><p class="detail-meta">' + esc(meta) +
            (ratingBtn ? ' · ' + ratingBtn : '') + '</p>' +
          studios +
          '<div class="genre-tags">' + (d.genres || []).map(function (g) {
            return '<span class="genre-tag">' + esc(g) + '</span>';
          }).join('') + '</div>' + (trailer || watchOrder
            ? '<div class="detail-actions">' + trailer + watchOrder + '</div>' : '') +
          coming + '</div></header>' +
        '<section class="online-block"><h2>Synopsis</h2><p class="synopsis">' +
          esc(d.synopsis || 'No synopsis available.') + '</p></section>' +
        epListPlaceholder(d, isManga) +
        seasons + cast + rel + '</div></div>';
  }

  // Placeholder for the episode (anime) / chapter (manga) list; filled in
  // lazily after the detail renders. Movies (1 episode) get a single
  // episode-style row labelled "Movie" with the runtime, wired to the same
  // provider dialog as episode cards (stream.js queueCard picks up
  // .episode-card[data-ep-n] inside [data-ep-grid] automatically).
  // Long lists (e.g. 1100+ episodes) are a horizontal slide strip: swipe
  // sideways, more pages load as you near the right end.
  function epListPlaceholder(d, isManga) {
    if (!isManga && d.episodes === 1) return movieRowHtml(d);
    var kind = isManga ? 'ch' : 'ep';
    return '<section class="online-block" data-' + kind + '-block hidden>' +
      '<div class="ep-head-row"><h2 data-' + kind + '-head></h2>' +
      '<label class="ep-jump"><span>' + (isManga ? 'Ch' : 'Ep') + ' #</span>' +
      '<input type="number" min="1" inputmode="numeric" data-' + kind + '-jump placeholder="123"></label></div>' +
      '<div class="ep-strip" data-' + kind + '-grid></div></section>';
  }

  // Single static "episode" row for movies: poster thumb, "Movie" number
  // badge, title, and runtime — same card styling as episodes so the
  // stream wiring (badges + globe button) attaches unchanged.
  // Duration label: "45 min" under an hour, "1h 30m" / "2h" at/over 60.
  function fmtDur(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function movieRowHtml(d) {
    var mins = d.durationMin ? fmtDur(d.durationMin) : '';
    var label = String(d.format || '').toUpperCase() === 'MOVIE' ? 'Movie' : 'Episode';
    var key = (d.provider || 'anilist') + ':' + d.id + ':ep:1';
    return '<section class="online-block" data-ep-block data-ep-movie>' +
      '<div class="ep-head-row"><h2>' + label + '</h2></div>' +
      '<div class="ep-strip" data-ep-grid>' +
      '<article class="episode-card" data-ep-n="1">' +
      (d.image ? '<img src="' + esc(d.image) + '" alt="" loading="lazy">' :
        '<span class="episode-card-num">1</span>') +
      '<span class="episode-number">' + label + '</span>' +
      '<span class="episode-actions">' +
      '<button class="episode-action" data-ep-watched="' + esc(key) +
      '" aria-label="Mark ' + label.toLowerCase() + ' watched">' + icon('edit') + '</button>' +
      '</span>' +
      '<div class="episode-open"><h4>' + esc(d.title || label) + '</h4>' +
      (mins ? '<p>' + esc(mins) + '</p>' : '') + '</div>' +
      '</article></div></section>';
  }

  // ---- live countdowns: boxed DAYS / HRS / MIN / SEC ----
  var countTimer = null;
  function pad2(n) { return String(n).padStart(2, '0'); }
  function cdBoxesHtml(ts, mini) {
    return '<div class="cd-boxes' + (mini ? ' mini' : '') + '" data-cd-boxes="' + ts + '">' +
      ['DAYS', 'HRS', 'MIN', 'SEC'].map(function (l) {
        return '<div class="cd-box"><span data-cd="' + l + '">00</span><label>' + l + '</label></div>';
      }).join('') + '</div>';
  }
  function tickCountdowns() {
    var now = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('[data-cd-boxes]'), function (box) {
      var diff = parseInt(box.getAttribute('data-cd-boxes'), 10) - now;
      var v = { DAYS: '00', HRS: '00', MIN: '00', SEC: '00' };
      if (diff > 0) {
        var s = Math.floor(diff / 1000);
        v.DAYS = pad2(Math.floor(s / 86400));
        v.HRS = pad2(Math.floor(s % 86400 / 3600));
        v.MIN = pad2(Math.floor(s % 3600 / 60));
        v.SEC = pad2(s % 60);
      }
      Object.keys(v).forEach(function (k) {
        var el = box.querySelector('[data-cd="' + k + '"]');
        if (el && el.textContent !== v[k]) el.textContent = v[k];
      });
    });
  }
  function ensureCountdownTicker() {
    if (countTimer) { tickCountdowns(); return; }
    tickCountdowns();
    countTimer = setInterval(tickCountdowns, 1000);
  }

  // ---- episode / chapter cards (Konosuba-style, reusing .episode-card) ----
  var EP_WATCHED_KEY = 'mpv2_ep_watched_v1';
  function epWatched() {
    try { return JSON.parse(localStorage.getItem(EP_WATCHED_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function setEpWatched(key, on) {
    var w = epWatched();
    if (on) w[key] = 1; else delete w[key];
    try { localStorage.setItem(EP_WATCHED_KEY, JSON.stringify(w)); } catch (e) {}
  }

  function epCardHtml(provider, id, it, isCh, cover, hkey) {
    var key = provider + ':' + id + ':' + (isCh ? 'ch' : 'ep') + ':' + it.n;
    var manualWatched = !!epWatched()[key];
    // Per-episode watch progress: auto-complete when watched to the end,
    // progress bar when partially watched.
    var prog = null;
    if (!isCh && hkey) {
      try {
        var W = window.MPV2 && window.MPV2.Watch;
        var pm = W ? W.getEpProgress(hkey) : null;
        if (pm) prog = pm[it.n] || null;
      } catch (e) { prog = null; }
    }
    var done = manualWatched || !!(prog && prog.done);
    var pct = 0;
    if (!done && prog && prog.d > 0 && prog.p > 5) {
      pct = Math.max(2, Math.min(100, Math.round((prog.p / prog.d) * 100)));
    }
    var num = isCh ? 'Ch ' + it.n : String(it.n).padStart(2, '0');
    var soon = it.ts && it.ts > Date.now();
    var thumb = it.thumb || cover || '';
    var sub = [it.date, it.minutes ? fmtDur(it.minutes) : (it.pages ? it.pages + ' pages' : '')]
      .filter(Boolean).join(' · ');
    var foot = soon
      ? cdBoxesHtml(it.ts, true)
      : (sub ? '<p>' + esc(sub) + '</p>' : '');
    return '<article class="episode-card' + (done ? ' watched' : '') + '" data-' + (isCh ? 'ch' : 'ep') + '-n="' + it.n + '">' +
      (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy">' :
        '<span class="episode-card-num">' + esc(String(it.n)) + '</span>') +
      '<span class="episode-number">' + esc(num) + '</span>' +
      (soon ? '<span class="ep-soon">SOON</span>' : '') +
      (pct ? '<span class="ep-progress"><span style="width:' + pct + '%"></span></span>' : '') +
      '<span class="episode-actions">' +
        (it.url ? '<a class="episode-action online" href="' + esc(it.url) +
          '" target="_blank" rel="noopener" aria-label="Watch online">' + icon('globe') + '</a>' : '') +
        '<button class="episode-action" data-ep-watched="' + esc(key) +
          '" aria-label="Mark ' + (isCh ? 'chapter' : 'episode') + ' watched">' + icon('edit') + '</button>' +
      '</span>' +
      '<div class="episode-open"><h4>' + esc(it.title) + '</h4>' + foot + '</div></article>';
  }

  // stream.js is the last script tag; a fast (cached) detail response can
  // resolve before it has executed. Wait briefly rather than skip wiring.
  function whenStreamReady(fn) {
    if (window.MPV2 && window.MPV2.Stream) { fn(window.MPV2.Stream); return; }
    var tries = 0;
    var t = setInterval(function () {
      if ((window.MPV2 && window.MPV2.Stream) || ++tries > 100) {
        clearInterval(t);
        if (window.MPV2 && window.MPV2.Stream) fn(window.MPV2.Stream);
      }
    }, 100);
  }
  function mountEpList(mount, provider, id, d, isCh) {
    var kind = isCh ? 'ch' : 'ep';
    var block = mount.querySelector('[data-' + kind + '-block]');
    if (!block) return;
    // History key for per-episode progress — same scheme as the player
    // (stream.js): 'anilist:<id>' when known, else 't:<title>'.
    var hkey = null;
    if (!isCh && d) {
      var hprov = d.provider || provider;
      var haid = (hprov === 'anilist' && d.id) ? String(d.id) : null;
      hkey = haid ? 'anilist:' + haid
                  : 't:' + String(d.title || '').toLowerCase().trim();
    }
    block.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ep-watched]');
      if (!b) return;
      var card = b.closest('.episode-card');
      var on = !card.classList.contains('watched');
      card.classList.toggle('watched', on);
      setEpWatched(b.getAttribute('data-ep-watched'), on);
    });
    // Keep episode states fresh: when the player saves progress (mpv2:history),
    // update watched badges + progress bars in place so returning from the
    // player instantly shows the new state — no re-render, no lost scroll.
    function refreshEpStates() {
      if (isCh || !hkey) return;
      var W = window.MPV2 && window.MPV2.Watch;
      var pm = null;
      try { pm = W ? W.getEpProgress(hkey) : null; } catch (e) { pm = null; }
      var w = epWatched();
      strip.querySelectorAll('.episode-card[data-ep-n]').forEach(function (card) {
        var n = parseInt(card.getAttribute('data-ep-n'), 10);
        if (!(n > 0)) return;
        var btn = card.querySelector('[data-ep-watched]');
        var key = btn ? btn.getAttribute('data-ep-watched') : null;
        var prog = pm ? pm[n] : null;
        var done = (key && !!w[key]) || !!(prog && prog.done);
        card.classList.toggle('watched', done);
        var pct = 0;
        if (!done && prog && prog.d > 0 && prog.p > 5) {
          pct = Math.max(2, Math.min(100, Math.round((prog.p / prog.d) * 100)));
        }
        var bar = card.querySelector('.ep-progress');
        if (pct > 0) {
          if (!bar) {
            bar = document.createElement('span');
            bar.className = 'ep-progress';
            bar.innerHTML = '<span></span>';
            card.appendChild(bar);
          }
          bar.firstChild.style.width = pct + '%';
        } else if (bar) {
          bar.remove();
        }
      });
    }
    function onHistory() {
      if (!document.contains(block)) {
        document.removeEventListener('mpv2:history', onHistory);
        return;
      }
      refreshEpStates();
    }
    document.addEventListener('mpv2:history', onHistory);
    // Movie block: single static row, already in the HTML — no pagination.
    if (block.hasAttribute('data-ep-movie')) { block.hidden = false; return; }
    var strip = block.querySelector('[data-' + kind + '-grid]');
    var head = block.querySelector('[data-' + kind + '-head]');
    var jumpInput = block.querySelector('[data-' + kind + '-jump]');
    var page = 1, total = isCh ? (d.chapters || null) : (d.episodes || null);
    var hasMore = false, loading = false, jumping = null, jumpingSilent = false;
    var didCenter = false;
    function setHead() {
      head.textContent = (isCh ? 'Chapters' : 'Episodes') +
        (total ? ' · ' + total + ' listed' : '');
      if (jumpInput && total) jumpInput.max = total;
    }
    // Jump to episode/chapter number: auto-loads pages until the card
    // exists, then scrolls it into the center of the strip with a flash.
    function flash(card) {
      centerCard(card);
      card.classList.remove('ep-flash');
      void card.offsetWidth;
      card.classList.add('ep-flash');
    }
    function centerCard(card) {
      try { card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }
      catch (e) {}
    }
    function jumpTo(n, silent) {
      var card = strip.querySelector('[data-' + kind + '-n="' + n + '"]');
      if (card) {
        jumping = null; jumpingSilent = false;
        if (silent) centerCard(card); else flash(card);
        return;
      }
      if (!hasMore) {
        jumping = null; jumpingSilent = false;
        if (!silent && jumpInput) {
          jumpInput.classList.add('miss');
          setTimeout(function () { jumpInput.classList.remove('miss'); }, 900);
        }
        return;
      }
      jumping = n; jumpingSilent = !!silent;
      if (!loading) { page++; load(); }
    }
    // The episode to center when the list first opens: the partially-watched
    // one (resume point), else the next episode after the last completed one.
    function currentEp() {
      if (isCh || !hkey) return null;
      try {
        var W = window.MPV2 && window.MPV2.Watch;
        var pm = W ? W.getEpProgress(hkey) : null;
        if (!pm) return null;
        var resume = null, maxDone = 0;
        Object.keys(pm).forEach(function (k) {
          var n = parseInt(k, 10), r = pm[k];
          if (!(n > 0) || !r) return;
          if (r.done) { if (n > maxDone) maxDone = n; }
          else if (r.p > 5 && (resume == null || n < resume)) resume = n;
        });
        if (resume != null) return resume;
        if (maxDone > 0) return maxDone + 1;
      } catch (e) {}
      return null;
    }
    function maybeLoadMore() {
      // Strip shorter than the viewport: keep paging until it scrolls
      // horizontally or the list is exhausted.
      if (hasMore && !loading && strip.scrollWidth <= strip.clientWidth + 10) {
        page++; load();
      }
    }
    function load() {
      if (loading) return;
      loading = true;
      var p = isCh ? API().chapters(provider, id, d, page)
                   : API().episodes(provider, id, d, page);
      p.then(function (r) {
        loading = false;
        if (!r.items.length && page === 1) { block.remove(); return; }
        block.hidden = false;
        // The API page total (Jikan pagination / Kitsu meta) fills in when
        // the detail itself reports no total (e.g. ongoing series) — the
        // heading always shows "Episodes · N" when a total is known.
        if (!total && r.total) total = r.total;
        setHead();
        strip.insertAdjacentHTML('beforeend', r.items.map(function (it) {
          return epCardHtml(provider, id, it, isCh, d.image, hkey);
        }).join(''));
        hasMore = !!r.hasMore;
        maybeLoadMore();
        if (jumping != null) jumpTo(jumping, jumpingSilent);
        // First paint: center the current episode (resume / next-up) so it's
        // right under the thumb when the page is reopened.
        if (!didCenter) {
          didCenter = true;
          var ce = currentEp();
          if (ce && ce > 1 && (!total || ce <= total)) jumpTo(ce, true);
        }
      }).catch(function () { loading = false; if (page === 1) block.remove(); });
    }
    if (jumpInput) {
      jumpInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var n = parseInt(jumpInput.value, 10);
        if (n > 0) jumpTo(n);
      });
    }
    strip.addEventListener('scroll', function () {
      if (!hasMore || loading) return;
      if (strip.scrollLeft + strip.clientWidth > strip.scrollWidth - 600) {
        page++; load();
      }
    });
    load();
  }

  // ---- Watch Order popup ----
  // Chronological watch order for a title: the series itself plus its
  // relations (sequels, prequels, movies, OVAs, side stories…). Upcoming
  // entries get countdown timers; an ongoing title shows its next episode
  // with a live countdown.
  function woEntryMeta(e) {
    return [formatLabel({ format: e.format }), e.year || '', e.kind]
      .filter(Boolean).join(' · ');
  }

  function openWatchOrder(provider, d) {
    closeWatchOrder();
    var now = Date.now();
    var entries = [{
      id: null, title: d.title, image: d.image, format: d.format,
      kind: 'This title', year: d.year, startTs: d.startTs,
      status: null, self: true
    }].concat((d.relations || []).map(function (r) {
      return { id: r.id, title: r.title, image: r.image, format: r.format,
               kind: r.kind, year: r.year, startTs: r.startTs,
               status: r.status, self: false };
    }));
    entries.sort(function (a, b) {
      var at = a.startTs || (a.year ? Date.UTC(a.year, 0, 1) : Infinity);
      var bt = b.startTs || (b.year ? Date.UTC(b.year, 0, 1) : Infinity);
      return at - bt;
    });
    var next = '';
    if (d.nextAiring && d.nextAiring.airingAt) {
      next = '<div class="wo-next"><span class="na-pill"><span class="na-dot"></span>' +
        'NEXT EPISODE ' + esc(String(d.nextAiring.episode || '?')) + '</span>' +
        cdBoxesHtml(d.nextAiring.airingAt, true) + '</div>';
    } else if (d.nextAiring && d.nextAiring.text) {
      next = '<div class="wo-next"><span class="na-pill"><span class="na-dot"></span>ONGOING</span>' +
        '<span class="wo-next-text">' + esc(d.nextAiring.text) + '</span></div>';
    }
    var rows = entries.map(function (e, i) {
      var upcoming = e.status === 'NOT_YET_RELEASED' ||
        (!e.self && e.startTs && e.startTs > now);
      var side = e.self
        ? '<span class="wo-pill self">THIS TITLE</span>'
        : upcoming
          ? '<span class="wo-pill up">UPCOMING</span>' +
            (e.startTs && e.startTs > now ? cdBoxesHtml(e.startTs, true) : '')
          : '<span class="wo-num">' + (i + 1) + '</span>';
      var inner = '<span class="wo-thumb">' +
          (e.image ? '<img src="' + esc(e.image) + '" alt="" loading="lazy">' : '') + '</span>' +
        '<span class="wo-copy"><b>' + esc(e.title) + '</b>' +
          '<small>' + esc(woEntryMeta(e)) + '</small></span>' + side;
      return e.self || e.id == null
        ? '<div class="wo-row is-self">' + inner + '</div>'
        : '<a class="wo-row" href="#/' + SEC_ID + '/online/' + provider + '/' +
          encodeURIComponent(e.id) + '">' + inner + '</a>';
    }).join('');
    var ov = document.createElement('div');
    ov.className = 'wo-overlay';
    ov.setAttribute('data-wo-overlay', '');
    ov.innerHTML = '<div class="wo-modal" role="dialog" aria-modal="true" aria-label="Watch order">' +
      '<div class="wo-head"><h2>Watch Order</h2>' +
      '<button class="wo-close" data-wo-close aria-label="Close">' + icon('x') + '</button></div>' +
      next + '<div class="wo-list">' + rows + '</div></div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    ov.addEventListener('click', function (ev) {
      // Backdrop / X closes; tapping a title row navigates AND closes.
      if (ev.target === ov || ev.target.closest('[data-wo-close]') ||
          ev.target.closest('a.wo-row')) closeWatchOrder();
    });
    ensureCountdownTicker();
  }

  function closeWatchOrder() {
    var ov = document.querySelector('[data-wo-overlay]');
    if (ov) ov.remove();
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeWatchOrder();
  });

  function prettyStatus(s, isManga) {
    if (!s) return '';
    var m = { RELEASING: isManga ? 'Currently Publishing' : 'Currently Airing',
              FINISHED: 'Finished', NOT_YET_RELEASED: 'Upcoming',
              CANCELLED: 'Cancelled', CURRENT: 'Currently Airing', HIATUS: 'On Hiatus' };
    return m[s] || s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
  }

  // Chameleon accent: sample the poster's dominant tone and tint the detail UI.
  function tintFromPoster(root, src) {
    if (!src) return;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = c.height = 24;
        var x = c.getContext('2d');
        x.drawImage(img, 0, 0, 24, 24);
        var px = x.getImageData(0, 0, 24, 24).data;
        var r = 0, g = 0, b = 0, n = 0;
        for (var i = 0; i < px.length; i += 16) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        var el = root.querySelector('[data-tone-root]');
        if (el) el.style.setProperty('--tone', 'rgb(' + r + ',' + g + ',' + b + ')');
      } catch (e) { /* tainted canvas — keep section accent */ }
    };
    img.onerror = function () {};
    img.src = src;
  }

  /* ------------------------- character detail --------------------------- */

  function charFacts(c) {
    var facts = [
      c.age != null ? c.age + ' yrs' : '',
      c.birthday || '',
      c.gender ? c.gender.charAt(0) + c.gender.slice(1).toLowerCase() : '',
      c.bloodType ? 'Blood type ' + c.bloodType : '',
      c.favourites ? '★ ' + Number(c.favourites).toLocaleString('en-US') + ' favourites' : ''
    ].filter(Boolean);
    return facts.length ? '<p class="detail-meta">' + esc(facts.join(' · ')) + '</p>' : '';
  }

  function charDescription(c) {
    var t = (c.description || '').trim();
    if (!t) return '<p class="synopsis dim">No description available.</p>';
    var html = esc(t)
      .replace(/___/g, '__') // collapse stray triple underscores
      // [text](url) markdown links -> real anchors (before bold, urls have no markup)
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/__([^_\n]+)__/g, '<b>$1</b>') // AniList markdown bold
      .replace(/~!([\s\S]+?)!~/g, '<span class="spoiler">$1</span>') // AniList spoiler
      .replace(/~([^~\n]*)~/g, '$1') // AniList strikethrough -> plain text
      .replace(/~/g, '') // drop leftover stray tildes
      .replace(/\n{2,}/g, '</p><p class="synopsis">').replace(/\n/g, '<br>');
    return '<p class="synopsis">' + html + '</p>';
  }

  function characterHtml(sec, provider, c) {
    var src = c._src || provider;
    var backupNote = (c._src && c._src !== provider) ? ' · via backup source' : '';
    var anime = (c.anime || []).length
      ? '<section class="online-block"><h2>Appears in</h2><div class="poster-grid online-grid">' +
        c.anime.map(function (a) {
          var href = a.id ? detailPath({ provider: src, id: a.id, mediaType: a.mediaType }) : null;
          var inner = '<span class="poster-img"><img src="' + esc(a.image) + '" alt="' + esc(a.title) +
            '" loading="lazy">' + posterScore(a) + '</span><span class="poster-title">' + esc(a.title) +
            '</span><span class="poster-meta">' + esc(a.role || '') + '</span>';
          return href ? '<a class="poster-card" href="' + href + '">' + inner + '</a>'
                      : '<div class="poster-card">' + inner + '</div>';
        }).join('') + '</div></section>' : '';
    var vas = (c.vas || []).length
      ? '<section class="online-block"><h2>Voice actors</h2><div class="cast-grid">' +
        c.vas.map(function (v) {
          return '<div class="cast-card"><img class="cast-card-photo" src="' + esc(v.image) +
            '" alt="' + esc(v.name) + '" loading="lazy">' +
            '<div class="cast-card-copy"><strong>' + esc(v.name) + '</strong>' +
            '<span>Japanese</span></div></div>';
        }).join('') + '</div></section>' : '';
    return '<div class="online-detail" data-tone-root><div class="online-wrap">' +
      '<button class="back-link as-button" data-go-back>' + icon('arrowLeft') + '<span>Back</span></button>' +
      '<header class="detail-hero"><span class="poster-img big"><img src="' + esc(c.image) +
        '" alt="' + esc(c.name) + '"></span>' +
        '<div class="detail-copy"><p class="detail-kicker">' + esc(providerName()) + esc(backupNote) + '</p>' +
        '<h1>' + esc(c.name) + '</h1>' +
        (c.native ? '<p class="detail-meta dim">' + esc(c.native) + '</p>' : '') +
        charFacts(c) + '</div></header>' +
      '<section class="online-block"><h2>About</h2>' + charDescription(c) + '</section>' +
      anime + vas + '</div></div>';
  }

  window.MPV2.renderOnlineCharacter = function (sectionId, provider, charId, charName) {
    var sec = window.MPV2.SECTIONS[sectionId] || window.MPV2.SECTIONS[SEC_ID];
    var mount = document.querySelector('#view') || document.querySelector('#app');
    document.title = 'Loading… · ' + sec.name + ' · Media Player V2';
    mount.innerHTML = pageHead(sec, 'Character', 'Fetching character details…') +
      '<div class="online-wrap">' + skeletonCards(3) + '</div>';
    window.scrollTo(0, 0);
    // Mobile networks blip: retry a couple of times before giving up.
    // The API layer itself falls back to the backup source on failure.
    var attempt = 0;
    function load() {
      attempt++;
      API().characterDetail(provider, charId, charName).then(function (c) {
        document.title = c.name + ' · ' + sec.name + ' · Media Player V2';
        mount.innerHTML = characterHtml(sec, provider, c);
        tintFromPoster(mount, c.image);
        window.scrollTo(0, 0);
      }).catch(function (err) {
        if (attempt < 3) { setTimeout(load, attempt * 1200); return; }
        mount.innerHTML = pageHead(sec, 'Character', 'Something went wrong.') +
          '<div class="online-wrap">' + errorHtml(err, true) + '</div>';
        mount.addEventListener('click', function (e) {
          if (e.target.closest('[data-retry]')) window.MPV2.renderOnlineCharacter(sectionId, provider, charId, charName);
        });
      });
    }
    load();
  };

  /* ----------------------------- register ------------------------------- */

  // Old `#/animation/discover` links now fall back to the home tab in
  // parseHash (it is no longer a registered tab), so no redirect is needed —
  // they land on the home page with the Discover block.

  // One-time delegation: rating popup, character popups, character-page back.
  // (Attached to document so it survives innerHTML re-renders of #view.)
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-reviews]')) {
      if (lastDetail) openReviewsPopup(lastDetail);
      return;
    }
    var card = e.target.closest('.online-cast[data-char-id]');
    if (card) {
      // Character info opens in a popup, not a full page. Details are
      // prefetched when the title page loads, so this opens instantly.
      openCharacterPopup(card.getAttribute('data-char-provider') || lastDetailProvider,
        card.getAttribute('data-char-id'), card.getAttribute('data-char-name') || '');
      return;
    }
    if (e.target.closest('[data-go-back]')) {
      if (window.history.length > 1) window.history.back();
      else location.hash = '#/' + SEC_ID;
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList &&
        e.target.classList.contains('online-cast') && e.target.hasAttribute('data-char-id')) {
      e.preventDefault();
      e.target.click();
    }
  });

  // The app boots (and renders the boot hash) before this module loads. If it
  // booted directly onto a Discover/online-detail route, or onto the Animation
  // home page (which now embeds the Discover block), render again now that
  // the pages and the detail renderer exist.
  (function () {
    var h = location.hash || '';
    if (h.indexOf('#/' + SEC_ID + '/discover') === 0 ||
        h === '#/' + SEC_ID || h === '#/' + SEC_ID + '/' || h === '#/' + SEC_ID + '/home' ||
        h === '#/' + SEC_ID + '/manga' || h === '#/' + SEC_ID + '/anime' || h === '#/' + SEC_ID + '/settings' ||
        (h.indexOf('#/' + SEC_ID + '/online/') === 0 && window.MPV2.renderOnlineDetail)) {
      window.MPV2.render();
    }
  })();
})();
