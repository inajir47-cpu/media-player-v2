// codedew.com (Rare Animes India) — Hindi provider #2
// Flow: search -> detail (episodes with ?url= tokens) -> zipper redirect ->
//       argon.razorshell.space/embed/<id> -> _juicycodes decode -> signed m3u8
//
// Everything runs in the phone's browser (codedew blocks datacenter IPs,
// and signed stream URLs are IP-locked to the resolving client).
//
// Public API (mirrors kanasu-hindi-provider.js):
//   cdSearch(q) -> Promise<[{title,slug,...}>]
//   cdDetail(slug) -> Promise<{episodes:[...]} >
//   cdWatch(slug, ep) -> Promise<{stream,...}>

(function () {
'use strict';

var CODEDEW = 'https://codedew.com';
var EMBED_HOST = 'https://argon.razorshell.space';

/* ---------- _juicycodes decoder (ported from xre000001-ai/raretoons-stremio) ---------- */
var JUICY_ALPHABET = ['`', '%', '-', '+', '*', '$', '!', '_', '^', '='];

function juicyDecode(payload) {
  // 1. salt = int(concat of (ord(c) - 100) for last 3 chars)
  var tail = payload.slice(-3);
  var saltStr = '';
  for (var i = 0; i < 3; i++) saltStr += String(tail.charCodeAt(i) - 100);
  var salt = parseInt(saltStr, 10);
  // 2. body = base64url-decode of payload[:-3]
  var b64 = payload.slice(0, -3).replace(/_/g, '+').replace(/-/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin;
  try { bin = atob(b64); } catch (e) { throw new Error('juicy: bad base64'); }
  // 3. digits = index of each char in the 10-symbol alphabet
  var digits = '';
  for (var j = 0; j < bin.length; j++) {
    var idx = JUICY_ALPHABET.indexOf(bin.charAt(j));
    if (idx < 0) throw new Error('juicy: bad alphabet char');
    digits += String(idx);
  }
  // 4. every 4-digit group g -> chr(int(g) % 1000 - salt)
  var out = '';
  for (var k = 0; k + 4 <= digits.length; k += 4) {
    var g = digits.substr(k, 4);
    out += String.fromCharCode((parseInt(g, 10) % 1000) - salt);
  }
  return out;
}

function juicyExtract(html) {
  // _juicycodes("chunk"+"chunk"+...)
  var re = /_juicycodes\(\s*((?:"[^"]*"\s*\+?\s*)+)\)/g;
  var m, out = [];
  while ((m = re.exec(html)) !== null) {
    // concatenate the string literals
    var payload = '';
    var litRe = /"([^"]*)"/g, lm;
    while ((lm = litRe.exec(m[1])) !== null) {
      payload += lm[1].replace(/\\\//g, '/');
    }
    if (payload) {
      try { out.push(juicyDecode(payload)); } catch (e) { /* skip bad payload */ }
    }
  }
  return out;
}

/* ---------- helpers ---------- */
function cdGetText(url, timeoutMs) {
  var ms = timeoutMs || 25000;
  return new Promise(function (res, rej) {
    var to = setTimeout(function () { rej(new Error('Request timed out')); }, ms);
    fetch(url, { redirect: 'follow' }).then(function (r) {
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(res, function (e) { clearTimeout(to); rej(e); });
  });
}
function cdDoc(html) {
  try { return new DOMParser().parseFromString(html, 'text/html'); }
  catch (e) { return null; }
}
function normTitle(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------- search ---------- */
// codedew.com search: /?s=<query> (WordPress-style). Returns cards linking to
// /multiquality/?url=<token> for episodes or series pages.
function cdSearch(q) {
  var url = CODEDEW + '/?s=' + encodeURIComponent(q);
  return cdGetText(url).then(function (html) {
    var doc = cdDoc(html), out = [], seen = {};
    if (!doc) return out;
    doc.querySelectorAll('a[href*="codedew.com"]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (seen[href]) return;
      seen[href] = 1;
      var title = (a.getAttribute('title') || a.textContent || '').trim();
      if (!title || title.length < 2) return;
      // Skip nav links
      if (/^\s*(Home|Movies|Series|Anime|Contact|DMCA|Privacy)/i.test(title)) return;
      out.push({ title: title, href: href });
    });
    return out;
  }, function () { return []; });
}

/* ---------- detail: given a series page URL, list episodes ---------- */
// The multiquality pages list episodes as S1 E1 style links with ?url= tokens.
function cdEpisodes(pageUrl) {
  return cdGetText(pageUrl).then(function (html) {
    var doc = cdDoc(html), eps = [], seen = {};
    if (!doc) return eps;
    doc.querySelectorAll('a[href*="?url="]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (seen[href]) return;
      seen[href] = 1;
      var label = (a.textContent || '').trim();
      // Parse "S2 E1" / "E5" style labels
      var m = label.match(/S(\d+)\s*E(\d+)/i) || label.match(/E(\d+)/i);
      var season = m && m[2] ? parseInt(m[1], 10) : 1;
      var ep = m ? parseInt(m[m[2] ? 2 : 1], 10) : null;
      if (!ep) return;
      // Absolute URL
      try { href = new URL(href, pageUrl).toString(); } catch (e) {}
      eps.push({ season: season, number: ep, label: label, url: href });
    });
    eps.sort(function (a, b) {
      return (a.season - b.season) || (a.number - b.number);
    });
    return eps;
  });
}

/* ---------- watch: token -> short id -> embed -> decode -> m3u8 ---------- */
function cdResolveToken(episodeUrl) {
  // Step 1: fetch the episode page (zipper or multiquality). The zipper
  // endpoint 302-redirects to /multiquality/?url=<shortId>.
  // fetch() follows redirects; we read the final URL.
  return fetch(episodeUrl, { redirect: 'follow' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var finalUrl = r.url;
    var m = finalUrl.match(/[?&]url=([A-Za-z0-9]+)/);
    if (!m) throw new Error('No video ID in redirect');
    return { fileId: m[1], html: null, finalUrl: finalUrl };
  }).then(function (st) {
    // Step 2: fetch the multiquality page to confirm, then the embed page.
    // The multiquality HTML embeds: <iframe src="https://argon.razorshell.space/embed/<id>">
    return cdGetText(st.finalUrl).then(function (html) {
      var m = html.match(/argon\.razorshell\.space\/embed\/([A-Za-z0-9]+)/);
      var fid = m ? m[1] : st.fileId;
      return { fileId: fid };
    });
  });
}

function cdExtractM3u8(embedHtml) {
  var decoded = juicyExtract(embedHtml);
  for (var i = 0; i < decoded.length; i++) {
    // Unescape \/ -> / before matching
    var clean = decoded[i].replace(/\\\//g, '/');
    var m = clean.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/);
    if (m) return m[0];
  }
  // Fallback: plain m3u8 in HTML
  var m2 = embedHtml.replace(/\\\//g, '/').match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/);
  return m2 ? m2[0] : null;
}

function cdWatch(episodeUrl) {
  var referer = null;
  return cdResolveToken(episodeUrl).then(function (st) {
    var embedUrl = EMBED_HOST + '/embed/' + st.fileId;
    referer = embedUrl;
    return cdGetText(embedUrl);
  }).then(function (embedHtml) {
    var m3u8 = cdExtractM3u8(embedHtml);
    if (!m3u8) throw new Error('Could not extract stream URL');
    return { url: m3u8, type: 'hls', referer: referer };
  });
}

/* ---------- hls.js custom loader: fetch with the embed-page Referer ----------
   The JuicyCodes CDN requires the player-page Referer on every request
   (master, variant, segments, keys). Browsers forbid setting the Referer
   header manually, but the fetch() `referrer` option is allowed. */
function cdHlsConfig(referer) {
  if (!window.Hls) return {};
  var BaseLoader = window.Hls.DefaultConfig.loader;
  function RefererLoader(config) {
    BaseLoader.call(this, config);
  }
  RefererLoader.prototype = Object.create(BaseLoader.prototype);
  RefererLoader.prototype.constructor = RefererLoader;
  RefererLoader.prototype.loadInternal = function (context, config, callbacks) {
    var self = this;
    // Use fetch with referrer; fall back to XHR on failure
    fetch(context.url, { referrer: referer }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var stats = { trequest: performance.now(), tfirst: performance.now(),
        tload: performance.now(), loaded: buf.byteLength, total: buf.byteLength };
      callbacks.onSuccess({ url: context.url, data: buf }, stats, context);
    }).catch(function (e) {
      // Fall back to the default XHR loader
      BaseLoader.prototype.loadInternal.call(self, context, config, callbacks);
    });
  };
  return {
    pLoader: RefererLoader,
    fLoader: RefererLoader,
    maxBufferLength: 30
  };
}

/* ---------- high-level: match title -> find series -> episode -> stream ---------- */
var cdMatchCache = {};
function cdMatch(title) {
  var k = normTitle(title);
  if (!cdMatchCache[k]) {
    cdMatchCache[k] = cdSearch(title).then(function (rs) {
      // Pick the best title match
      var nq = normTitle(title), best = null, bestScore = 0;
      (rs || []).forEach(function (r) {
        var nt = normTitle(r.title), s = 0;
        if (nt === nq) s = 100;
        else if (nt.indexOf(nq) === 0 || nq.indexOf(nt) === 0) s = 70;
        else if (nt.indexOf(nq) >= 0 || nq.indexOf(nt) >= 0) s = 40;
        else {
          var qw = nq.split(' '), hit = 0;
          var tw = {};
          nt.split(' ').forEach(function (w) { tw[w] = 1; });
          qw.forEach(function (w) { if (w.length > 2 && tw[w]) hit++; });
          if (hit >= 2 && hit >= qw.length - 1) s = 50;
        }
        if (s > bestScore) { bestScore = s; best = r; }
      });
      return bestScore >= 40 ? best : null;
    }, function () { return null; });
  }
  return cdMatchCache[k];
}

function cdHasEpisode(title, n) {
  return cdMatch(title).then(function (m) {
    if (!m) return false;
    return cdEpisodes(m.href).then(function (eps) {
      return eps.some(function (e) { return e.number === n; });
    }, function () { return false; });
  });
}

function cdWatchEp(title, n) {
  return cdMatch(title).then(function (m) {
    if (!m) throw new Error('Hindi-2 source not found for this title');
    return cdEpisodes(m.href).then(function (eps) {
      var e = null;
      for (var i = 0; i < eps.length; i++) {
        if (eps[i].number === n) { e = eps[i]; break; }
      }
      if (!e) throw new Error('This episode has no Hindi-2 stream');
      return cdWatch(e.url);
    });
  }).then(function (src) {
    return { stream: src.url, subtitles: [], audioTracks: [],
      animeId: 'hindi2:' + title, ep: n, _direct: true, _referer: src.referer };
  });
}

/* ---------- public ---------- */
window.cdSearch = cdSearch;
window.cdDetail = cdEpisodes;
window.cdWatchEp = cdWatchEp;
window.cdHasEpisode = cdHasEpisode;
window.cdHlsConfig = cdHlsConfig;
window.CD_JUICY = { decode: juicyDecode, extract: juicyExtract };

})();
