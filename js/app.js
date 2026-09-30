/* ============================================================================
 * media-player-v2 — STEP 1: shell, router, landing, page skeletons
 * Later steps register real content renderers via MPV2.registerPage().
 * ========================================================================== */
(function () {
  'use strict';

  var SECTIONS = window.MPV2.SECTIONS;
  var TITLES = window.MPV2.PAGE_TITLES;
  var LS_SECTION = 'mpv2_section';
  var LS_SETTINGS = 'mpv2_settings_v1';
  var LS_THEME = 'mpv2_section_themes_v1';

  /* ---------------- STEP 3: independent section themes ----------------
   * Each section keeps its own accent color, persisted in localStorage.
   */
  var DEFAULT_THEME = { animation: '#b54aea', movies: '#ff6a1a' };
  var THEME_PRESETS = ['#b54aea', '#e50914', '#ff6a1a', '#f5b50a',
                       '#22c55e', '#14b8a6', '#2f7bff', '#ec4899'];

  function getSectionThemes() {
    var t = {};
    try { t = JSON.parse(localStorage.getItem(LS_THEME) || '{}'); } catch (e) {}
    return {
      animation: t.animation || DEFAULT_THEME.animation,
      movies: t.movies || DEFAULT_THEME.movies
    };
  }
  function applySectionThemes() {
    var t = getSectionThemes();
    var root = document.documentElement.style;
    root.setProperty('--anime', t.animation);
    root.setProperty('--movie', t.movies);
  }
  function setSectionTheme(sectionId, color) {
    var t = getSectionThemes();
    t[sectionId] = color;
    try { localStorage.setItem(LS_THEME, JSON.stringify(t)); } catch (e) {}
    applySectionThemes();
  }

  /* Master settings (landing page button): one accent for both sections. */
  function setMasterTheme(color) {
    var t = getSectionThemes();
    t.animation = color;
    t.movies = color;
    try { localStorage.setItem(LS_THEME, JSON.stringify(t)); } catch (e) {}
    applySectionThemes();
  }

  /* ---------------- STEP 4: day / dark mode ----------------
   * Dark = pitch-black OLED (default). Light = clean high-contrast day.
   * Choice is persisted; section accents + poster chameleon work in both.
   */
  var LS_MODE = 'mpv2_theme_mode_v1';
  function getThemeMode() {
    try { return localStorage.getItem(LS_MODE) === 'light' ? 'light' : 'dark'; }
    catch (e) { return 'dark'; }
  }
  function applyThemeMode(m) {
    document.documentElement.setAttribute('data-theme', m);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m === 'light' ? '#f3f2ef' : '#000000');
  }
  function setThemeMode(m) {
    try { localStorage.setItem(LS_MODE, m); } catch (e) {}
    applyThemeMode(m);
  }

  /* ---------------- icons (inline SVG, stroke style) ---------------- */
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.05a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
    folder: '<path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/>',
    edit: '<path d="M17 3l4 4L8 20l-5 1 1-5z"/>',
    clapper: '<path d="M3 8h18v12H3z"/><path d="M3 8l2-5 16 3-1.5 4z"/><path d="M8 3.5 10 8M13 4.5l2 4.5M18 5.5l2 4"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5v7M14.5 8.5v7"/>',
    minimize: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M15 19l-3 3-3-3"/>',
    maximize: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 1l3 3 3-3"/>',
    rewind: '<path d="M11 8.5v7l-5-3.5z"/><path d="M18 8.5v7l-5-3.5z"/>',
    forward: '<path d="M13 8.5v7l5-3.5z"/><path d="M6 8.5v7l5-3.5z"/>',
    volume: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    bookmark: '<path d="M6 3h12v18l-6-4.2L6 21z"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 3v5h-5"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6.5 7l1 14h9l1-14"/>',
    animeface: '<path d="M6.6 9.2C6.6 5.8 9 3.6 12 3.6c3 0 5.4 2.2 5.4 5.6"/>' +
      '<path d="M6.9 7.2h10.2"/>' +
      '<ellipse cx="12" cy="9.6" rx="8.4" ry="2"/>' +
      '<path d="M8.4 11.4c0 4.4 1.7 8 3.6 8s3.6-3.6 3.6-8"/>' +
      '<path d="M8.4 12.8 6.6 15M8.9 14.4l-1.2 2.2M15.6 12.8l1.8 2.2M15.1 14.4l1.2 2.2"/>' +
      '<circle cx="10.1" cy="14.3" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="13.9" cy="14.3" r="1.1" fill="currentColor" stroke="none"/>' +
      '<path d="M9.2 16.3h5.6c0 2-1.3 3.1-2.8 3.1s-2.8-1.1-2.8-3.1z"/>' +
      '<path d="M9.2 17.3h5.6"/>',
    spidey: '<circle cx="9" cy="6.2" r="2.6"/>' +
      '<path d="M6.7 4.6c1.5 1 3.1 1.5 4.7 1.4M7.3 8c1.3-.5 2.7-.6 4-.3"/>' +
      '<path d="M7.2 5.8 9 4.4l.6 3z" fill="currentColor" stroke="none"/>' +
      '<path d="M10.4 4.4l1.6 1-1.3 1.9z" fill="currentColor" stroke="none"/>' +
      '<path d="M9.5 8.6c1.5 1.2 2.5 2.9 2.9 5.2"/>' +
      '<path d="M8.4 9.4c.6 1.8 1.2 3.4 1.4 5"/>' +
      '<path d="M10 9.8l3.5-2.3 3.3-1.9"/>' +
      '<path d="M16.8 5.6 20 3.5M16.8 5.6l3.7-.6M16.8 5.6l2.7 1.4"/>' +
      '<path d="M9.6 10.4 8 12.7l.6 2.3"/>' +
      '<path d="M11.9 14.2l2.9-1.4 2.5 2.2"/>' +
      '<path d="M17.3 15l1.2.7"/>' +
      '<path d="M10.6 14.4l-.6 3.1.4 3"/>' +
      '<path d="M10.4 20.5l-1.3.3"/>' +
      '<path d="M10.6 11.1v1.8M10.6 11.5l-1-.9M10.6 11.5l1-.9M10.6 12.1l-1.1.1M10.6 12.1l1.1.1M10.6 12.7l-.9.8M10.6 12.7l.9.8"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z"/>',
    sliders: '<path d="M4 8h10M18 8h2M4 16h4M12 16h8"/><circle cx="16" cy="8" r="2"/><circle cx="10" cy="16" r="2"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || 'icon') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + (P[name] || P.grid) + '</svg>';
  }

  /* ---------------- tiny helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var root = $('#toast-root');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 2400);
  }

  function getSettings() {
    try { return Object.assign({ autoplay: true, compact: false, reduce: false }, JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}')); }
    catch (e) { return { autoplay: true, compact: false, reduce: false }; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); } catch (e) {}
    document.body.classList.toggle('reduced', !!s.reduce);
  }

  /* ---------------- router ---------------- */
  // Routes: #/  → landing
  //         #/animation | #/movies            → section home
  //         #/animation/<tab>                → section tab page
  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { view: 'landing' };
    // Master settings from the landing page — applies to both sections.
    if (parts[0] === 'master' && parts[1] === 'settings') return { view: 'master' };
    var sec = SECTIONS[parts[0]];
    if (!sec) return { view: 'landing' };
    // STEP 3: detail route — #/<section>/detail/<title-id>
    if (parts[1] === 'detail') {
      var item = window.MPV2.findTitle(sec.id, parts[2]);
      if (item) return { view: 'detail', section: sec.id, item: item };
      return { view: 'section', section: sec.id, tab: 'home' };
    }
    // ONLINE PHASE: character route — #/<section>/online/<provider>/character/<id>[?n=<name>]
    if (parts[1] === 'online' && parts[2] && parts[3] === 'character' && parts[4] &&
        window.MPV2.renderOnlineCharacter) {
      var cp = String(parts[4]).split('?'), cname = '';
      (cp[1] || '').split('&').forEach(function (kv) {
        var pair = kv.split('=');
        if (pair[0] === 'n') { try { cname = decodeURIComponent(pair[1] || ''); } catch (e) {} }
      });
      return { view: 'onlinecharacter', section: sec.id, provider: parts[2], id: cp[0], name: cname };
    }
    // ONLINE PHASE: manga deep-info route — #/<section>/online/<provider>/manga/<id>
    if (parts[1] === 'online' && parts[2] && parts[3] === 'manga' && parts[4] &&
        window.MPV2.renderOnlineDetail) {
      return { view: 'onlinedetail', section: sec.id, provider: parts[2], id: parts[4], mediaType: 'MANGA' };
    }
    // ONLINE PHASE: deep-info route — #/<section>/online/<provider>/<id>
    if (parts[1] === 'online' && parts[2] && parts[3] && window.MPV2.renderOnlineDetail) {
      return { view: 'onlinedetail', section: sec.id, provider: parts[2], id: parts[3] };
    }
    var tab = parts[1] || 'home';
    var all = sec.tabs.concat(sec.extras);
    var ok = all.some(function (t) { return t.id === tab; });
    return { view: 'section', section: sec.id, tab: ok ? tab : 'home' };
  }

  /* ---------------- landing ---------------- */
  function renderLanding() {
    document.title = 'Media Player V2';
    var app = $('#app');

    function card(id, index, artClass, imgAlt) {
      var s = SECTIONS[id];
      return '<a class="choice ' + (id === 'animation' ? 'anime' : 'movies') + '" href="#/' + id + '/home">' +
        '<div class="choice-art ' + artClass + '"><img src="img/' + id + '.png" alt="' + esc(imgAlt) + '"></div>' +
        '<div class="index">' + index + ' / ' + esc(s.name.toUpperCase()) + '</div>' +
        '<div class="choice-content"><h2>' + esc(s.name) + '</h2><p>' + esc(s.tagline) + '</p></div>' +
        '<span class="arrow">' + icon('chevron') + '</span></a>';
    }

    app.innerHTML =
      '<main class="landing"><div class="landing-inner">' +
        '<div class="landing-copy"><h1>What do you want to watch?</h1>' +
        '<p>Choose a library. You can switch sections at any time from the navigation.</p></div>' +
        '<div class="choice-grid">' +
          card('animation', '01', 'character', 'Anime character wearing a straw hat') +
          card('movies', '02', 'movie-character', 'Black-suited comic character in a dynamic leaping pose') +
        '</div>' +
        '<div class="landing-settings"><a class="master-settings-btn" href="#/master/settings">' +
          icon('gear') + '<span>Settings</span></a></div>' +
      '</div></main>';
  }

  /* ---------------- app shell ---------------- */
  function navItem(sec, t, activeTab) {
    var active = t.id === activeTab ? ' active' : '';
    return '<a class="nav-item' + active + '" href="#/' + sec.id + '/' + t.id + '" ' +
      (active ? 'aria-current="page"' : '') + '>' +
      icon(t.icon) + '<span>' + esc(t.label) + '</span></a>';
  }

  /* STEP 7 · CHUNK 1: shell markup as a pure string so the opening-screen
   * overlay can pre-render an exact (skeletonized) copy of the section home. */
  function shellHtml(sec, activeTab) {
    var tabsHtml = sec.tabs.map(function (t) { return navItem(sec, t, activeTab); }).join('');

    return '<div class="shell">' +
        '<header class="topbar">' +
          '<a class="section-switch" href="#/" aria-label="Switch section">' +
            '<span class="section-dot"></span><span>' + esc(sec.name) + '</span></a>' +
          '<nav class="topnav" aria-label="Primary navigation">' + tabsHtml + '</nav>' +
          '<span class="spacer"></span>' +
          '<a class="icon-btn' + (activeTab === 'search' ? ' active' : '') + '" href="#/' + sec.id + '/search" aria-label="Search" title="Search">' + icon('search') + '</a>' +
          '<a class="icon-btn' + (activeTab === 'local' ? ' active' : '') + '" href="#/' + sec.id + '/local" aria-label="Local files" title="Local files">' + icon('folder') + '</a>' +
          '<a class="icon-btn' + (activeTab === 'watchlist' ? ' active' : '') + '" href="#/' + sec.id + '/watchlist" aria-label="Watchlist" title="Watchlist">' + icon('bookmark') + '</a>' +
          '<a class="icon-btn grid-switch" href="#/" aria-label="Switch section" title="Switch section">' + icon('grid') + '</a>' +
        '</header>' +
        '<nav class="bottomnav" aria-label="Mobile navigation">' + tabsHtml + '</nav>' +
        '<main class="main" id="view"></main>' +
      '</div>';
  }

  function mountShell(sec, activeTab) {
    document.documentElement.style.setProperty('--tone', sec.id === 'animation' ? 'var(--anime)' : 'var(--movie)');
    $('#app').innerHTML = shellHtml(sec, activeTab);

    return $('#view');
  }

  function renderShell(sec, tab) {
    document.title = TITLES[tab] + ' · ' + sec.name + ' · Media Player V2';
    renderPage(sec, tab, mountShell(sec, tab));
    wireSwipeTabs(sec, tab); // STEP 7 · CHUNK 1: swipe between tabs
    window.scrollTo(0, 0);
  }

  // STEP 3: title detail page with chameleon poster accents
  function renderDetail(sec, item) {
    document.title = item.title + ' · ' + sec.name + ' · Media Player V2';
    renderDetailPage(sec, item, mountShell(sec, null));
    window.scrollTo(0, 0);
  }

  /* ---------------- page skeletons (Step 1) ----------------
   * Later steps override these via MPV2.registerPage(sectionId, tabId, fn).
   */
  var customPages = {};
  window.MPV2.registerPage = function (sectionId, tabId, fn) {
    customPages[sectionId + '/' + tabId] = fn;
  };

  /* STEP 3: catalogue-backed poster cards (clickable → detail page) */
  function posterCard(sec, item) {
    return '<a class="poster-card" href="#/' + sec.id + '/detail/' + item.id + '">' +
      '<span class="poster-img"><img src="' + item.poster + '" alt="' + esc(item.title) + ' poster" loading="lazy">' +
      '<video class="poster-preview" muted loop playsinline preload="none" tabindex="-1" aria-hidden="true" ' +
      'data-preview-src="' + MPV2.demoVideoFor(item, 0) + '"></video></span>' +
      '<span class="poster-title">' + esc(item.title) + '</span>' +
      '<span class="poster-meta">' + esc(item.year) + ' · ' + esc(item.kind) + '</span></a>';
  }
  /* STEP 5b: dedicated Watchlist page, reached from the top-bar bookmark. */
  /* STEP 5b: dedicated Watchlist page, reached from the top-bar bookmark.
   * Merges the local catalogue watchlist with titles saved from streaming
   * detail pages (Save to Watchlist). */
  function renderWatchlist(sec) {
    var ids = getWatchlist();
    var local = ids.map(function (id) { return window.MPV2.findTitle(sec.id, id); })
      .filter(function (t) { return !!t; });
    var W = window.MPV2.Watch;
    var online = (W ? W.getWatchlist() : []).filter(function (it) {
      // keep only entries belonging to this section (from the stored href)
      var m = /^#\/([^/]+)\//.exec(it.href || '');
      return m ? m[1] === sec.id : true;
    });
    var total = local.length + online.length;
    if (!total) {
      return pageHead(sec, 'Watchlist', 'Titles you save will appear here.') +
        emptyState('bookmark', 'Your watchlist is empty', 'Add a title from its details page, then it will be ready here.');
    }
    var out = pageHead(sec, 'Watchlist', total + ' saved title' + (total === 1 ? '' : 's') + '.');
    if (local.length) {
      out += '<div class="poster-grid cards">' + local.map(function (t) { return posterCard(sec, t); }).join('') + '</div>';
    }
    if (online.length) {
      out += '<section class="row"><div class="row-head"><h2>Saved from streaming</h2>' +
        '<span class="muted-link">' + online.length + ' title' + (online.length === 1 ? '' : 's') + '</span></div>' +
        '<div class="poster-grid cards">' + online.map(function (it) {
          return '<a class="poster-card" href="' + esc(it.href || '#/' + sec.id + '/home') + '">' +
            '<span class="poster-img">' +
              (it.poster ? '<img src="' + esc(it.poster) + '" alt="' + esc(it.title || '') + ' poster" loading="lazy">' : '') +
            '</span>' +
            '<span class="poster-title">' + esc(it.title || 'Untitled') + '</span>' +
            '<span class="poster-meta">' + esc(it.kind === 'movie' ? 'Movie' : 'Series') + '</span></a>';
        }).join('') + '</div></section>';
    }
    return out;
  }
  function cardRow(sec, items) {
    if (!items.length) {
      return emptyState('grid', 'Nothing here yet', 'Titles will appear in this row soon.');
    }
    return '<div class="poster-grid cards">' +
      items.map(function (t) { return posterCard(sec, t); }).join('') + '</div>';
  }
  function sectionTitles(sec) {
    return window.MPV2.CATALOG.filter(function (t) { return t.section === sec.id; });
  }

  function pageHead(sec, title, sub) {
    return '<div class="page-head"><div><span class="section-tag">' + esc(sec.name) + '</span>' +
      '<h1>' + esc(title) + '</h1>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div></div>';
  }

  function emptyState(ic, title, text) {
    return '<div class="empty">' + icon(ic) +
      '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></div>';
  }

  /* Watch-history cards (shared by the home carousel and the History page). */
  function historyCardHtml(sec, e) {
    var W = window.MPV2.Watch;
    var pct = W.progressPct(e);
    var done = W.isDone(e);
    var badge = e.kind === 'movie' ? 'MOVIE' : ('S' + (e.season || 1) + ' E' + e.episode);
    var meta = (e.lang ? e.lang + ' · ' : '') + (done ? 'Completed' : (e.position > 3 ? W.fmtLeft(e) : 'Just started'));
    return '<article class="rw-card">' +
      '<a class="rw-main" href="' + esc(e.href || '#/' + sec.id + '/home') + '">' +
        '<span class="rw-poster">' +
          (e.poster ? '<img src="' + esc(e.poster) + '" alt="" loading="lazy">' : '<span class="rw-noposter">' + icon('play') + '</span>') +
          '<span class="rw-badge">' + esc(badge) + '</span>' +
        '</span>' +
        '<span class="rw-info"><b>' + esc(e.title || 'Untitled') + '</b>' +
          '<small>' + esc(meta) + '</small>' +
          '<span class="rw-bar"><i style="width:' + pct + '%"></i></span>' +
        '</span>' +
      '</a>' +
      '<button type="button" class="rw-go" data-rw-play="' + esc(e.key) + '" aria-label="Continue watching ' + esc(e.title || '') + '">' +
        icon('play') + '<span>' + (done ? 'Replay' : 'Continue') + '</span>' +
      '</button>' +
    '</article>';
  }
  /* Watch-history entries for one section: movies -> movies, everything else -> anime. */
  function historyForSection(secId) {
    var W = window.MPV2.Watch;
    if (!W) return [];
    var wantMovie = secId === 'movies';
    return W.getHistory().filter(function (e) {
      return wantMovie ? e.kind === 'movie' : e.kind !== 'movie';
    });
  }
  function renderHistoryPage(sec) {
    var items = historyForSection(sec.id);
    var head = pageHead(sec, 'History', items.length
      ? items.length + ' title' + (items.length === 1 ? '' : 's') + ' in your viewing activity.'
      : 'Your viewing activity.');
    if (!items.length) {
      return head + emptyState('history', 'Nothing watched yet', 'Completed and in-progress titles will appear here.');
    }
    var cards = items.map(function (e) { return historyCardHtml(sec, e); }).join('');
    return head +
      '<div class="row-head"><span class="muted-link">Latest first</span>' +
      '<button type="button" class="link-btn" id="clearHistory">Clear history</button></div>' +
      '<div class="rw-list">' + cards + '</div>';
  }

  /* STEP 7 · CHUNK 1: section-home markup as a pure string, shared by the
   * live page and the opening-screen overlay. */
  function recentWatchedHtml(sec) {
    var W = window.MPV2.Watch;
    var items = W ? W.recentForSection(sec.id) : [];
    var head = '<section class="row"><div class="row-head"><h2>Recently Watched</h2>' +
      '<span class="muted-link">' + (items.length ? items.length + ' title' + (items.length === 1 ? '' : 's') : 'Your progress') + '</span></div>';
    if (!items.length) {
      return head + emptyState('history', 'Nothing watched yet', 'Episodes and movies you watch will appear here with your progress.') + '</section>';
    }
    var cards = items.map(function (e) { return historyCardHtml(sec, e); }).join('');
    return head + '<div class="rw-strip">' + cards + '</div></section>';
  }
  function homeHtml(sec) {
    // ONLINE PHASE: the Animation home gets a live hero carousel
    // (airing / trending / recommended / manga), other sections keep the
    // static placeholder hero.
    var hero = (sec.id === 'animation' && window.MPV2.heroHtml)
      ? window.MPV2.heroHtml()
      : '<section class="hero"><div class="hero-copy">' +
        '<div class="label">' + esc(sec.name) + '</div>' +
        '<h2>Continue where you left off</h2>' +
        '<p>Your featured title and viewing progress will live here as the library grows.</p>' +
      '</div></section>';
    return pageHead(sec, 'Home', 'Your main library view.') + hero +
      recentWatchedHtml(sec);
  }

  // Recently Watched: continue buttons resume playback directly.
  function wireRecentWatched(root) {
    root.querySelectorAll('[data-rw-play]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        var W = window.MPV2.Watch, S = window.MPV2.Stream;
        if (!W || !S) return;
        var e = W.getEntry(b.getAttribute('data-rw-play'));
        if (!e) return;
        S.playEpisode({
          anilistId: e.anilistId, title: e.title, poster: e.poster,
          provider: e.provider, pid: e.pid, isMovie: e.kind === 'movie'
        }, e.kind === 'movie' ? 1 : (e.episode || 1));
      });
    });
  }

  function renderPage(sec, tab, root) {
    var key = sec.id + '/' + tab;
    if (customPages[key]) { customPages[key](sec, root); return; }

    var html = '';
    if (tab === 'home') {
      html = homeHtml(sec);
      // ONLINE PHASE: Discover lives on the Animation home page, right after
      // the hero carousel and Recently Added — not as its own tab.
      if (sec.id === 'animation' && window.MPV2.discoverBlockHtml) {
        html += window.MPV2.discoverBlockHtml(sec);
      }
    } else if (tab === 'search') {
      html = pageHead(sec, 'Search', 'Find titles across ' + sec.name.toLowerCase() + '.') +
        '<div class="search-box">' + icon('search') +
          '<input id="searchInput" type="search" autocomplete="off" placeholder="Search titles…" aria-label="Search titles">' +
          '<button class="clear-btn hidden" id="clearSearch" aria-label="Clear search">' + icon('x') + '</button>' +
        '</div>' +
        '<div id="searchState">' + emptyState('search', 'Search is ready', 'Enter a title to use the search flow.') + '</div>';
    } else if (tab === 'local') {
      html = pageHead(sec, 'Local Files', 'Play media from this device.') +
        '<section class="file-panel">' + icon('folder') +
          '<h2>Choose local media</h2>' +
          '<p>Select video or audio files to preview the local-library flow in this session.</p>' +
          '<button class="primary" id="pickFiles">Choose files</button>' +
          '<input id="fileInput" type="file" accept="video/*,audio/*,.mkv,.avi" multiple>' +
          '<div class="format-list">' +
            ['MP4', 'MKV', 'WEBM', 'AVI', 'Audio'].map(function (x) { return '<span class="chip">' + x + '</span>'; }).join('') +
          '</div></section>' +
        '<div class="file-results" id="fileResults"></div>';
    } else if (tab === 'history') {
      html = renderHistoryPage(sec);
    } else if (tab === 'settings') {
      html = renderSettings(sec);
    } else if (tab === 'watchlist') {
      html = renderWatchlist(sec);
    } else {
      // anime / manga / bollywood / hollywood / webseries — catalogue rows
      html = pageHead(sec, TITLES[tab], TITLES[tab] + ' library.');
      // ONLINE PHASE: the Manga tab leads with the live manga block, then the
      // local manga catalogue rows below it (mirrors Discover on the home tab).
      if (tab === 'manga' && sec.id === 'animation' && window.MPV2.mangaBlockHtml) {
        html += window.MPV2.mangaBlockHtml(sec);
      }
      // ONLINE PHASE: the Anime tab leads with live Series / Movies / OVAs
      // rows, then the local anime catalogue below it.
      if (tab === 'anime' && sec.id === 'animation' && window.MPV2.animeTabHtml) {
        html += window.MPV2.animeTabHtml(sec);
      }
      html += cardRow(sec, window.MPV2.titlesFor(sec.id, tab));
    }

    root.innerHTML = html;
    wirePage(sec, tab, root);
  }

  /* ---------------- STEP 3: detail page + chameleon accents ----------------
   * The poster's dominant color is extracted on-device (canvas) and applied
   * as --poster on the detail root, tinting accent elements while the
   * pitch-black OLED base stays untouched. Falls back to the section tone.
   */
  /* ---------------- STEP 5: media details & watch order ---------------- */
  var LS_PROG = 'mpv2_progress_v1'; // { titleId: { s, e, at } } — last watched episode
  var LS_LIST = 'mpv2_watchlist_v1'; // [ titleId ]
  function getProgress() { try { return JSON.parse(localStorage.getItem(LS_PROG) || '{}'); } catch (e) { return {}; } }
  function saveProgress(p) { try { localStorage.setItem(LS_PROG, JSON.stringify(p)); } catch (e) {} }
  function getWatchlist() { try { return JSON.parse(localStorage.getItem(LS_LIST) || '[]'); } catch (e) { return []; } }
  function saveWatchlist(l) { try { localStorage.setItem(LS_LIST, JSON.stringify(l)); } catch (e) {} }

  function watchEntries(item) {
    if (item.watch && item.watch.length) return item.watch;
    var single = item.kindLabel === 'Movie' || item.kindLabel === 'Manga';
    return [{ name: single ? item.title : 'Season 1', type: item.kindLabel, year: item.year, episodes: 1 }];
  }
  // Next unwatched episode after progress {s,e} (last watched). null = complete.
  function nextEp(entries, prog) {
    if (!prog) return { s: 0, e: 1 };
    if (prog.e < entries[prog.s].episodes) return { s: prog.s, e: prog.e + 1 };
    if (prog.s + 1 < entries.length) return { s: prog.s + 1, e: 1 };
    return null;
  }
  function smartLabel(item, entries, prog) {
    var nxt = nextEp(entries, prog);
    if (!nxt) return 'Watch again from the start';
    if (!prog) return entries[0].type === 'Movie' ? 'Play movie'
      : 'Start from ' + entries[0].name + ', Episode 1';
    return 'Continue from ' + entries[nxt.s].name + ', Episode ' + nxt.e;
  }
  /* STEP 5b: reference-style watch order — a horizontal strip of numbered
   * season/part cards; tapping one shows its rich episode grid below. */
  var partSel = {}; // titleId -> selected watch-order index (defaults 0)
  function epAirDate(year, e) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var d = new Date(year, 0, 6 + (e - 1) * 7);
    return months[d.getMonth()] + ' ' + d.getDate();
  }
  function epCardHtml(item, en, s, e, prog) {
    var watched = prog && (s < prog.s || (s === prog.s && e <= prog.e));
    var isMovie = en.episodes === 1 && en.type === 'Movie';
    var label = isMovie ? 'Full movie' : 'Episode ' + e;
    return '<article class="episode-card' + (watched ? ' watched' : '') + '">' +
      '<img src="' + item.poster + '" alt="" loading="lazy">' +
      '<span class="episode-number">' + String(e).padStart(2, '0') + '</span>' +
      '<span class="episode-actions">' +
      '<button class="episode-action online" data-ep-act="online" aria-label="Watch ' + esc(label) + ' online">' + icon('globe') + '</button>' +
      '<button class="episode-action" data-ep-act="edit" aria-label="Edit ' + esc(label) + '">' + icon('edit') + '</button>' +
      '<button class="episode-action" data-ep-act="local" aria-label="Choose a local file for ' + esc(label) + '">' + icon('folder') + '</button>' +
      '</span>' +
      '<button class="episode-open" data-se="' + s + '" data-ep="' + e + '">' +
      '<h4>' + esc(label) + '</h4><p>' + epAirDate(en.year, e) + ' \u00b7 ' +
      (isMovie ? 'Feature film' : '23 min') + ' \u00b7 No local file</p></button></article>';
  }
  function toolbarHtml(inList) {
    function tb(id, ic, label, active) {
      return '<button class="tool-btn' + (active ? ' active' : '') + '" id="' + id + '">' +
        icon(ic) + '<span>' + label + '</span></button>';
    }
    return '<div class="toolbar" role="toolbar" aria-label="Title actions">' +
      tb('tbWatch', 'bookmark', inList ? 'In Watchlist' : 'Watchlist', inList) +
      tb('tbTrailer', 'play', 'Trailer', false) +
      tb('tbRefresh', 'refresh', 'Refresh', false) +
      tb('tbDelete', 'trash', 'Delete', false) + '</div>';
  }
  function watchOrderHtml(item, entries, prog) {
    var sel = Math.min(partSel[item.id] || 0, entries.length - 1);
    var parts = entries.map(function (en, i) {
      var n = String(i + 1).padStart(2, '0');
      return '<button class="watch-part' + (i === sel ? ' selected' : '') + '" data-part="' + i + '">' +
        '<span class="flow-index">' + n + '</span>' +
        '<span class="watch-thumb"><img src="' + item.poster + '" alt="" loading="lazy"></span>' +
        '<span class="watch-part-title"><h3>' + esc(en.name) + ' (' + en.year + ')</h3>' +
        '<p>' + en.episodes + ' episodes \u00b7 ' + en.episodes + ' listed</p></span>' +
        '<span class="watch-chevron">' + icon('chevron') + '</span></button>';
    }).join('');
    var en = entries[sel];
    var cards = '';
    for (var e = 1; e <= en.episodes; e++) cards += epCardHtml(item, en, sel, e, prog);
    return '<section class="watch-order"><div class="row-head"><h2>Watch order</h2>' +
      '<span class="wo-total">' + entries.length + (entries.length === 1 ? ' part' : ' parts') + '</span></div>' +
      '<div class="watch-flow">' + parts + '</div>' +
      '<div class="episode-panel-head"><h3>' + esc(en.name) + ' (' + en.year + ') \u00b7 ' + en.episodes + ' listed</h3></div>' +
      '<div class="episode-grid">' + cards + '</div></section>';
  }
  function reviewsHtml(item) {
    var rs = item.reviews || [];
    var avg = rs.length ? rs.reduce(function (a, r) { return a + r.rating; }, 0) / rs.length : 0;
    var cards = rs.map(function (r) {
      var stars = '';
      for (var i = 0; i < Math.round(r.rating / 2); i++) stars += '&#9733;';
      return '<article class="review-card"><div class="review-head"><b>' + esc(r.author) + '</b>' +
        '<span class="stars">' + stars + '<small>' + r.rating.toFixed(1) + '</small></span></div>' +
        '<p>' + esc(r.text) + '</p></article>';
    }).join('');
    return '<section class="reviews"><div class="row-head"><h2>Reviews</h2>' +
      (rs.length ? '<span class="review-avg">&#9733; ' + avg.toFixed(1) + ' · ' + rs.length + ' reviews</span>' : '') +
      '</div>' + (cards || '<p class="muted">No reviews yet.</p>') + '</section>';
  }

  /* ---------------------------------------------------------------------------
   * STEP 6: Cast & Characters (design phase — demo placeholder data, swapped
   * for the real metadata API later). Photo + name cards on the detail page;
   * tapping a card opens the person's profile modal.
   * ------------------------------------------------------------------------- */
  var detailCast = []; // resolved cast list for the open detail page (modal lookup)

  function castCardHtml(p, i) {
    return '<button class="cast-card" type="button" data-cast="' + i + '" aria-label="Open profile for ' + esc(p.name) + '">' +
      '<img class="cast-card-photo" src="' + p.photo + '" alt="Demo portrait for ' + esc(p.name) + '" loading="lazy">' +
      '<span class="cast-card-copy"><strong>' + esc(p.name) + '</strong>' +
      '<span>' + esc(p.credit) + '</span><small>' + esc(p.kind) + '</small></span>' +
      '<span class="cast-card-arrow">' + icon('chevron') + '</span></button>';
  }

  function castHtml(item) {
    var cast = MPV2.castFor(item);
    var anime = item.section === 'animation';
    detailCast = cast.main.concat(cast.support);
    var body;
    if (anime) {
      body = '<div class="cast-heading">Main Characters</div><div class="cast-list">' +
        cast.main.map(castCardHtml).join('') + '</div>' +
        '<div class="cast-heading">Supporting Characters</div><div class="cast-list">' +
        cast.support.map(castCardHtml).join('') + '</div>';
    } else {
      body = '<div class="cast-list">' + detailCast.map(castCardHtml).join('') + '</div>';
    }
    return '<section class="cast"><div class="row-head"><h2>' +
      (anime ? 'Cast &amp; Characters' : 'Main Cast') + '</h2></div>' + body +
      '<p class="demo-note">Demo cast for the design phase — replaced by real data later.</p></section>';
  }

  function closeCastProfile() {
    var ov = document.getElementById('castProfile');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  function openCastProfile(p) {
    if (!p) return;
    closeCastProfile();
    var facts = (p.facts || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
    var ov = document.createElement('div');
    ov.className = 'cast-profile-veil';
    ov.id = 'castProfile';
    ov.innerHTML =
      '<div class="cast-profile-modal" role="dialog" aria-modal="true" aria-label="' + esc(p.name) + '">' +
        '<button class="cast-profile-close" type="button" aria-label="Close profile">' + icon('x') + '</button>' +
        '<div class="cast-profile-image-wrap"><img class="cast-profile-image" src="' + p.photo + '" alt="Demo portrait for ' + esc(p.name) + '"></div>' +
        '<div class="cast-profile-content">' +
          '<span class="cast-profile-kicker">Cast profile · demo</span>' +
          '<h3>' + esc(p.name) + '</h3>' +
          '<p class="cast-profile-credit">' + esc(p.credit) + ' · ' + esc(p.kind) + '</p>' +
          '<p class="cast-profile-bio">' + esc(p.bio) + '</p>' +
          (facts ? '<ul class="cast-profile-facts">' + facts + '</ul>' : '') +
          '<p class="demo-note">Placeholder profile — replaced by the metadata API later.</p>' +
        '</div>' +
      '</div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('.cast-profile-close'))) closeCastProfile();
    });
    document.body.appendChild(ov);
    var btn = ov.querySelector('.cast-profile-close');
    if (btn) btn.focus();
  }

  var castEscapeWired = false;
  function wireCastEscape() {
    if (castEscapeWired) return;
    castEscapeWired = true;
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && document.getElementById('castProfile')) closeCastProfile();
    });
  }

  /* ---------------------------------------------------------------------------
   * CHUNK 2: MORE full-details modal (design-phase demo metadata).
   * Reuses the detail page's cast cards (same detailCast indices) and the cast
   * profile modal; ratings, reviews and release metadata are placeholders.
   * ------------------------------------------------------------------------- */
  var moreReturnFocus = null;
  function moreRatingBars() {
    return [[5, 62], [4, 24], [3, 9], [2, 3], [1, 2]].map(function (row) {
      return '<div class="rating-bar"><span>' + row[0] + '&#9733;</span>' +
        '<span class="rating-track"><i style="width:' + row[1] + '%"></i></span>' +
        '<span>' + row[1] + '%</span></div>';
    }).join('');
  }
  function moreRuntime(item, more) {
    var isFilm = item.kindLabel === 'Movie';
    if (isFilm) {
      return { label: 'Runtime', value: (2 + (more.seed % 2)) + 'h ' + (8 + (more.seed % 47)) + 'm' };
    }
    var total = watchEntries(item).reduce(function (s, en) { return s + (en.episodes || 0); }, 0);
    var manga = item.kindLabel === 'Manga';
    return { label: manga ? 'Total chapters' : 'Total episodes',
             value: total + (manga ? ' chapters' : ' episodes') };
  }
  function moreModalHtml(sec, item) {
    var more = MPV2.moreFor(item),
        anime = item.section === 'animation',
        cast = MPV2.castFor(item),
        rt = moreRuntime(item, more),
        cards = function (list, offset) {
          return '<div class="cast-list">' + list.map(function (p, i) {
            return castCardHtml(p, offset + i);
          }).join('') + '</div>';
        },
        castBody = anime
          ? '<div class="cast-heading">Main Characters</div>' + cards(cast.main, 0) +
            '<div class="cast-heading">Supporting Characters</div>' + cards(cast.support, cast.main.length)
          : cards(cast.main.concat(cast.support), 0);
    return '<div class="more-sheet" tabindex="-1">' +
      '<button class="more-close" type="button" aria-label="Close full details">' + icon('x') + '</button>' +
      '<div class="more-content">' +
        '<div class="more-eyebrow">Design preview &middot; placeholder metadata</div>' +
        '<h2>' + esc(item.title) + '</h2>' +
        '<section class="more-block" aria-label="Launch and release">' +
          '<h3>Launch &amp; release</h3><div class="release-grid">' +
          '<div class="release-item"><span>Exact release date</span><strong>' + esc(more.release) + '</strong></div>' +
          '<div class="release-item"><span>Studio / network</span><strong>' + esc(more.studio) + '</strong></div>' +
          '<div class="release-item"><span>' + esc(rt.label) + '</span><strong>' + esc(rt.value) + '</strong></div>' +
          '</div></section>' +
        '<section class="more-block" aria-label="Full synopsis">' +
          '<h3>Full synopsis</h3><p class="full-synopsis">' + esc(more.synopsis) + '</p></section>' +
        '<section class="more-block" aria-label="' + (anime ? 'Cast and characters' : 'Main cast') + '">' +
          '<h3>' + (anime ? 'Cast &amp; characters' : 'Main cast') + '</h3>' + castBody +
          '<p class="demo-note">Profiles, names and credits are placeholders for the design phase.</p></section>' +
        '<section class="more-block" aria-label="Ratings and reviews">' +
          '<h3>Ratings &amp; reviews</h3><div class="ratings-layout"><div>' +
            '<div class="community-score"><strong>' + item.rating.toFixed(1) + '</strong>' +
            '<span>Community score<br>out of 10</span></div>' +
            '<div class="rating-bars" role="img" aria-label="Community rating breakdown">' + moreRatingBars() + '</div>' +
          '</div><div class="review-entries">' +
            '<article class="popup-review"><strong>Mira K.</strong><span class="review-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>' +
            '<p>Beautifully paced, visually confident, and the character moments stayed with me after the credits.</p></article>' +
            '<article class="popup-review"><strong>Sam R.</strong><span class="review-stars">&#9733;&#9733;&#9733;&#9733;&#9734;</span>' +
            '<p>A strong watch with a memorable middle act. I would happily return to this world.</p></article>' +
            '<p class="demo-note">Ratings and reviews are visual placeholders for the design phase.</p>' +
          '</div></div></section>' +
      '</div></div>';
  }
  function closeMoreModal() {
    var ov = document.getElementById('moreModal');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    if (window.MPV2 && window.MPV2.unlockBodyScroll) window.MPV2.unlockBodyScroll();
    else document.body.style.overflow = '';
    if (moreReturnFocus && moreReturnFocus.focus) {
      try { moreReturnFocus.focus(); } catch (e) {}
      moreReturnFocus = null;
    }
  }

  /* ---------------------------------------------------------------------------
   * Rating details modal — opened by tapping the ★ rating on a detail page.
   * Design-phase placeholder breakdown (deterministic per title): big score,
   * 5-star visual, vote count, and a 10→1 distribution.
   * ------------------------------------------------------------------------- */
  var ratingReturnFocus = null;
  function ratingVotes(item) {
    var seed = 0;
    for (var i = 0; i < item.id.length; i++) seed = (seed * 31 + item.id.charCodeAt(i)) >>> 0;
    return 12000 + (seed % 88000);
  }
  function ratingDist(item) {
    // Bell curve centered on the item's rating, deterministic per title.
    var seed = 0;
    for (var i = 0; i < item.id.length; i++) seed = (seed * 37 + item.id.charCodeAt(i)) >>> 0;
    var out = [], sum = 0, s;
    for (s = 10; s >= 1; s--) {
      var d = (s - item.rating) / 1.6;
      var w = Math.exp(-d * d) * (0.85 + ((seed >> (s % 7)) % 100) / 400);
      out.push({ star: s, w: w });
      sum += w;
    }
    return out.map(function (r) { return { star: r.star, pct: Math.round(r.w / sum * 100) }; });
  }
  function starsHtml(rating) {
    var full = Math.round(rating / 2), h = '';
    for (var i = 1; i <= 5; i++) h += '<span class="rstar' + (i <= full ? ' on' : '') + '">&#9733;</span>';
    return h;
  }
  function ratingModalHtml(item) {
    var votes = ratingVotes(item);
    var bars = ratingDist(item).map(function (r) {
      return '<div class="rbar-row"><span class="rbar-star">' + r.star + '</span>' +
        '<div class="rbar-track"><div class="rbar-fill" style="width:' + r.pct + '%"></div></div>' +
        '<span class="rbar-pct">' + r.pct + '%</span></div>';
    }).join('');
    return '<div class="more-sheet rating-sheet">' +
      '<button class="more-close" type="button" aria-label="Close rating details">&times;</button>' +
      '<div class="rating-head"><p class="rating-kicker">RATING</p><h2>' + esc(item.title) + '</h2></div>' +
      '<div class="rating-score"><span class="rating-big">' + item.rating.toFixed(1) + '</span>' +
      '<span class="rating-of">/ 10</span></div>' +
      '<div class="rating-stars">' + starsHtml(item.rating) + '</div>' +
      '<p class="rating-votes">' + votes.toLocaleString('en-US') + ' votes</p>' +
      '<div class="rbar-list">' + bars + '</div>' +
      (item.runtime ? '<p class="rating-runtime">Running time · ' + esc(window.MPV2.formatRuntime(item.runtime)) + '</p>' : '') +
    '</div>';
  }
  function closeRatingModal() {
    var ov = document.getElementById('ratingModal');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    if (window.MPV2 && window.MPV2.unlockBodyScroll) window.MPV2.unlockBodyScroll();
    else document.body.style.overflow = '';
    if (ratingReturnFocus && ratingReturnFocus.focus) {
      try { ratingReturnFocus.focus(); } catch (e) {}
      ratingReturnFocus = null;
    }
  }
  function openRatingModal(sec, item) {
    closeRatingModal();
    var ov = document.createElement('div');
    ov.className = 'more-modal';
    ov.id = 'ratingModal';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Rating details for ' + item.title);
    ov.innerHTML = ratingModalHtml(item);
    var dr = document.getElementById('detailRoot');
    if (dr) {
      var c = dr.style.getPropertyValue('--poster') ||
              getComputedStyle(dr).getPropertyValue('--poster');
      if (c && c.trim()) ov.style.setProperty('--detail-accent', c.trim());
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('.more-close'))) closeRatingModal();
    });
    ratingReturnFocus = document.activeElement;
    document.body.appendChild(ov);
    if (window.MPV2 && window.MPV2.lockBodyScroll) window.MPV2.lockBodyScroll();
    else document.body.style.overflow = 'hidden';
    var btn = ov.querySelector('.more-close');
    if (btn) btn.focus();
  }
  var ratingEscapeWired = false;
  function wireRatingEscape() {
    if (ratingEscapeWired) return;
    ratingEscapeWired = true;
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && document.getElementById('ratingModal')) closeRatingModal();
    }, true);
  }
  function openMoreModal(sec, item) {
    closeMoreModal();
    closeCastProfile();
    var ov = document.createElement('div');
    ov.className = 'more-modal';
    ov.id = 'moreModal';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Full details for ' + item.title);
    ov.innerHTML = moreModalHtml(sec, item);
    // Chameleon: carry the detail page's poster accent into the modal.
    var dr = document.getElementById('detailRoot');
    if (dr) {
      var c = dr.style.getPropertyValue('--poster') ||
              getComputedStyle(dr).getPropertyValue('--poster');
      if (c && c.trim()) ov.style.setProperty('--detail-accent', c.trim());
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { closeMoreModal(); return; }
      var x = e.target && e.target.closest ? e.target.closest('.more-close') : null;
      if (x) { closeMoreModal(); return; }
      var b = e.target && e.target.closest ? e.target.closest('[data-cast]') : null;
      if (b) openCastProfile(detailCast[parseInt(b.getAttribute('data-cast'), 10)]);
    });
    moreReturnFocus = document.activeElement;
    document.body.appendChild(ov);
    if (window.MPV2 && window.MPV2.lockBodyScroll) window.MPV2.lockBodyScroll();
    else document.body.style.overflow = 'hidden';
    var sheet = ov.querySelector('.more-sheet');
    if (sheet) sheet.scrollTop = 0;
    var btn = ov.querySelector('.more-close');
    if (btn) btn.focus();
  }
  var moreEscapeWired = false;
  function wireMoreEscape() {
    if (moreEscapeWired) return;
    moreEscapeWired = true;
    // Capture phase: runs before the cast profile's own Escape handler, so one
    // Escape press closes only the topmost layer (profile first, modal after).
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') &&
          document.getElementById('moreModal') && !document.getElementById('castProfile')) {
        closeMoreModal();
      }
    }, true);
  }

  /* ---------------------------------------------------------------------------
   * CHUNK 3: cinematic demo player (design phase — bundled demo clips only).
   * Edge-to-edge player with custom chrome, tap / double-tap / swipe / pinch
   * gestures, brightness & volume HUD, episode drawer and settings (speed,
   * screen fit). Plays the bundled media/demo-*.mp4 clips; no streaming.
   * ------------------------------------------------------------------------- */
  var demoPlayer = null; // state while the player is open

  function demoFmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function demoEpLabel(item, entries, ep) {
    if (!ep || ep.trailer) return 'Trailer';
    if (item.kindLabel === 'Movie') return 'Feature film';
    if (item.kindLabel === 'Manga') return 'Chapter ' + ep.e;
    return entries[ep.s].name + ' · Episode ' + ep.e;
  }
  function demoEpisodeListHtml(item, entries, cur) {
    var html = '', n = 0;
    entries.forEach(function (en, s) {
      for (var e = 1; e <= (en.episodes || 1); e++) {
        n++;
        var active = cur && !cur.trailer && cur.s === s && cur.e === e;
        html += '<button class="demo-episode' + (active ? ' active' : '') + '" type="button" ' +
          'data-s="' + s + '" data-e="' + e + '" aria-label="Play ' + esc(en.name) + ' episode ' + e + '">' +
          '<span class="demo-episode-number">' + n + '</span>' +
          '<span class="demo-episode-copy"><b>' + esc(en.name) + ' · Episode ' + e + '</b>' +
          '<small>' + esc(item.title) + '</small></span></button>';
      }
    });
    return html;
  }
  function demoPlayerHtml(sec, item, entries, ep) {
    var label = demoEpLabel(item, entries, ep),
        single = item.kindLabel === 'Movie' || item.kindLabel === 'Manga',
        src = ep && ep.trailer ? MPV2.demoVideoFor(item, 3)
                               : MPV2.demoVideoFor(item, (ep && ep.e) || 0);
    return '<div class="demo-player-card">' +
      '<header class="demo-player-head">' +
        '<div class="demo-player-heading"><strong>' + esc(item.title) + '</strong>' +
          '<small><span class="demo-badge">DEMO</span><span id="demoPlayerLabel">' + esc(label) + '</span></small></div>' +
        '<div class="demo-player-actions">' +
          (single ? '' : '<button class="demo-round-btn" id="demoEpisodesBtn" type="button" aria-label="Episodes" title="Episodes">' + icon('list') + '</button>') +
          '<button class="demo-round-btn" id="demoSettingsBtn" type="button" aria-label="Player settings" title="Settings">' + icon('gear') + '</button>' +
          '<button class="demo-round-btn" id="demoClose" type="button" aria-label="Close player" title="Close">' + icon('x') + '</button>' +
        '</div>' +
      '</header>' +
      '<div class="demo-stage" id="demoStage">' +
        '<video id="demoVideo" playsinline preload="auto" src="' + src + '"></video>' +
        '<button class="demo-center-play" id="demoCenterPlay" type="button" aria-label="Play">' + icon('play') + '</button>' +
        '<div class="gesture-hints" id="demoHints">Double-tap sides to seek &middot; swipe left edge for brightness &middot; right edge for volume</div>' +
        '<div class="seek-feedback seek-left" id="demoSeekBack" aria-live="polite"><div class="seek-feedback-inner"><span>-10s</span></div></div>' +
        '<div class="seek-feedback seek-right" id="demoSeekFwd" aria-live="polite"><div class="seek-feedback-inner"><span>+10s</span></div></div>' +
        '<div class="gesture-hud" id="demoHud" aria-live="polite"></div>' +
      '</div>' +
      '<div class="demo-chrome" id="demoChrome">' +
        '<div class="demo-progress"><input type="range" id="demoSeekBar" min="0" max="1000" value="0" step="1" aria-label="Seek"></div>' +
        '<div class="demo-controls">' +
          '<div class="demo-controls-left">' +
            '<button class="demo-btn" id="demoBack10" type="button" aria-label="Back 10 seconds">' + icon('rewind') + '</button>' +
            '<button class="demo-btn demo-play" id="demoPlay" type="button" aria-label="Play">' + icon('play') + '</button>' +
            '<button class="demo-btn" id="demoFwd10" type="button" aria-label="Forward 10 seconds">' + icon('forward') + '</button>' +
            '<span class="demo-time" id="demoTime">0:00 / 0:00</span>' +
          '</div>' +
          '<div class="demo-controls-right">' +
            '<button class="demo-btn" id="demoMute" type="button" aria-label="Mute">' + icon('volume') + '</button>' +
            '<input type="range" class="demo-volume" id="demoVolume" min="0" max="100" value="100" aria-label="Volume">' +
            '<button class="demo-btn" id="demoFull" type="button" aria-label="Fullscreen">' + icon('fullscreen') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (single ? '' :
      '<aside class="demo-drawer" id="demoEpisodes" aria-label="Episodes" hidden>' +
        '<div class="demo-drawer-head"><h2>Episodes</h2>' +
          '<button class="demo-drawer-close" type="button" aria-label="Close episodes">' + icon('x') + '</button></div>' +
        '<div class="demo-episode-list" id="demoEpisodeList">' + demoEpisodeListHtml(item, entries, ep) + '</div>' +
      '</aside>') +
      '<aside class="demo-drawer" id="demoSettings" aria-label="Player settings" hidden>' +
        '<div class="demo-drawer-head"><h2>Player settings</h2>' +
          '<button class="demo-drawer-close" type="button" aria-label="Close settings">' + icon('x') + '</button></div>' +
        '<section class="demo-settings-section"><h3>Playback speed</h3><div class="demo-speed-grid">' +
          [0.5, 0.75, 1, 1.25, 1.5, 2].map(function (v) {
            return '<button type="button" data-speed="' + v + '"' + (v === 1 ? ' class="active"' : '') + '>' + v + '&times;</button>';
          }).join('') +
        '</div></section>' +
        '<section class="demo-settings-section"><h3>Screen fit</h3><div class="demo-fit-row">' +
          '<button type="button" data-fit="contain" class="active">Fit</button>' +
          '<button type="button" data-fit="cover">Fill</button>' +
        '</div></section>' +
        '<p class="demo-note">Demo player &mdash; plays bundled sample clips only.</p>' +
      '</aside>' +
    '</div>';
  }

  function demoShowChrome() {
    var st = demoPlayer;
    if (!st) return;
    st.root.classList.remove('player-idle');
    clearTimeout(st.idleTimer);
    if (!st.root.classList.contains('drawer-open')) {
      st.idleTimer = setTimeout(function () {
        if (demoPlayer === st && !st.video.paused) st.root.classList.add('player-idle');
      }, 2600);
    }
  }
  function demoToggleChrome() {
    var st = demoPlayer;
    if (!st || st.root.classList.contains('drawer-open')) return;
    if (st.root.classList.contains('player-idle')) demoShowChrome();
    else { clearTimeout(st.idleTimer); st.root.classList.add('player-idle'); }
  }
  function demoSeekBy(seconds) {
    var st = demoPlayer;
    if (!st || !st.video.duration) return;
    st.video.currentTime = Math.max(0, Math.min(st.video.duration, st.video.currentTime + seconds));
    demoShowChrome();
  }
  function demoSeekFeedback(side, seconds) {
    var st = demoPlayer;
    if (!st) return;
    var el = st.root.querySelector(side === 'left' ? '#demoSeekBack' : '#demoSeekFwd');
    if (!el) return;
    el.querySelector('span').textContent = (seconds > 0 ? '+' : '') + seconds + 's';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 620);
  }
  function demoHud(kind, value, level) {
    var st = demoPlayer;
    if (!st) return;
    var hud = st.root.querySelector('#demoHud');
    if (!hud) return;
    hud.className = 'gesture-hud ' + kind;
    var meter = typeof level === 'number'
      ? '<span class="gesture-meter" aria-hidden="true"><i></i></span>' : '';
    hud.innerHTML = icon(kind === 'brightness' ? 'sun' : kind === 'volume' ? 'volume' : 'fullscreen') +
      '<span>' + esc(value) + '</span>' + meter;
    if (typeof level === 'number') hud.style.setProperty('--gesture-level', Math.max(0, Math.min(100, level)) + '%');
    void hud.offsetWidth;
    hud.classList.add('show');
    clearTimeout(hud._timer);
    hud._timer = setTimeout(function () { hud.classList.remove('show'); }, 650);
  }
  function demoSetBrightness(v) {
    var st = demoPlayer;
    if (!st) return;
    v = Math.max(0.5, Math.min(1.5, v));
    st.root.querySelector('.demo-player-card').style.setProperty('--player-brightness', String(v));
    st.brightness = v;
  }
  function demoSetVolume(v) {
    var st = demoPlayer;
    if (!st) return;
    v = Math.max(0, Math.min(1, v));
    st.video.volume = v;
    st.video.muted = (v === 0);
    var r = st.root.querySelector('#demoVolume');
    if (r) r.value = String(Math.round(v * 100));
    demoSyncMuteIcon();
  }
  function demoSyncMuteIcon() {
    var st = demoPlayer;
    if (!st) return;
    var b = st.root.querySelector('#demoMute');
    if (b) {
      var muted = st.video.muted || st.video.volume === 0;
      b.innerHTML = icon(muted ? 'mute' : 'volume');
      b.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    }
  }
  function demoSyncPlayIcon() {
    var st = demoPlayer;
    if (!st) return;
    var paused = st.video.paused;
    var b = st.root.querySelector('#demoPlay');
    if (b) { b.innerHTML = icon(paused ? 'play' : 'pause'); b.setAttribute('aria-label', paused ? 'Play' : 'Pause'); }
    var c = st.root.querySelector('#demoCenterPlay');
    if (c) {
      c.style.display = paused ? '' : 'none';
      c.innerHTML = icon(st.video.ended ? 'refresh' : 'play');
      c.setAttribute('aria-label', st.video.ended ? 'Replay' : 'Play');
    }
  }

  function openDemoPlayer(sec, item, ep) {
    if (demoPlayer) closeDemoPlayer();
    closeMoreModal();
    var entries = watchEntries(item);
    var root = document.createElement('div');
    root.className = 'demo-player';
    root.id = 'demoPlayer';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Playing ' + item.title);
    root.innerHTML = demoPlayerHtml(sec, item, entries, ep);
    var prevOverflow = document.body.style.overflow;
    var returnFocus = document.activeElement;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    var st = demoPlayer = {
      root: root, sec: sec, item: item, entries: entries, ep: ep || null,
      video: root.querySelector('#demoVideo'),
      idleTimer: 0, prevOverflow: prevOverflow, returnFocus: returnFocus,
      gesture: null, scale: 1, brightness: 1, progressDirty: false
    };
    demoWirePlayer();
    wireDemoEscape();
    demoShowChrome();
    var hints = root.querySelector('#demoHints');
    setTimeout(function () { if (hints) hints.classList.add('fade'); }, 5000);
    var close = root.querySelector('#demoClose');
    if (close) close.focus();
    // Autoplay (the tap that opened the player counts as a user gesture).
    var pr = st.video.play();
    if (pr && pr.catch) pr.catch(function () { demoSyncPlayIcon(); });
  }

  function closeDemoPlayer() {
    var st = demoPlayer;
    if (!st) return;
    demoPlayer = null;
    clearTimeout(st.idleTimer);
    try { st.video.pause(); } catch (e) {}
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    if (st.root.parentNode) st.root.parentNode.removeChild(st.root);
    document.body.style.overflow = st.prevOverflow || '';
    if (st.returnFocus && st.returnFocus.focus) { try { st.returnFocus.focus(); } catch (e) {} }
    if (st.progressDirty) renderDetail(st.sec, st.item);
  }
  var demoEscapeWired = false;
  function wireDemoEscape() {
    if (demoEscapeWired) return;
    demoEscapeWired = true;
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && demoPlayer) {
        var open = demoPlayer.root.querySelector('.demo-drawer:not([hidden])');
        if (open) { demoCloseDrawers(); return; }
        closeDemoPlayer();
      }
    }, true);
  }

  function demoCloseDrawers() {
    var st = demoPlayer;
    if (!st) return;
    st.root.querySelectorAll('.demo-drawer').forEach(function (d) { d.hidden = true; });
    st.root.classList.remove('drawer-open');
    demoShowChrome();
  }
  function demoOpenDrawer(id) {
    var st = demoPlayer;
    if (!st) return;
    var d = st.root.querySelector('#' + id);
    if (!d) return;
    var wasHidden = d.hidden;
    demoCloseDrawers();
    if (wasHidden) {
      d.hidden = false;
      st.root.classList.add('drawer-open');
      clearTimeout(st.idleTimer);
      st.root.classList.remove('player-idle');
    }
  }
  function demoLoadEpisode(s, e) {
    var st = demoPlayer;
    if (!st) return;
    st.ep = { s: s, e: e };
    st.video.src = MPV2.demoVideoFor(st.item, e);
    st.video.playbackRate = 1;
    st.root.querySelector('#demoPlayerLabel').textContent = demoEpLabel(st.item, st.entries, st.ep);
    st.root.querySelectorAll('.demo-episode').forEach(function (b) {
      b.classList.toggle('active',
        +b.getAttribute('data-s') === s && +b.getAttribute('data-e') === e);
    });
    var pr = st.video.play();
    if (pr && pr.catch) pr.catch(function () {});
    demoCloseDrawers();
    demoShowChrome();
  }
  function demoMarkWatched() {
    var st = demoPlayer;
    if (!st || !st.ep || st.ep.trailer) return;
    var p = getProgress();
    p[st.item.id] = { s: st.ep.s, e: st.ep.e, at: Date.now() };
    saveProgress(p);
    st.progressDirty = true;
  }

  function demoWirePlayer() {
    var st = demoPlayer;
    if (!st) return;
    var root = st.root, video = st.video;
    function $(id) { return root.querySelector('#' + id); }

    // ---- transport state ----
    function syncSeek() {
      var bar = $('demoSeekBar');
      if (bar && video.duration && document.activeElement !== bar) {
        bar.value = String(Math.round(video.currentTime / video.duration * 1000));
      }
      var t = $('demoTime');
      if (t) t.textContent = demoFmtTime(video.currentTime) + ' / ' + demoFmtTime(video.duration);
    }
    video.addEventListener('loadedmetadata', syncSeek);
    video.addEventListener('timeupdate', syncSeek);
    video.addEventListener('play', function () { demoSyncPlayIcon(); demoShowChrome(); });
    video.addEventListener('pause', function () { demoSyncPlayIcon(); demoShowChrome(); });
    video.addEventListener('ended', function () { demoMarkWatched(); demoSyncPlayIcon(); demoShowChrome(); });

    // ---- chrome controls ----
    function togglePlay() {
      if (video.paused) { var pr = video.play(); if (pr && pr.catch) pr.catch(function () {}); }
      else video.pause();
    }
    $('demoPlay').addEventListener('click', function (e) { e.stopPropagation(); togglePlay(); demoShowChrome(); });
    $('demoCenterPlay').addEventListener('click', function (e) {
      e.stopPropagation();
      if (video.ended) video.currentTime = 0;
      togglePlay(); demoShowChrome();
    });
    $('demoBack10').addEventListener('click', function (e) {
      e.stopPropagation(); demoSeekBy(-10); demoSeekFeedback('left', -10);
    });
    $('demoFwd10').addEventListener('click', function (e) {
      e.stopPropagation(); demoSeekBy(10); demoSeekFeedback('right', 10);
    });
    var bar = $('demoSeekBar');
    bar.addEventListener('input', function () {
      if (video.duration) video.currentTime = bar.value / 1000 * video.duration;
      demoShowChrome();
    });
    $('demoMute').addEventListener('click', function (e) {
      e.stopPropagation();
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = 0.5;
      demoSetVolume(video.muted ? 0 : video.volume);
      demoShowChrome();
    });
    $('demoVolume').addEventListener('input', function (e) {
      demoSetVolume(e.target.value / 100);
      demoShowChrome();
    });
    $('demoFull').addEventListener('click', function (e) {
      e.stopPropagation();
      if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (err) {} }
      else if (root.requestFullscreen) { try { root.requestFullscreen(); } catch (err) {} }
      demoShowChrome();
    });

    // ---- header + drawers ----
    $('demoClose').addEventListener('click', function () { closeDemoPlayer(); });
    var epBtn = $('demoEpisodesBtn');
    if (epBtn) epBtn.addEventListener('click', function (e) { e.stopPropagation(); demoOpenDrawer('demoEpisodes'); });
    $('demoSettingsBtn').addEventListener('click', function (e) { e.stopPropagation(); demoOpenDrawer('demoSettings'); });
    root.querySelectorAll('.demo-drawer-close').forEach(function (b) {
      b.addEventListener('click', function () { demoCloseDrawers(); });
    });
    root.querySelectorAll('#demoEpisodeList .demo-episode').forEach(function (b) {
      b.addEventListener('click', function () {
        demoLoadEpisode(+b.getAttribute('data-s'), +b.getAttribute('data-e'));
      });
    });
    root.querySelectorAll('[data-speed]').forEach(function (b) {
      b.addEventListener('click', function () {
        video.playbackRate = parseFloat(b.getAttribute('data-speed'));
        root.querySelectorAll('[data-speed]').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
      });
    });
    root.querySelectorAll('[data-fit]').forEach(function (b) {
      b.addEventListener('click', function () {
        video.style.objectFit = b.getAttribute('data-fit');
        root.querySelectorAll('[data-fit]').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
      });
    });

    // ---- gestures (faithful port of the preview's player gestures) ----
    demoWireGestures(root.querySelector('#demoStage'), root.querySelector('.demo-player-card'));
    demoSyncPlayIcon();
    demoSyncMuteIcon();
  }

  function demoWireGestures(stage, card) {
    var tapTimer = 0, lastTap = null;
    function dist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function excluded(target) {
      return !!(target && target.closest &&
        target.closest('button,input,select,textarea,a,.demo-chrome,.demo-drawer'));
    }
    function clearTap() { clearTimeout(tapTimer); tapTimer = 0; lastTap = null; }
    function finePointer() {
      return window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    stage.addEventListener('touchstart', function (e) {
      var st = demoPlayer;
      if (!st) return;
      demoShowChrome();
      if (excluded(e.target)) { st.gesture = null; return; }
      if (e.touches.length === 2) {
        clearTap();
        st.gesture = { kind: 'pinch', distance: dist(e.touches), scale: st.scale || 1 };
        return;
      }
      if (e.touches.length !== 1) return;
      var touch = e.touches[0], rect = stage.getBoundingClientRect(),
          kind = touch.clientX < rect.left + rect.width / 2 ? 'brightness' : 'volume';
      st.gesture = {
        kind: kind, startX: touch.clientX, startY: touch.clientY,
        startValue: kind === 'brightness' ? (st.brightness || 1) : st.video.volume,
        vertical: false, moved: false, rect: rect
      };
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      var st = demoPlayer;
      if (!st) return;
      var g = st.gesture;
      if (!g) return;
      if (g.kind === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        var scale = Math.max(1, Math.min(2.2, g.scale * dist(e.touches) / Math.max(1, g.distance)));
        st.scale = scale;
        card.style.setProperty('--video-scale', String(scale));
        demoHud('fit', scale === 1 ? 'Fit to screen' : Math.round(scale * 100) + '% zoom');
        return;
      }
      if (e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - g.startX, dy = e.touches[0].clientY - g.startY;
      if (Math.hypot(dx, dy) > 9) g.moved = true;
      if (!g.vertical) {
        if (Math.abs(dy) < 10 || Math.abs(dy) <= Math.abs(dx) * 1.15) return;
        g.vertical = true;
        clearTap();
      }
      e.preventDefault();
      var delta = (g.startY - e.touches[0].clientY) / Math.max(180, stage.clientHeight * 0.55),
          next = g.startValue + delta;
      if (g.kind === 'brightness') {
        next = Math.max(0.5, Math.min(1.5, next));
        demoSetBrightness(next);
        demoHud('brightness', Math.round(next * 100) + '%', (next - 0.5) * 100);
      } else {
        next = Math.max(0, Math.min(1, next));
        demoSetVolume(next);
        demoHud('volume', Math.round(next * 100) + '%', next * 100);
      }
    }, { passive: false });

    stage.addEventListener('touchend', function (e) {
      var st = demoPlayer;
      if (!st) return;
      var g = st.gesture;
      st.gesture = null;
      if (!g || g.kind === 'pinch' || g.vertical || g.moved || !e.changedTouches.length) return;
      var touch = e.changedTouches[0], rect = g.rect || stage.getBoundingClientRect(),
          relative = (touch.clientX - rect.left) / Math.max(1, rect.width),
          zone = relative < 1 / 3 ? 'left' : relative > 2 / 3 ? 'right' : 'center',
          now = Date.now();
      if (lastTap && lastTap.zone === zone && now - lastTap.time < 320 &&
          Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 64) {
        clearTimeout(tapTimer); tapTimer = 0; lastTap = null;
        if (zone === 'left' || zone === 'right') {
          var seconds = zone === 'left' ? -10 : 10;
          demoSeekBy(seconds);
          demoSeekFeedback(zone, seconds);
        } else demoToggleChrome();
        return;
      }
      lastTap = { zone: zone, time: now, x: touch.clientX, y: touch.clientY };
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { tapTimer = 0; lastTap = null; demoToggleChrome(); }, 300);
    }, { passive: false });
    stage.addEventListener('touchcancel', function () {
      var st = demoPlayer;
      if (st) st.gesture = null;
      clearTap();
    }, { passive: true });

    // Desktop: double-click toggles zoom; single click toggles chrome.
    var clickTimer = 0;
    stage.addEventListener('dblclick', function (e) {
      var st = demoPlayer;
      if (!st || excluded(e.target) || !finePointer()) return;
      clearTimeout(clickTimer); clickTimer = 0;
      st.scale = st.scale > 1 ? 1 : 1.35;
      card.style.setProperty('--video-scale', String(st.scale));
      demoHud('fit', st.scale === 1 ? 'Fit to screen' : '135% zoom');
    });
    stage.addEventListener('click', function (e) {
      var st = demoPlayer;
      if (!st || excluded(e.target) || !finePointer()) return;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(function () { clickTimer = 0; demoToggleChrome(); }, 300);
    });
  }

  /* ---------------------------------------------------------------------------
   * CHUNK 5: hover ambient previews (design phase — bundled demo clips only).
   * Poster cards play a muted preview on hover/focus on fine-pointer devices,
   * honoring the "Autoplay previews" setting and reduced motion. The video
   * fades in only once frames actually flow (no black flash), and unloads
   * when the pointer leaves. Touch devices are unaffected.
   * ------------------------------------------------------------------------- */
  function wirePreviewVisibility(video, canReveal) {
    var revealToken = 0;
    function hide() {
      revealToken += 1;
      video.classList.remove('is-playing');
    }
    function commit() {
      if (!video.paused && !video.ended && (!canReveal || canReveal())) {
        video.classList.add('is-playing');
      }
    }
    function reveal() {
      var token = ++revealToken;
      function guarded() { if (token === revealToken) commit(); }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(guarded);
      else if (window.requestAnimationFrame) window.requestAnimationFrame(guarded);
      else commit();
    }
    video.addEventListener('playing', reveal);
    ['pause', 'ended', 'waiting', 'stalled', 'emptied', 'error'].forEach(function (n) {
      video.addEventListener(n, hide);
    });
    if (!video.paused && video.readyState >= 2) reveal();
    return hide;
  }
  function wirePosterPreviews() {
    var hoverCapable = window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!hoverCapable || motionDisabled()) return;
    document.querySelectorAll('.poster-card:not([data-preview-wired])').forEach(function (card) {
      var video = card.querySelector('.poster-preview');
      if (!video) return;
      card.setAttribute('data-preview-wired', '1');
      var pointerInside = false;
      var hide = wirePreviewVisibility(video, function () { return pointerInside; });
      function showPreview() {
        pointerInside = true;
        if (!getSettings().autoplay || motionDisabled()) return;
        var src = video.getAttribute('data-preview-src');
        if (!src) return;
        if (!video.getAttribute('src')) { video.setAttribute('src', src); video.load(); }
        video.muted = true;
        var promise = video.play();
        if (promise && promise.catch) promise.catch(function () { hide(); });
      }
      function stopPreview() {
        pointerInside = false;
        hide();
        video.pause();
        try { video.currentTime = 0; } catch (e) {}
        video.removeAttribute('src');
        video.load();
      }
      card.addEventListener('pointerenter', showPreview);
      card.addEventListener('pointerleave', stopPreview);
      card.addEventListener('focusin', showPreview);
      card.addEventListener('focusout', stopPreview);
    });
  }

  function renderDetailPage(sec, item, root) {
    var entries = watchEntries(item);
    var prog = getProgress()[item.id] || null;
    var inList = getWatchlist().indexOf(item.id) >= 0;
    var genres = (item.genres || []).map(function (g) {
      return '<span class="genre-chip">' + esc(g) + '</span>';
    }).join('');

    root.innerHTML =
      '<div class="detail" id="detailRoot">' +
        '<a class="back-link" href="#/' + sec.id + '/' + item.tab + '">' + icon('arrowLeft') + '<span>Back</span></a>' +
        '<section class="detail-hero">' +
          '<div class="detail-poster"><img id="detailPoster" src="' + item.poster + '" alt="' + esc(item.title) + ' poster"></div>' +
          '<div class="detail-info">' +
            '<span class="kind-tag">' + esc(item.kindLabel) + '</span>' +
            '<h1>' + esc(item.title) + '</h1>' +
            '<p class="detail-meta">' + esc(item.year) +
              (item.runtime ? ' · ' + esc(window.MPV2.formatRuntime(item.runtime)) : '') +
              ' · <button class="rating-link" data-rating-open type="button" aria-label="Show full rating details for ' + esc(item.title) + '">&#9733; ' + item.rating.toFixed(1) + '</button></p>' +
            '<div class="genre-row">' + genres + '</div>' +
            '<p class="detail-blurb">' + esc(item.blurb) + '</p>' +
            '<div class="more-btn-row"><button class="more-button" id="moreButton" type="button" ' +
              'aria-haspopup="dialog" aria-label="Open full details for ' + esc(item.title) + '">MORE</button></div>' +
          '</div>' +
        '</section>' +
        '<div class="smart-wrap"><button class="primary poster-accent smart-play" id="smartPlay">' +
          icon('play') + '<span>' + esc(smartLabel(item, entries, prog)) + '</span></button></div>' +
        toolbarHtml(inList) +
        watchOrderHtml(item, entries, prog) +
        castHtml(item) +
        reviewsHtml(item) +
      '</div>';

    // STEP 3 chameleon: poster dominant color tints the detail accents.
    var img = $('#detailPoster', root);
    function apply() {
      extractPosterColor(img, function (c) {
        if (c) $('#detailRoot', root).style.setProperty('--poster', c);
      });
    }
    if (img.complete && img.naturalWidth) apply();
    else {
      img.addEventListener('load', apply);
      img.addEventListener('error', function () {});
    }

    // STEP 6: cast cards open the profile modal; Escape closes it.
    wireCastEscape();
    // CHUNK 2: MORE full-details modal.
    wireMoreEscape();
    wireRatingEscape();
    var moreBtn = $('#moreButton', root);
    if (moreBtn) moreBtn.addEventListener('click', function () { openMoreModal(sec, item); });
    var ratingBtn = root.querySelector('[data-rating-open]');
    if (ratingBtn) ratingBtn.addEventListener('click', function () { openRatingModal(sec, item); });
    root.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-cast]') : null;
      if (b) openCastProfile(detailCast[parseInt(b.getAttribute('data-cast'), 10)]);
    });

    // Smart playback: open the cinematic demo player at the next episode.
    $('#smartPlay', root).addEventListener('click', function () {
      var cur = (getProgress()[item.id] || null);
      var nxt = nextEp(entries, cur) || { s: 0, e: 1 };
      openDemoPlayer(sec, item, { s: nxt.s, e: nxt.e });
    });
    // Watch-order part cards: tapping selects the entry, grid updates below.
    root.querySelectorAll('.watch-part').forEach(function (b) {
      b.addEventListener('click', function () {
        partSel[item.id] = +b.getAttribute('data-part');
        renderDetail(sec, item);
      });
    });
    // Episode cards: tapping marks the episode watched (drives the smart button).
    root.querySelectorAll('.episode-open').forEach(function (b) {
      b.addEventListener('click', function () {
        openDemoPlayer(sec, item, { s: +b.getAttribute('data-se'), e: +b.getAttribute('data-ep') });
      });
    });
    // Episode action icons: demo catalogue keeps these as honest stubs.
    root.querySelectorAll('.episode-action').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-ep-act');
        toast(a === 'online' ? 'Online lookup arrives in a later step' :
          a === 'edit' ? 'Episode editing arrives in a later step' :
          'Local file linking arrives in a later step');
      });
    });
    // Action toolbar.
    $('#tbWatch', root).addEventListener('click', function () {
      var l = getWatchlist(), i = l.indexOf(item.id);
      if (i < 0) { l.push(item.id); toast('Added to Watchlist'); }
      else { l.splice(i, 1); toast('Removed from Watchlist'); }
      saveWatchlist(l);
      renderDetail(sec, item);
    });
    $('#tbTrailer', root).addEventListener('click', function () {
      openDemoPlayer(sec, item, { trailer: true });
    });
    $('#tbRefresh', root).addEventListener('click', function () {
      apply();
      toast('Details refreshed');
    });
    $('#tbDelete', root).addEventListener('click', function () {
      if (!window.confirm('Remove "' + item.title + '" from your records and lists?')) return;
      var p = getProgress();
      delete p[item.id];
      saveProgress(p);
      var l = getWatchlist(), i = l.indexOf(item.id);
      if (i >= 0) { l.splice(i, 1); saveWatchlist(l); }
      toast('Removed from your records');
      renderDetail(sec, item);
    });
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    function f(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
  }
  function extractPosterColor(img, cb) {
    function done(c) { try { cb(c); } catch (e) {} }
    try {
      var S = 48, cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var x = cv.getContext('2d');
      x.drawImage(img, 0, 0, S, S);
      var d = x.getImageData(0, 0, S, S).data;
      var r = 0, g = 0, b = 0, n = 0, i, v;
      for (i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (v < 18 || v > 238) continue; // ignore near-black / near-white
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (!n) return done(null);
      var hsl = rgbToHsl(r / n, g / n, b / n);
      hsl[1] = Math.max(hsl[1], 0.55);                 // keep accents vivid
      hsl[2] = Math.min(0.62, Math.max(0.42, hsl[2])); // readable on black
      var rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
      done('#' + rgb.map(function (q) {
        return Math.round(q).toString(16).padStart(2, '0');
      }).join(''));
    } catch (e) { done(null); } // tainted canvas / missing API → section tone
  }

  function fileRows(files) {
    return files.map(function (f) {
      return '<div class="file-row">' + icon('file') + '<span>' + esc(f.name) + '</span></div>';
    }).join('');
  }

  function swatchHtml(sec) {
    var t = getSectionThemes();
    // Master: highlight only when both sections already share the color.
    var cur = sec.id === 'master'
      ? (t.animation === t.movies ? String(t.animation).toLowerCase() : null)
      : String(t[sec.id]).toLowerCase();
    var out = THEME_PRESETS.map(function (c) {
      var active = cur && c.toLowerCase() === cur ? ' active' : '';
      return '<button class="swatch' + active + '" data-accent="' + c + '"' +
        ' style="--sw:' + c + '" aria-label="Use accent color ' + c + '"></button>';
    }).join('');
    out += '<label class="swatch custom" title="Custom color">' +
      '<input type="color" data-custom-accent value="' + (cur || '#b54aea') + '" aria-label="Pick a custom accent color">' +
      '<span aria-hidden="true">+</span></label>';
    return out;
  }

  function renderSettings(sec) {
    var s = getSettings();
    var mode = getThemeMode();
    function row(id, title, sub) {
      return '<button class="setting" data-setting="' + id + '" role="switch" aria-checked="' + !!s[id] + '">' +
        '<span class="setting-copy"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>' +
        '<span class="switch" aria-hidden="true"></span></button>';
    }
    function modeBtn(m, ic, label) {
      var on = mode === m;
      return '<button class="segment' + (on ? ' active' : '') + '" data-mode="' + m + '"' +
        ' role="radio" aria-checked="' + on + '">' + icon(ic) + '<span>' + label + '</span></button>';
    }
    return pageHead(sec, 'Settings', 'Playback and appearance controls.') +
      '<div class="settings">' +
        '<section class="settings-group"><h2>Playback</h2>' +
          row('autoplay', 'Autoplay previews', 'Play muted previews on poster hover.') +
        '</section>' +
        '<section class="settings-group"><h2>Section theme</h2>' +
          '<div class="theme-block">' +
            '<p class="theme-label">Accent color for ' +
              (sec.id === 'master' ? '<b>both sections</b>' : '<b>' + esc(sec.name) + '</b>') + '</p>' +
            '<div class="swatches">' + swatchHtml(sec) + '</div>' +
            '<button class="link-btn" data-reset-theme>Reset to default</button>' +
          '</div>' +
        '</section>' +
        '<section class="settings-group"><h2>Appearance</h2>' +
          '<div class="theme-block">' +
            '<p class="theme-label">Appearance mode</p>' +
            '<div class="segmented" role="radiogroup" aria-label="Appearance mode">' +
              modeBtn('light', 'sun', 'Light') + modeBtn('dark', 'moon', 'Dark') +
            '</div>' +
          '</div>' +
          row('compact', 'Compact cards', 'Fit more titles in library grids.') +
          row('reduce', 'Reduce motion', 'Limit interface animation.') +
        '</section>' +
        (window.MPV2.onlineSettingsHtml ? window.MPV2.onlineSettingsHtml(sec) : '') +
      '</div>';
  }

  function wirePage(sec, tab, root) {
    // settings toggles (functional, persisted)
    root.querySelectorAll('[data-setting]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-setting');
        var s = getSettings();
        s[id] = !s[id];
        saveSettings(s);
        b.setAttribute('aria-checked', String(!!s[id]));
        toast((s[id] ? 'On · ' : 'Off · ') + b.querySelector('b').textContent);
      });
    });
    // ONLINE PHASE: anime provider switcher (Animation → Settings only).
    if (window.MPV2.wireOnlineSettings) window.MPV2.wireOnlineSettings(sec, root);
    // ONLINE PHASE: hero carousel on the Animation home page.
    if (tab === 'home' && sec.id === 'animation' && window.MPV2.mountHero) {
      window.MPV2.mountHero(sec, root);
    }
    // Recently Watched continue buttons (home + history pages).
    if (tab === 'home' || tab === 'history') wireRecentWatched(root);
    // History page: clear button.
    if (tab === 'history') {
      var clearBtn = root.querySelector('#clearHistory');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        var W = window.MPV2.Watch;
        if (!W || !confirm('Clear your watch history?')) return;
        W.getHistory().slice().forEach(function (e) { W.removeEntry(e.key); });
        render();
        toast('Watch history cleared');
      });
    }
    // ONLINE PHASE: Discover block on the Animation home page.
    if (tab === 'home' && sec.id === 'animation' && window.MPV2.mountDiscoverBlock) {
      window.MPV2.mountDiscoverBlock(sec, root);
    }
    // ONLINE PHASE: live manga block on the Animation Manga tab.
    if (tab === 'manga' && sec.id === 'animation' && window.MPV2.mountMangaBlock) {
      window.MPV2.mountMangaBlock(sec, root);
    }
    // ONLINE PHASE: live Series / Movies / OVAs rows on the Animation Anime tab.
    if (tab === 'anime' && sec.id === 'animation' && window.MPV2.mountAnimeTab) {
      window.MPV2.mountAnimeTab(sec, root);
    }
    // STEP 3: section theme picker (persisted per section; master → both)
    var isMaster = sec.id === 'master';
    function applyAccent(color) {
      if (isMaster) setMasterTheme(color); else setSectionTheme(sec.id, color);
    }
    root.querySelectorAll('[data-accent]').forEach(function (b) {
      b.addEventListener('click', function () {
        applyAccent(b.getAttribute('data-accent'));
        root.querySelectorAll('[data-accent]').forEach(function (o) {
          o.classList.toggle('active', o === b);
        });
        toast(isMaster ? 'Theme updated for both sections' : 'Theme updated for ' + sec.name);
      });
    });
    var cc = root.querySelector('[data-custom-accent]');
    if (cc) cc.addEventListener('input', function () {
      applyAccent(cc.value);
      if (isMaster) toast('Theme updated for both sections');
    });
    var rs = root.querySelector('[data-reset-theme]');
    if (rs) rs.addEventListener('click', function () {
      if (isMaster) {
        var t = getSectionThemes();
        t.animation = DEFAULT_THEME.animation;
        t.movies = DEFAULT_THEME.movies;
        try { localStorage.setItem(LS_THEME, JSON.stringify(t)); } catch (e) {}
        applySectionThemes();
        renderPage(sec, 'settings', root);
        toast('Themes reset for both sections');
        return;
      }
      setSectionTheme(sec.id, DEFAULT_THEME[sec.id]);
      renderPage(sec, 'settings', root);
      toast('Theme reset for ' + sec.name);
    });
    // STEP 4: day / dark mode segmented control
    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-mode');
        setThemeMode(m);
        root.querySelectorAll('[data-mode]').forEach(function (o) {
          var on = o === b;
          o.classList.toggle('active', on);
          o.setAttribute('aria-checked', String(on));
        });
        toast(m === 'light' ? 'Light mode' : 'Dark mode');
      });
    });
    // local files picker (session-only preview of the flow)
    var pick = $('#pickFiles', root), fi = $('#fileInput', root);
    if (pick && fi) {
      pick.addEventListener('click', function () { fi.click(); });
      fi.addEventListener('change', function () {
        var files = Array.prototype.slice.call(fi.files || []);
        $('#fileResults', root).innerHTML = fileRows(files);
        if (files.length) toast(files.length + ' file' + (files.length === 1 ? '' : 's') + ' selected');
      });
    }
    // search input shell — the Animation section searches live online
    // (anime + movies + manga); other sections keep the local shell.
    var si = $('#searchInput', root), cs = $('#clearSearch', root);
    if (si && cs) {
      var searchTimer = null, searchSeq = 0;
      // Lazy check: on a deep-link first render this wiring can run before the
      // online scripts below app.js have executed; by the time the user types,
      // they are always loaded.
      function canOnlineSearch() {
        return sec.id === 'animation' && window.MPV2 &&
          window.MPV2.AnimeAPI && window.MPV2.searchResultsHtml;
      }
      si.addEventListener('input', function () {
        var q = si.value.trim();
        cs.classList.toggle('hidden', !q);
        var box = $('#searchState', root);
        if (!canOnlineSearch()) {
          box.innerHTML = q
            ? emptyState('search', 'Catalogue not connected', '\u201C' + q + '\u201D is ready for the search module.')
            : emptyState('search', 'Search is ready', 'Enter a title to use the search flow.');
          return;
        }
        clearTimeout(searchTimer);
        if (!q) {
          box.innerHTML = emptyState('search', 'Search is ready', 'Search anime, movies and manga.');
          return;
        }
        if (q.length < 3) {
          box.innerHTML = emptyState('search', 'Keep typing', 'Enter at least 3 characters to search.');
          return;
        }
        searchTimer = setTimeout(function () {
          var my = ++searchSeq;
          var API = window.MPV2.AnimeAPI;
          box.innerHTML = '<div class="poster-grid online-grid">' +
            window.MPV2.onlineSkeletons(6) + '</div>';
          API.search(API.getProvider(), q).then(function (res) {
            if (my !== searchSeq || !box.isConnected) return;
            box.innerHTML = window.MPV2.searchResultsHtml(q, res);
          }).catch(function (err) {
            if (my !== searchSeq || !box.isConnected) return;
            box.innerHTML = window.MPV2.onlineErrorHtml(err);
          });
        }, 500);
      });
      cs.addEventListener('click', function () {
        si.value = '';
        si.dispatchEvent(new Event('input'));
        si.focus();
      });
      // Fix the initial hint on deep links once every script has parsed.
      setTimeout(function () {
        var box = $('#searchState', root);
        if (canOnlineSearch() && box && box.isConnected && !si.value &&
            box.innerHTML.indexOf('search flow') !== -1) {
          box.innerHTML = emptyState('search', 'Search is ready', 'Search anime, movies and manga.');
        }
      }, 0);
    }
  }

  // Master settings page (from the landing page) — changes apply to both sections.
  function renderMasterPage() {
    document.title = 'Master settings · Media Player V2';
    var sec = { id: 'master', name: 'Master' };
    var app = $('#app');
    app.innerHTML = '<main class="page">' +
      '<a class="back-link" href="#/">' + icon('arrowLeft') + '<span>Back</span></a>' +
      renderSettings(sec) + '</main>';
    wirePage(sec, 'settings', app.querySelector('.page'));
    window.scrollTo(0, 0);
  }

  /* ============ STEP 7 · CHUNK 1 — navigation motion ============
   * Ported from the hosted preview's motion system: landing card expand →
   * "Opening…" skeleton screen → section; poster → detail ghost; directional
   * tab slides; close-to-landing route fade. Reduced-motion always wins.
   */
  var motion = { busy: false, pending: null, pressTimer: 0 };
  var lastRenderedHash = null;

  function motionDisabled() {
    // The in-app "Reduce motion" toggle is the master switch (preview parity:
    // the reference design always plays its navigation choreography). The
    // OS-level prefers-reduced-motion query is still honored by the CSS
    // media queries, which collapse transition/animation durations.
    return !!getSettings().reduce;
  }
  function nextPaint(fn) {
    if (window.requestAnimationFrame) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }
    else { setTimeout(fn, 32); }
  }
  function setMotionHash(href) {
    var next = href.charAt(0) === '#' ? href : '#' + href;
    if (location.hash === next) { render(); return; }
    location.hash = next;
    setTimeout(function () { if (lastRenderedHash !== next) render(); }, 80);
  }
  function recoverMotionNavigation(href) {
    clearMotion();
    motion.pending = { kind: 'route', direction: 1 };
    motion.busy = true;
    setMotionHash(href);
  }
  function routeDirection(href) {
    var path = href.replace(/^#\/?/, '').split('/');
    var sec = SECTIONS[path[0]];
    var next = path[1] || 'home';
    var cur = parseHash();
    if (!sec || !cur.section || cur.section !== sec.id) return 1;
    var order = sec.tabs.map(function (t) { return t.id; })
      .concat(sec.extras.map(function (t) { return t.id; }));
    var from = order.indexOf(cur.tab), to = order.indexOf(next);
    return (from < 0 || to < 0 || to >= from) ? 1 : -1;
  }

  /* "Opening <Section>" skeleton screen shown while the card expands. */
  function openingScreen(label, tone) {
    var sec = SECTIONS[label === 'Movies' ? 'movies' : 'animation'];
    var el = document.createElement('div');
    el.className = 'opening-screen';
    el.style.setProperty('--opening-tone', tone);
    el.style.setProperty('--tone', tone);
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Opening ' + label);
    el.innerHTML = '<div class="opening-screen-inner">' + shellHtml(sec, 'home') + '</div>';
    var view = el.querySelector('#view');
    if (view) { view.id = 'opening-view'; view.innerHTML = homeHtml(sec); }
    document.body.appendChild(el);
    if (window.requestAnimationFrame) { requestAnimationFrame(function () { el.classList.add('is-visible'); }); }
    else { el.classList.add('is-visible'); }
    return el;
  }

  function startLandingTransition(card, href) {
    if (motion.busy) return;
    motion.busy = true;
    if (motionDisabled()) { motion.pending = { kind: 'route', direction: 1 }; setMotionHash(href); return; }
    var themes = getSectionThemes();
    var rect = card.getBoundingClientRect();
    var clone = card.cloneNode(true);
    var tone = card.classList.contains('anime') ? themes.animation : themes.movies;
    var label = card.classList.contains('anime') ? 'Animation' : 'Movies';
    clone.removeAttribute('href');
    clone.classList.add('transition-choice-clone');
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    document.body.appendChild(clone);
    card.style.opacity = '0';
    var screen = null;
    var sx = window.innerWidth / rect.width, sy = window.innerHeight / rect.height;
    var tx = -rect.left, ty = -rect.top, finished = false;
    setTimeout(function () { if (!finished && clone.isConnected) screen = openingScreen(label, tone); }, 390);
    function finish() {
      if (finished) return;
      finished = true;
      motion.pending = { kind: 'landing', screen: screen, clone: clone, direction: 1 };
      setMotionHash(href);
    }
    try {
      clone.animate([
        { transform: 'translate3d(0,0,0) scale(1)', borderRadius: getComputedStyle(card).borderRadius, filter: 'brightness(1)', offset: 0 },
        { transform: 'translate3d(0,-4px,0) scale(.985)', borderRadius: getComputedStyle(card).borderRadius, filter: 'brightness(1.08)', offset: .16 },
        { transform: 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + sx + ',' + sy + ')', borderRadius: '0px', filter: 'brightness(.48)', offset: 1 }
      ], { duration: 720, easing: 'cubic-bezier(.22,.78,.18,1)', fill: 'forwards' });
      clone.querySelectorAll('.choice-content,.index,.choice-art').forEach(function (el) {
        el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.92)' }],
          { duration: 420, delay: 120, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      });
    } catch (error) {
      clone.style.transition = 'transform 720ms cubic-bezier(.22,.78,.18,1),border-radius 720ms cubic-bezier(.22,.78,.18,1),filter 720ms cubic-bezier(.22,.78,.18,1)';
      clone.querySelectorAll('.choice-content,.index,.choice-art').forEach(function (el) {
        el.style.transition = 'opacity 420ms cubic-bezier(.4,0,1,1),transform 420ms cubic-bezier(.4,0,1,1)';
      });
      nextPaint(function () {
        clone.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + sx + ',' + sy + ')';
        clone.style.borderRadius = '0';
        clone.style.filter = 'brightness(.48)';
        clone.querySelectorAll('.choice-content,.index,.choice-art').forEach(function (el) {
          el.style.opacity = '0'; el.style.transform = 'scale(.92)';
        });
      });
    }
    setTimeout(finish, 760);
  }

  function startRouteTransition(href, direction) {
    if (motion.busy) return;
    motion.busy = true;
    direction = direction || routeDirection(href);
    if (motionDisabled()) { motion.pending = { kind: 'route', direction: direction }; setMotionHash(href); return; }
    var current = document.getElementById('view') || document.querySelector('.landing-inner');
    if (current) {
      try {
        current.animate([
          { opacity: 1, transform: 'translate3d(0,0,0)', filter: 'blur(0)' },
          { opacity: 0, transform: 'translate3d(' + (direction > 0 ? '-26px' : '26px') + ',0,0)', filter: 'blur(5px)' }
        ], { duration: 210, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      } catch (e) { /* fall through to navigation */ }
    }
    setTimeout(function () { motion.pending = { kind: 'route', direction: direction }; setMotionHash(href); }, 190);
  }

  function detailImageFrom(source) {
    return (source.querySelector && source.querySelector('img')) ||
      (source.closest && source.closest('.hero') && source.closest('.hero').querySelector('.hero-feature-poster')) || null;
  }

  function startDetailTransition(source, href) {
    if (motion.busy) return;
    motion.busy = true;
    if (motionDisabled()) { motion.pending = { kind: 'detail', direction: 1 }; setMotionHash(href); return; }
    var image = detailImageFrom(source);
    var rect = image && image.getBoundingClientRect();
    if (!image || !rect || !rect.width) { motion.busy = false; startRouteTransition(href, 1); return; }
    var veil = document.createElement('div');
    var ghost = image.cloneNode(true);
    veil.className = 'route-veil';
    ghost.className = 'detail-transition-ghost';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    document.body.appendChild(veil);
    document.body.appendChild(ghost);
    try {
      veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
      ghost.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }],
        { duration: 180, easing: 'cubic-bezier(.22,.78,.18,1)', fill: 'forwards' });
      var current = document.getElementById('view');
      if (current) current.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: .18, transform: 'scale(.985)', filter: 'blur(5px)' }],
        { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    } catch (e) { /* fall through to navigation */ }
    setTimeout(function () {
      motion.pending = { kind: 'detail', ghost: ghost, veil: veil, rect: rect, direction: 1 };
      setMotionHash(href);
    }, 190);
  }

  function clearMotion() {
    document.querySelectorAll('.transition-choice-clone,.opening-screen,.route-veil,.detail-transition-ghost')
      .forEach(function (el) { el.remove(); });
  }

  function runMotionArrival() {
    var pending = motion.pending;
    motion.pending = null;
    if (!pending) { motion.busy = false; return; }
    var target = document.getElementById('view') || document.querySelector('.landing-inner');

    if (pending.kind === 'landing') {
      if (target && !motionDisabled()) {
        try {
          target.animate([
            { opacity: 0, transform: 'translate3d(0,22px,0) scale(.99)', filter: 'blur(10px)' },
            { opacity: 1, transform: 'none', filter: 'none' }
          ], { duration: 620, delay: 90, easing: 'cubic-bezier(.22,.78,.18,1)', fill: 'both' });
        } catch (e) { /* static arrival */ }
      }
      setTimeout(function () {
        if (pending.screen) {
          pending.screen.classList.add('is-resolving');
          setTimeout(function () { pending.screen.remove(); }, 380);
        }
        if (pending.clone) pending.clone.remove();
        motion.busy = false;
      }, 420);
      return;
    }

    if (pending.kind === 'detail' && pending.ghost) {
      var poster = document.getElementById('detailPoster');
      function settle() {
        poster.style.opacity = '';
        pending.ghost.remove();
        if (pending.veil) pending.veil.remove();
        motion.busy = false;
      }
      if (poster) {
        poster.style.opacity = '0';
        nextPaint(function () {
          var to = poster.getBoundingClientRect();
          try {
            pending.ghost.animate([
              { left: pending.rect.left + 'px', top: pending.rect.top + 'px', width: pending.rect.width + 'px', height: pending.rect.height + 'px', borderRadius: '14px', transform: 'scale(1.035)' },
              { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px', borderRadius: getComputedStyle(poster).borderRadius, transform: 'scale(1)' }
            ], { duration: 620, easing: 'cubic-bezier(.22,.78,.18,1)', fill: 'forwards' })
              .finished.then(settle).catch(settle);
            var copy = document.querySelector('.detail-copy');
            if (copy) copy.animate([{ opacity: 0, transform: 'translate3d(28px,0,0)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
              { duration: 580, delay: 120, easing: 'cubic-bezier(.22,.78,.18,1)', fill: 'both' });
            if (pending.veil) pending.veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 440, delay: 160, easing: 'ease', fill: 'forwards' });
          } catch (e) { settle(); }
        });
        return;
      }
      settle();
      return;
    }

    if (target && !motionDisabled()) {
      var dx = (pending.direction || 1) > 0 ? 30 : -30;
      target.classList.add('view-motion-stage');
      try {
        target.animate([
          { opacity: 0, transform: 'translate3d(' + dx + 'px,0,0) scale(.995)', filter: 'blur(7px)' },
          { opacity: 1, transform: 'none', filter: 'none' }
        ], { duration: 480, easing: 'cubic-bezier(.22,.78,.18,1)', fill: 'both' })
          .finished.then(function () { target.classList.remove('view-motion-stage'); motion.busy = false; })
          .catch(function () { target.classList.remove('view-motion-stage'); motion.busy = false; });
      } catch (e) { target.classList.remove('view-motion-stage'); motion.busy = false; }
    } else { motion.busy = false; }
  }

  /* Swipe between tabs on touch devices (preview parity). */
  function wireSwipeTabs(sec, tab) {
    var view = document.getElementById('view');
    var order = sec.tabs.map(function (t) { return t.id; });
    var index = order.indexOf(tab);
    var startX = 0, startY = 0, startTarget = null;
    if (!view || index < 0) return;
    view.addEventListener('touchstart', function (e) {
      startTarget = e.target;
      var touch = e.changedTouches[0];
      startX = touch.clientX; startY = touch.clientY;
    }, { passive: true });
    view.addEventListener('touchend', function (e) {
      if (!startTarget || startTarget.closest('[data-poster-rail],input,textarea,video,[role="dialog"]')) return;
      // Never hijack a swipe that begins inside a horizontally scrollable
      // strip (Top 10 carousel, episode strips, poster rails, chip rows):
      // that gesture belongs to the strip, not to tab navigation.
      for (var el = startTarget; el && el !== view; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 8) {
          var ox = '';
          try { ox = getComputedStyle(el).overflowX; } catch (err) {}
          if (ox === 'auto' || ox === 'scroll') return;
        }
      }
      var touch = e.changedTouches[0];
      var dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      var next = index + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= order.length) return;
      startRouteTransition('#/' + sec.id + '/' + order[next], dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* One global delegated handler drives every in-app navigation. */
  function wireMotionNavigation() {
    document.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var link = e.target.closest && e.target.closest('a[href^="#/"]');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!href || href === location.hash) return;
      e.preventDefault();
      if (motion.busy) { recoverMotionNavigation(href); return; }
      if (link.classList.contains('choice')) startLandingTransition(link, href);
      else if (href.indexOf('/detail/') > -1) startDetailTransition(link, href);
      else startRouteTransition(href);
    });
    // Tactile press feedback on cards (preview parity).
    document.addEventListener('pointerdown', function (e) {
      var target = e.target.closest && e.target.closest('.poster-card,.choice');
      if (!target || motionDisabled()) return;
      target.classList.add('motion-pressed');
      clearTimeout(motion.pressTimer);
      function release() {
        target.classList.remove('motion-pressed');
        window.removeEventListener('pointerup', release, true);
        window.removeEventListener('pointercancel', release, true);
      }
      window.addEventListener('pointerup', release, true);
      window.addEventListener('pointercancel', release, true);
      motion.pressTimer = setTimeout(release, 650);
    }, true);
  }

  /* ---------------- boot ---------------- */
  function render() {
    var r = parseHash();
    lastRenderedHash = location.hash || '#/';
    if (r.view === 'landing') { renderLanding(); }
    else if (r.view === 'master') { renderMasterPage(); }
    else {
      var sec = SECTIONS[r.section];
      try { localStorage.setItem(LS_SECTION, sec.id); } catch (e) {}
      if (r.view === 'detail') { renderDetail(sec, r.item); }
      else if (r.view === 'onlinedetail') { window.MPV2.renderOnlineDetail(r.section, r.provider, r.id, r.mediaType); }
      else if (r.view === 'onlinecharacter') { window.MPV2.renderOnlineCharacter(r.section, r.provider, r.id, r.name); }
      else { renderShell(sec, r.tab); }
    }
    // STEP 7 · CHUNK 1: consume any pending motion arrival.
    if (motion.pending) { runMotionArrival(); }
    wirePosterPreviews(); // STEP 7 · CHUNK 5: hover ambient previews
  }

  saveSettings(getSettings());
  applySectionThemes(); // STEP 3: restore per-section accent colors
  applyThemeMode(getThemeMode()); // STEP 4: restore day/dark mode
  // Opening-theme videos: serve them from the on-device cache when possible.
  // Falls back gracefully (remote URLs) where service workers can't run.
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  } catch (e) {}
  window.addEventListener('hashchange', render);
  wireMotionNavigation(); // STEP 7 · CHUNK 1: delegated navigation motion
  render();
  window.MPV2.render = render;
  window.MPV2.toast = toast;
  // ONLINE PHASE: helpers the Discover module renders with.
  window.MPV2.esc = esc;
  window.MPV2.pageHead = pageHead;
  window.MPV2.icon = icon;
  window.MPV2.emptyState = emptyState;
  window.MPV2.motion = motion; // STEP 7: test/debug handle for the motion system
})();
