/* Media Player V2 — Manga reader (MangaDex).
   Chunk 1: chapter feeds (EN/JA), at-home page URLs, vertical-scroll reader UI,
   EN/JA toggle, per-chapter reading progress.
   Chunk 2 (next): chapter-card tap wiring + chapter browser. */
(function () {
  'use strict';
  window.MPV2 = window.MPV2 || {};

  var MD = 'https://api.mangadex.org';
  var WORKER = 'https://mpv2-hls-proxy.gmpdi020.workers.dev';
  var LS_CHPROG = 'mpv2_ch_progress_v1';
  var CHPROG_CAP = 400;

  function esc(s) { return window.MPV2.esc(String(s == null ? '' : s)); }
  function icon(n, c) { return window.MPV2.icon(n, c); }
  function toast(m) { if (window.MPV2.toast) window.MPV2.toast(m); }

  function b64url(s) {
    var bytes = new TextEncoder().encode(s), bin = '', i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* MangaDex allows 5 req/s: serialize calls with a 300ms floor between them. */
  var lastReq = 0;
  function throttle(fn) {
    var now = Date.now();
    var wait = Math.max(0, 300 - (now - lastReq));
    lastReq = now + wait;
    return new Promise(function (res) { setTimeout(res, wait); }).then(fn);
  }

  /* MangaDex JSON: direct first (same as the shipped volume-cover code),
     worker proxy (?d=) fallback when CORS or the edge blocks the call. */
  function mdGet(path) {
    var url = MD + path;
    function direct() {
      return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
        if (!r.ok) throw new Error('md ' + r.status);
        return r.json();
      });
    }
    function viaWorker() {
      return fetch(WORKER + '/hls?d=' + b64url(url), { headers: { Accept: 'application/json' } }).then(function (r) {
        if (!r.ok) throw new Error('mdw ' + r.status);
        return r.json();
      });
    }
    return throttle(direct).catch(viaWorker);
  }

  /* ---------- UUID bridge (exposed by anime-api.js) ---------- */
  function mangaUuid(ctx) {
    ctx = ctx || {};
    var api = window.MPV2.AnimeAPI;
    if (!api || !api.mdMangaUuid) return Promise.resolve(null);
    return api.mdMangaUuid(ctx.malId || null, ctx.title).catch(function () { return null; });
  }

  /* ---------- chapter feed ---------- */
  function normCh(c) {
    var a = c.attributes || {};
    return {
      id: c.id,
      ch: a.chapter,
      title: a.title || '',
      volume: a.volume || null,
      pages: a.pages || 0,
      lang: a.translatedLanguage || '',
      publishedAt: a.readableAt || a.publishAt || ''
    };
  }
  function feedPage(uuid, lang, offset) {
    return mdGet('/manga/' + uuid + '/feed?limit=100&offset=' + offset +
      '&translatedLanguage[]=' + lang +
      '&contentRating[]=safe&contentRating[]=suggestive' +
      '&order[chapter]=asc&order[volume]=asc');
  }
  function chapterFeed(uuid, lang) {
    var out = [];
    function page(offset) {
      return feedPage(uuid, lang, offset).then(function (j) {
        (j.data || []).forEach(function (c) { out.push(normCh(c)); });
        var total = j.total || 0;
        if (offset + 100 < total && out.length < 3000) return page(offset + 100);
        return out;
      });
    }
    return page(0);
  }
  /* Single chapter lookup — one request, no full-feed download. */
  function findChapter(uuid, chNum, lang) {
    return mdGet('/manga/' + uuid + '/feed?limit=10&translatedLanguage[]=' + lang +
      '&contentRating[]=safe&contentRating[]=suggestive' +
      '&chapter[]=' + encodeURIComponent(String(chNum))).then(function (j) {
      var ds = j.data || [], i, n;
      for (i = 0; i < ds.length; i++) {
        n = normCh(ds[i]);
        if (String(n.ch) === String(chNum)) return n;
      }
      return null;
    });
  }

  /* ---------- at-home page URLs ---------- */
  var homeCache = {};
  function chapterPages(chapterId) {
    if (homeCache[chapterId]) return Promise.resolve(homeCache[chapterId]);
    return mdGet('/at-home/server/' + chapterId).then(function (j) {
      var ch = j.chapter || {}, base = j.baseUrl || '', hash = ch.hash || '';
      var urls = (ch.data || []).map(function (f) { return base + '/data/' + hash + '/' + f; });
      if (!urls.length) throw new Error('no pages');
      homeCache[chapterId] = urls;
      return urls;
    });
  }

  /* ---------- reading progress (mirrors mpv2_ep_progress_v1) ---------- */
  function chStore() {
    try { return JSON.parse(localStorage.getItem(LS_CHPROG) || '{}'); }
    catch (e) { return {}; }
  }
  function chSave(s) {
    try {
      var keys = Object.keys(s);
      if (keys.length > CHPROG_CAP) {
        keys.sort(function (a, b) { return (s[a].t || 0) - (s[b].t || 0); });
        keys.slice(0, keys.length - CHPROG_CAP).forEach(function (k) { delete s[k]; });
      }
      localStorage.setItem(LS_CHPROG, JSON.stringify(s));
      /* Mirror js/watch-history.js: let chapter lists refresh in place. */
      try { document.dispatchEvent(new CustomEvent('mpv2:history')); } catch (e2) {}
    } catch (e) {}
  }
  function chKey(uuid, chapterId) { return 'mdx:' + uuid + ':ch:' + chapterId; }
  function saveChProgress(uuid, chapterId, chNum, page, pages) {
    if (!uuid || !chapterId) return;
    var s = chStore();
    s[chKey(uuid, chapterId)] = {
      p: page, pages: pages, ch: chNum,
      done: pages > 0 && page >= pages - 1, t: Date.now()
    };
    chSave(s);
  }
  function getChProgress(uuid, chapterId) {
    if (!uuid || !chapterId) return null;
    return chStore()[chKey(uuid, chapterId)] || null;
  }
  /* Progress for every recorded chapter of one manga, keyed by chapter
   * number (String) -> {p, pages, done}. Lets the chapter list paint
   * progress bars / read states exactly like the episode tracker. */
  function progressByChapter(uuid) {
    var out = {}, s = chStore(), k, r, pfx = 'mdx:' + uuid + ':ch:';
    if (!uuid) return out;
    for (k in s) {
      if (s.hasOwnProperty(k) && k.indexOf(pfx) === 0) {
        r = s[k] || {};
        if (r.ch !== null && r.ch !== undefined && r.ch !== '') out[String(r.ch)] = r;
      }
    }
    return out;
  }
  /* Resume target for the detail-page button: { ch, partial }.
   * Partially-read chapter wins (partial:true -> "Continue Ch N");
   * otherwise the chapter after the last finished one (partial:false -> "Read Ch N").
   * ch is null when there is nothing to resume. */
  function resumeInfo(uuid) {
    var map = progressByChapter(uuid), k, r, n;
    var resume = null, maxDone = 0;
    for (k in map) {
      if (!map.hasOwnProperty(k)) continue;
      r = map[k]; n = parseFloat(k);
      if (!(n > 0) || !r) continue;
      if (r.done) { if (n > maxDone) maxDone = n; }
      else if (r.p > 0 && (resume == null || n < resume)) resume = n;
    }
    if (resume != null) return { ch: resume, partial: true };
    if (maxDone > 0) return { ch: maxDone + 1, partial: false };
    return { ch: null, partial: false };
  }
  /* Most recently touched chapter for a manga (continue-reading entry point). */
  function lastRead(uuid) {
    if (!uuid) return null;
    var s = chStore(), best = null, k;
    for (k in s) {
      if (s.hasOwnProperty(k) && k.indexOf('mdx:' + uuid + ':ch:') === 0) {
        if (!best || (s[k].t || 0) > (best.t || 0)) best = s[k];
      }
    }
    return best;
  }

  /* rAF with a setTimeout fallback (older webviews). */
  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }

  /* ---------- reader UI ---------- */
  var R = null; /* { uuid, ctx, chapter, lang, pages, page, el, pagesEl, ... } */

  function chLabel(ch) {
    return (ch === null || ch === undefined || ch === '') ? 'Oneshot' : 'Ch ' + ch;
  }
  function langName(l) { return l === 'ja' ? 'Japanese' : 'English'; }

  function buildShell() {
    var o = R.opts, ctx = o.ctx || {};
    var el = document.createElement('div');
    el.className = 'md-reader';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Manga reader');
    el.innerHTML =
      '<div class="md-rd-head">' +
        '<button type="button" class="md-rd-back" aria-label="Back">' + icon('arrowLeft') + '</button>' +
        '<div class="md-rd-meta"><div class="md-rd-title">' + esc(ctx.title || 'Manga') + '</div>' +
        '<div class="md-rd-ch"></div></div>' +
        '<div class="md-rd-lang" role="group" aria-label="Reading language">' +
          '<button type="button" data-lang="en">EN</button>' +
          '<button type="button" data-lang="ja">JA</button>' +
        '</div>' +
      '</div>' +
      '<div class="md-rd-pages"></div>' +
      '<div class="md-rd-foot">' +
        '<button type="button" class="md-rd-prev" aria-label="Previous chapter">' + icon('arrowLeft') + '<span>Prev</span></button>' +
        '<div class="md-rd-mid"><div class="md-rd-count">–</div><div class="md-rd-bar"><i></i></div></div>' +
        '<button type="button" class="md-rd-next" aria-label="Next chapter"><span>Next</span>' + icon('arrowRight') + '</button>' +
      '</div>';
    document.body.appendChild(el);

    R.el = el;
    R.pagesEl = el.querySelector('.md-rd-pages');
    R.chEl = el.querySelector('.md-rd-ch');
    R.countEl = el.querySelector('.md-rd-count');
    R.barEl = el.querySelector('.md-rd-bar i');
    R.prevBtn = el.querySelector('.md-rd-prev');
    R.nextBtn = el.querySelector('.md-rd-next');

    el.querySelector('.md-rd-back').addEventListener('click', function () { closeReader(); });
    var langBtns = el.querySelectorAll('.md-rd-lang button');
    Array.prototype.forEach.call(langBtns, function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });
    R.prevBtn.addEventListener('click', function () { step(-1); });
    R.nextBtn.addEventListener('click', function () { step(1); });

    var ticking = false;
    R.pagesEl.addEventListener('scroll', function () {
      if (!R || ticking) return;
      ticking = true;
      raf(function () {
        ticking = false;
        if (R) onScroll();
      });
    }, { passive: true });

    R.escHandler = function (e) { if (e.key === 'Escape') closeReader(); };
    document.addEventListener('keydown', R.escHandler);
    if (window.MPV2.lockBodyScroll) window.MPV2.lockBodyScroll();
    syncLangToggle();
    syncStepButtons();
  }

  function openReader(opts) {
    /* opts: { ctx, uuid, chapter:{id,ch,title,pages}, lang, siblings:[{id,ch}] } */
    if (!opts || !opts.uuid || !opts.chapter || !opts.chapter.id) {
      toast('Could not open this chapter.');
      return;
    }
    teardownReader(); /* drop any previous reader DOM/listeners */
    R = {
      opts: opts, uuid: opts.uuid, ctx: opts.ctx || {},
      chapter: opts.chapter, lang: opts.lang === 'ja' ? 'ja' : 'en',
      pages: [], page: 0, el: null
    };
    buildShell();
    loadChapter(opts.chapter, R.lang, true);
  }

  function loadChapter(ch, lang, restore) {
    if (!R) return;
    R.chapter = ch;
    R.lang = lang;
    R.pages = [];
    R.page = 0;
    R.pagesEl.innerHTML = '<div class="md-rd-loading"><span class="md-rd-spin"></span><span>Loading pages…</span></div>';
    R.pagesEl.scrollTop = 0;
    syncLangToggle();
    updateChrome();
    chapterPages(ch.id).then(function (urls) {
      if (!R || R.chapter.id !== ch.id) return;
      R.pages = urls;
      var html = '';
      for (var i = 0; i < urls.length; i++) {
        html += '<img class="md-rd-page" src="' + esc(urls[i]) + '" alt="Page ' + (i + 1) + '"' +
          (i > 2 ? ' loading="lazy"' : ' fetchpriority="' + (i === 0 ? 'high' : 'low') + '"') + ' draggable="false">';
      }
      R.pagesEl.innerHTML = html;
      var start = 0;
      if (restore) {
        var p = getChProgress(R.uuid, ch.id);
        if (p && !p.done && p.p > 0) start = Math.min(p.p, urls.length - 1);
      }
      R.page = start;
      raf(function () {
        if (!R) return;
        jumpToPage(start, true);
        updateChrome();
        saveProgress();
      });
    }).catch(function () {
      if (!R || R.chapter.id !== ch.id) return;
      R.pagesEl.innerHTML = '<div class="md-rd-error">' + icon('book') +
        '<p>Could not load these pages.</p>' +
        '<button type="button" class="md-rd-retry">Retry</button></div>';
      var rb = R.pagesEl.querySelector('.md-rd-retry');
      if (rb) rb.addEventListener('click', function () { loadChapter(ch, lang, false); });
    });
  }

  function jumpToPage(i, instant) {
    if (!R || !R.pagesEl.children.length) return;
    var kids = R.pagesEl.children, n = Math.max(0, Math.min(i, kids.length - 1));
    var top = kids[n].offsetTop - 8;
    if (instant) R.pagesEl.scrollTop = top;
    else R.pagesEl.scrollTo({ top: top, behavior: 'smooth' });
    R.page = n;
  }

  function pageFromScroll() {
    var kids = R.pagesEl.children, st = R.pagesEl.scrollTop, best = 0, i;
    for (i = 0; i < kids.length; i++) {
      if (kids[i].offsetTop <= st + 80) best = i; else break;
    }
    return Math.max(0, Math.min(best, kids.length - 1));
  }

  function onScroll() {
    if (!R || !R.pages.length) return;
    var p = pageFromScroll();
    if (p !== R.page) {
      R.page = p;
      updateChrome();
      saveProgress();
    }
  }

  function saveProgress() {
    if (!R || !R.pages.length) return;
    saveChProgress(R.uuid, R.chapter.id, R.chapter.ch, R.page, R.pages.length);
  }

  function updateChrome() {
    if (!R) return;
    var n = R.pages.length, p = Math.min(R.page + 1, Math.max(n, 1));
    R.chEl.textContent = chLabel(R.chapter.ch) +
      (R.chapter.title ? ' · ' + R.chapter.title : '') + ' · ' + langName(R.lang).slice(0, 2).toUpperCase();
    R.countEl.textContent = n ? (p + ' / ' + n) : '–';
    R.barEl.style.width = n ? ((p / n) * 100).toFixed(1) + '%' : '0%';
  }

  function syncLangToggle() {
    if (!R) return;
    var btns = R.el.querySelectorAll('.md-rd-lang button');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang') === R.lang);
    });
  }

  function setLang(lang) {
    if (!R || lang === R.lang) return;
    var chNum = R.chapter.ch;
    toast('Loading ' + langName(lang) + '…');
    findChapter(R.uuid, chNum, lang).then(function (ch) {
      if (!R) return;
      if (!ch) {
        toast(chLabel(chNum) + ' is not available in ' + langName(lang) + ' yet.');
        return;
      }
      loadChapter(ch, lang, true);
    }).catch(function () {
      toast('Could not switch language right now.');
    });
  }

  /* Prev/next across the caller's sibling list (chapter browser feeds it in chunk 2). */
  function syncStepButtons() {
    if (!R) return;
    var has = !!(R.opts.siblings && R.opts.siblings.length > 1);
    R.prevBtn.style.display = has ? '' : 'none';
    R.nextBtn.style.display = has ? '' : 'none';
  }
  function step(dir) {
    if (!R) return;
    var sibs = (R.opts.siblings || []).slice().sort(function (a, b) {
      return (parseFloat(a.ch) || 0) - (parseFloat(b.ch) || 0);
    });
    var idx = -1, i;
    for (i = 0; i < sibs.length; i++) {
      if (String(sibs[i].ch) === String(R.chapter.ch)) { idx = i; break; }
    }
    var next = sibs[idx + dir];
    if (next && next.id) {
      toast('Loading ' + chLabel(next.ch) + '…');
      findChapter(R.uuid, next.ch, R.lang).then(function (ch) {
        if (!R) return;
        loadChapter(ch || { id: next.id, ch: next.ch, title: '', pages: 0 }, R.lang, true);
      }).catch(function () { toast('Could not load that chapter.'); });
    } else {
      toast(dir < 0 ? 'This is the first chapter.' : 'This is the latest chapter.');
    }
  }

  function teardownReader() {
    if (R && R.escHandler) document.removeEventListener('keydown', R.escHandler);
    if (R && R.el && R.el.parentNode) R.el.parentNode.removeChild(R.el);
    R = null;
  }
  function closeReader(silent) {
    teardownReader();
    if (!silent && window.MPV2.unlockBodyScroll) window.MPV2.unlockBodyScroll();
  }

  window.MPV2.MangaReader = {
    openReader: openReader,
    closeReader: function () { closeReader(); },
    chapterFeed: chapterFeed,
    findChapter: findChapter,
    chapterPages: chapterPages,
    mangaUuid: mangaUuid,
    getChProgress: getChProgress,
    saveChProgress: saveChProgress,
    progressByChapter: progressByChapter,
    resumeInfo: resumeInfo,
    lastRead: lastRead
  };
})();
