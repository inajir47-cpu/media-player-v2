/* MPV2 manga source/provider layer (chunk 2).
 *
 * Sits between the manga UI (detail page, chapter cards) and the reader
 * module (js/manga-reader.js):
 *   · provider registry — MangaDex today, more sources later without
 *     touching the UI or the reader;
 *   · "Choose Source" dialog (same visual language as the anime
 *     Choose Provider dialog: .st-scrim / .st-dialog);
 *   · chapter-card tap -> resolve chapter + neighbours -> openReader.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function icon(n, c) { return window.MPV2.icon(n, c); }
  function toast(msg) {
    if (window.MPV2 && typeof window.MPV2.toast === 'function') window.MPV2.toast(msg);
  }
  function MR() { return (window.MPV2 && window.MPV2.MangaReader) || null; }
  function lock(on) {
    try {
      if (on && window.MPV2.lockBodyScroll) window.MPV2.lockBodyScroll();
      else if (!on && window.MPV2.unlockBodyScroll) window.MPV2.unlockBodyScroll();
    } catch (e) {}
  }

  /* ---------- provider registry ---------- */
  var PROVIDERS = [
    { id: 'mangadex', name: 'MangaDex',
      desc: 'English & Japanese chapters · MangaDex',
      langs: ['English', 'Japanese'] }
  ];
  var PROV_KEY = 'mpv2_manga_provider_v1';
  function getProvider() {
    var id = null;
    try { id = localStorage.getItem(PROV_KEY); } catch (e) {}
    for (var i = 0; i < PROVIDERS.length; i++) {
      if (PROVIDERS[i].id === id) return PROVIDERS[i];
    }
    return PROVIDERS[0];
  }
  function setProvider(id) {
    try { localStorage.setItem(PROV_KEY, id); } catch (e) {}
  }
  function langCode(label) { return label === 'Japanese' ? 'ja' : 'en'; }

  /* ---------- MangaDex UUID resolution ---------- */
  function resolveUuid(ctx) {
    var A = window.MPV2 && window.MPV2.AnimeAPI;
    if (!A || typeof A.mdMangaUuid !== 'function') return Promise.resolve(null);
    try { return A.mdMangaUuid(ctx.malId || null, ctx.title || ''); }
    catch (e) { return Promise.resolve(null); }
  }

  /* ---------- chapter feed helpers ---------- */
  function chNum(c) { return parseFloat(c && c.ch); }
  function feedSorted(uuid, lang) {
    return MR().chapterFeed(uuid, lang).then(function (feed) {
      return (feed || [])
        .filter(function (c) { return isFinite(chNum(c)); })
        .sort(function (a, b) { return chNum(a) - chNum(b); });
    });
  }
  /* Per-chapter language availability for the chapter-card badges: which
   * chapter numbers exist in the EN / JA MangaDex feeds. In-memory cached
   * per uuid for the session. */
  var langAvailCache = {};
  function langAvailability(uuid) {
    if (langAvailCache[uuid]) return Promise.resolve(langAvailCache[uuid]);
    return Promise.all([feedSorted(uuid, 'en'), feedSorted(uuid, 'ja')]).then(function (feeds) {
      function numSet(sorted) {
        var s = {};
        (sorted || []).forEach(function (c) { s[String(c.ch)] = 1; });
        return s;
      }
      var out = { en: numSet(feeds[0]), ja: numSet(feeds[1]) };
      langAvailCache[uuid] = out;
      return out;
    });
  }
  function langAvailabilityFor(ctx) {
    return resolveUuid(ctx).then(function (uuid) {
      if (!uuid) return { en: {}, ja: {} };
      return langAvailability(uuid);
    });
  }
  function idxOf(sorted, entry) {
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].id === entry.id) return i;
    }
    return -1;
  }
  function idxOfNum(sorted, chNumStr) {
    for (var i = 0; i < sorted.length; i++) {
      if (String(sorted[i].ch) === String(chNumStr)) return i;
    }
    return -1;
  }
  function siblingsAround(sorted, idx) {
    var out = [];
    if (idx > 0) out.push(sorted[idx - 1]);
    out.push(sorted[idx]);
    if (idx < sorted.length - 1) out.push(sorted[idx + 1]);
    return out;
  }
  /* Open the reader for one chapter entry, feeding prev/next from the feed. */
  function openEntry(uuid, title, entry, lang, presorted) {
    function go(sorted) {
      var idx = idxOf(sorted, entry);
      if (idx < 0) idx = idxOfNum(sorted, entry.ch);
      if (idx < 0) { toast('Chapter not available in ' + (lang === 'ja' ? 'Japanese' : 'English')); return; }
      MR().openReader({
        ctx: { title: title }, uuid: uuid,
        chapter: sorted[idx], lang: lang,
        siblings: siblingsAround(sorted, idx)
      });
    }
    if (presorted) { try { go(presorted); } catch (e) {} return Promise.resolve(); }
    return feedSorted(uuid, lang).then(go);
  }
  /* Entry point for "Start Reading": resume the in-progress chapter when
   * there is one, otherwise the first chapter. */
  function entryChapter(uuid, lang) {
    var lr = null;
    try { lr = MR().lastRead(uuid); } catch (e) {}
    if (lr && !lr.done && lr.ch != null) {
      return MR().findChapter(uuid, lr.ch, lang).then(function (e) {
        return e || firstChapter(uuid, lang);
      });
    }
    return firstChapter(uuid, lang);
  }
  function firstChapter(uuid, lang) {
    return feedSorted(uuid, lang).then(function (sorted) {
      return sorted.length ? sorted[0] : null;
    });
  }

  /* ---------- Choose Source dialog ---------- */
  var dlg = null;
  function closeDialog() {
    if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
    dlg = null;
    lock(false);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape' && dlg) { e.stopPropagation(); closeDialog(); }
  }
  function openSourceDialog(ctx) {
    var m = MR();
    if (!m) { toast('Reader not ready'); return; }
    closeDialog();
    var provs = PROVIDERS.slice();
    var selProv = getProvider();
    if (provs.indexOf(selProv) < 0) selProv = provs[0];
    var selLang = 'English';

    var scrim = document.createElement('div');
    scrim.className = 'st-scrim';
    scrim.innerHTML =
      '<div class="st-dialog" role="dialog" aria-modal="true" aria-label="Choose source">' +
        '<button class="st-x" type="button" aria-label="Close">' + icon('x') + '</button>' +
        '<h3>Choose Source</h3>' +
        '<p class="st-sub">Select where to read ' + esc(ctx.title || 'this manga') + '</p>' +
        '<div class="st-provs"></div>' +
        '<div class="st-langwrap"><div class="st-langlabel">Language</div><div class="st-langs"></div></div>' +
        '<button class="st-start" type="button">Start Reading</button>' +
      '</div>';
    document.body.appendChild(scrim);
    dlg = scrim;
    lock(true);
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeDialog(); });
    scrim.querySelector('.st-x').addEventListener('click', closeDialog);

    var provBox = scrim.querySelector('.st-provs');
    var langBox = scrim.querySelector('.st-langs');
    var startBtn = scrim.querySelector('.st-start');

    function provButton(p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-prov' + (p === selProv ? ' sel' : '');
      b.innerHTML =
        '<span class="st-prov-ic">' + icon('globe') + '</span>' +
        '<span class="st-prov-tx"><b>' + esc(p.name) + '</b><i>' + esc(p.desc) + '</i></span>' +
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
      var langs = (selProv && selProv.langs) || ['English'];
      if (langs.indexOf(selLang) < 0) selLang = langs[0];
      langBox.innerHTML = langs.map(function (l) {
        return '<button type="button" class="st-lang' + (l === selLang ? ' sel' : '') +
          '" data-lang="' + esc(l) + '">' + esc(l) + '</button>';
      }).join('');
    }
    provs.forEach(function (p) { provBox.appendChild(provButton(p)); });
    renderLangs();
    langBox.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-lang]') : null;
      if (!t) return;
      selLang = t.getAttribute('data-lang');
      Array.prototype.forEach.call(langBox.children, function (c) {
        c.classList.toggle('sel', c === t);
      });
    });

    startBtn.addEventListener('click', function () {
      startBtn.disabled = true;
      startBtn.textContent = 'Loading…';
      setProvider(selProv.id);
      var lang = langCode(selLang);
      resolveUuid(ctx).then(function (uuid) {
        if (!uuid) { toast('Could not find this manga on ' + selProv.name); return null; }
        return entryChapter(uuid, lang).then(function (entry) {
          if (!entry) { toast('No chapters found in ' + selLang); return; }
          closeDialog();
          return openEntry(uuid, ctx.title, entry, lang);
        });
      }).catch(function () {
        toast('Could not load chapters');
      }).then(function () {
        if (dlg) { startBtn.disabled = false; startBtn.textContent = 'Start Reading'; }
      });
    });
  }

  /* ---------- chapter-card tap ---------- */
  function openChapter(ctx, chNumStr, cardEl) {
    var m = MR();
    if (!m) { toast('Reader not ready'); return; }
    if (cardEl) cardEl.classList.add('ch-loading');
    var lang = langCode(getProvider().langs[0] || 'English');
    resolveUuid(ctx).then(function (uuid) {
      if (!uuid) { toast('Could not find this manga on ' + getProvider().name); return; }
      return feedSorted(uuid, lang).then(function (sorted) {
        var idx = idxOfNum(sorted, chNumStr);
        if (idx < 0) { toast('Chapter ' + chNumStr + ' is not available in ' + (lang === 'ja' ? 'Japanese' : 'English')); return; }
        return openEntry(uuid, ctx.title, sorted[idx], lang, sorted);
      });
    }).catch(function () {
      toast('Could not load chapter');
    }).then(function () {
      if (cardEl) cardEl.classList.remove('ch-loading');
    });
  }

  window.MPV2 = window.MPV2 || {};
  window.MPV2.MangaSource = {
    PROVIDERS: PROVIDERS,
    getProvider: getProvider,
    setProvider: setProvider,
    openSourceDialog: openSourceDialog,
    openChapter: openChapter,
    langAvailabilityFor: langAvailabilityFor,
    closeDialog: closeDialog
  };
})();
