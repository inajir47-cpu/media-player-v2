/* Media Player V2 — Android back-button handler (APK only).
 * The native MainActivity calls window.__mpv2BackPressed() on every
 * hardware/gesture back press and acts on the return value:
 *   true   -> press was consumed in-app (do nothing natively)
 *   'exit' -> user confirmed exit on the root page (finish the activity)
 *   falsy  -> JS not ready; fall back to default WebView behavior
 *
 * Priority: close the topmost overlay first, then in-app history,
 * then double-press-to-exit on the root home page.
 * The video player is intentionally NOT closed here: stream.js already
 * minis it on back via its own popstate handler, and that is preserved.
 */
(function () {
  'use strict';

  var EXIT_WINDOW_MS = 2500;
  var lastBackAt = 0;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function toast(msg) {
    try {
      if (window.MPV2 && typeof window.MPV2.toast === 'function') window.MPV2.toast(msg);
    } catch (e) {}
  }

  function unlockScroll() {
    try {
      if (window.MPV2 && typeof window.MPV2.unlockBodyScroll === 'function') window.MPV2.unlockBodyScroll();
      else document.body.style.overflow = '';
    } catch (e) {}
  }

  // Returns true when an overlay was closed.
  function closeTopOverlay() {
    var ec = $('.ext-confirm'); // external-link confirm — always topmost
    if (ec) {
      var ok = $('.ext-confirm-cancel', ec);
      if (ok) { ok.click(); return true; }
    }
    if ($('.md-reader')) { // manga reader (fullscreen)
      try {
        if (window.MPV2 && window.MPV2.MangaReader) { window.MPV2.MangaReader.close(); return true; }
      } catch (e) {}
    }
    var mm = document.getElementById('moreModal'); // app.js modals
    if (mm) { mm.remove(); unlockScroll(); return true; }
    var rm = document.getElementById('ratingModal');
    if (rm) { rm.remove(); unlockScroll(); return true; }
    var scrim = $('.st-scrim'); // provider dialog, anime popups, adult warn
    if (scrim) {
      // Every module wires its own X to its own close fn — click it.
      var x = $('.st-x', scrim);
      if (x) { x.click(); return true; }
      var cancel = $('[data-aw-cancel]', scrim);
      if (cancel) { cancel.click(); return true; }
      scrim.remove(); unlockScroll(); return true;
    }
    return false;
  }

  function isRootHome() {
    var h = location.hash || '#/';
    return h === '#/' || h === '#';
  }

  window.__mpv2BackPressed = function () {
    if (closeTopOverlay()) return true;
    // In-app navigation. The player minis itself on back through
    // stream.js's popstate handler — that behavior is preserved.
    if (!isRootHome()) { history.back(); return true; }
    // Root home: require a double press to exit.
    var now = Date.now();
    if (now - lastBackAt < EXIT_WINDOW_MS) { lastBackAt = 0; return 'exit'; }
    lastBackAt = now;
    toast('Press back again to exit');
    return true;
  };
})();
