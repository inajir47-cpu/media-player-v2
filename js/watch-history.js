/* Media Player V2 — watch history + online watchlist (device-local).
 * Tracks what the user watches from the streaming detail pages:
 * which title, which episode, and how far (position/duration).
 * Also stores the online watchlist (Save to Watchlist on detail pages).
 * Everything lives in localStorage; nothing leaves the device. */
(function () {
  'use strict';

  var LS_HISTORY = 'mpv2_watch_history_v1';
  var LS_WL = 'mpv2_online_watchlist_v1';
  var MAX_HISTORY = 60;

  function read(key, fb) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return (v === null || v === undefined) ? fb : v;
    } catch (e) { return fb; }
  }
  function write(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }
  function notify() {
    try { document.dispatchEvent(new CustomEvent('mpv2:history')); } catch (e) {}
  }

  /* ---------- history ---------- */
  // entry: { key, kind:'anime'|'movie', title, poster, href,
  //          provider, pid, anilistId, season, episode,
  //          position (sec), duration (sec), lang, updatedAt }
  function getHistory() {
    var h = read(LS_HISTORY, []);
    return Array.isArray(h) ? h : [];
  }
  function keyFor(ctx) {
    ctx = ctx || {};
    if (ctx.anilistId) return 'anilist:' + ctx.anilistId;
    var t = String(ctx.title || '').toLowerCase().trim();
    return 't:' + (t || 'unknown');
  }
  function upsert(entry) {
    if (!entry || !entry.key) return;
    entry.updatedAt = Date.now();
    var h = getHistory().filter(function (e) { return e && e.key !== entry.key; });
    h.unshift(entry);
    write(LS_HISTORY, h.slice(0, MAX_HISTORY));
    notify();
  }
  function getEntry(key) {
    var h = getHistory();
    for (var i = 0; i < h.length; i++) if (h[i] && h[i].key === key) return h[i];
    return null;
  }
  function removeEntry(key) {
    write(LS_HISTORY, getHistory().filter(function (e) { return e && e.key !== key; }));
    notify();
  }
  function isDone(e) {
    return !!e && e.duration > 0 && (e.position / e.duration) >= 0.92;
  }
  // entries for one home section: movies -> movies, everything else -> anime
  function recentForSection(secId) {
    var wantMovie = secId === 'movies';
    return getHistory().filter(function (e) {
      return wantMovie ? e.kind === 'movie' : e.kind !== 'movie';
    }).slice(0, 20);
  }

  /* ---------- online watchlist ---------- */
  // item: { key, kind, title, poster, href, provider, pid, addedAt }
  function getWatchlist() {
    var l = read(LS_WL, []);
    return Array.isArray(l) ? l : [];
  }
  function isSaved(key) {
    return getWatchlist().some(function (it) { return it && it.key === key; });
  }
  // returns true when the item is now saved
  function toggleWatchlist(item) {
    var l = getWatchlist(), found = false;
    l = l.filter(function (it) {
      if (it && it.key === item.key) { found = true; return false; }
      return true;
    });
    if (!found) {
      item.addedAt = Date.now();
      l.unshift(item);
    }
    write(LS_WL, l);
    notify();
    return !found;
  }

  /* ---------- formatting ---------- */
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function p(n) { return String(n).padStart(2, '0'); }
    return h ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
  }
  function fmtLeft(e) {
    if (!e || !(e.duration > 0)) return '';
    var left = Math.max(0, e.duration - e.position);
    if (left < 60) return 'less than a minute left';
    var mins = Math.round(left / 60);
    return mins >= 60
      ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm left'
      : mins + ' min left';
  }
  function progressPct(e) {
    if (!e || !(e.duration > 0)) return 0;
    return Math.min(100, Math.round((e.position / e.duration) * 100));
  }

  window.MPV2 = window.MPV2 || {};
  window.MPV2.Watch = {
    keyFor: keyFor,
    getHistory: getHistory,
    upsert: upsert,
    getEntry: getEntry,
    removeEntry: removeEntry,
    isDone: isDone,
    recentForSection: recentForSection,
    getWatchlist: getWatchlist,
    isSaved: isSaved,
    toggleWatchlist: toggleWatchlist,
    fmtClock: fmtClock,
    fmtLeft: fmtLeft,
    progressPct: progressPct
  };
})();
