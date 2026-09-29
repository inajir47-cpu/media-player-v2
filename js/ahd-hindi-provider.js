// AnimeHindiDubbed.in — Hindi provider #3
// Flow: search -> detail (serverVideos: filemoon/servabyss/vidgroud) ->
//       servabyss = abyssplayer.com embed -> page's `datas` blob ->
//       AES-256-CTR decrypt (key = MD5-hex of "user_id:slug:md5_id") ->
//       direct MP4 URLs (served with Referer: https://abyssplayer.com/)
//
// Everything runs in the phone's browser through the backend proxy
// (/api/stream/r), which forwards the Referer the CDN requires.
//
// Public API:
//   h3Search(q)        -> Promise<[{title, slug, url}]>
//   h3HasEpisode(title, n) -> Promise<boolean>
//   h3Watch(title, n)  -> Promise<{stream, subtitles, audioTracks}>
(function () {
'use strict';

var AHD = 'https://animehindidubbed.in';
var ABYSS_REF = 'https://abyssplayer.com/';

/* ---------- compact MD5 (hex output) ---------- */
function h3md5(str) {
  function rr(v, s) { return (v << s) | (v >>> (32 - s)); }
  var k = [], i;
  for (i = 0; i < 64; i++) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  }
  var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476;
  var bytes = new TextEncoder().encode(str);
  var bitLen = bytes.length * 8;
  var withOne = bytes.length + 1;
  var padLen = withOne % 64 <= 56 ? 56 - (withOne % 64) : 120 - (withOne % 64);
  var msg = new Uint8Array(bytes.length + 1 + padLen + 8);
  msg.set(bytes); msg[bytes.length] = 0x80;
  var dv = new DataView(msg.buffer);
  dv.setUint32(msg.length - 8, bitLen >>> 0, true);
  dv.setUint32(msg.length - 4, Math.floor(bitLen / 4294967296), true);
  var w = new Array(16);
  var sArr = [7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
              5,9,14,20, 5,9,14,20, 5,9,14,20, 5,9,14,20,
              4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
              6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21];
  for (var off = 0; off < msg.length; off += 64) {
    for (i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, true);
    var a = h0, b = h1, c = h2, d = h3, f, g;
    for (i = 0; i < 64; i++) {
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      f = (f + a + k[i] + w[g]) >>> 0;
      a = d; d = c; c = b;
      b = (b + rr(f, sArr[i])) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
  }
  function hex(v) {
    var s = '';
    for (var j = 0; j < 4; j++) {
      var b2 = (v >>> (j * 8)) & 255;
      s += ('0' + b2.toString(16)).slice(-2);
    }
    return s;
  }
  return hex(h0) + hex(h1) + hex(h2) + hex(h3);
}

/* ---------- abyssplayer AES-256-CTR decrypt (ported from their player) ---------- */
function h3AbyssDecrypt(mediaStr, keyStr) {
  var keyBytes = new TextEncoder().encode(h3md5(keyStr)); // 32 ASCII bytes
  return crypto.subtle.importKey('raw', keyBytes,
    { name: 'AES-CTR', length: 128 }, false, ['decrypt']).then(function (key) {
    var data = new Uint8Array(mediaStr.length), i;
    for (i = 0; i < mediaStr.length; i++) data[i] = mediaStr.charCodeAt(i) & 255;
    return crypto.subtle.decrypt(
      { name: 'AES-CTR', counter: keyBytes.slice(0, 16), length: 128 }, key, data);
  }).then(function (plain) {
    return JSON.parse(new TextDecoder().decode(plain));
  });
}

function h3Doc(html) {
  try { return new DOMParser().parseFromString(html, 'text/html'); }
  catch (e) { return null; }
}
function h3Get(url, referer) {
  // hiProxyX is overridden in stream.js to always route via /api/stream/r
  var proxied = (typeof window.hiProxyX === 'function')
    ? window.hiProxyX(url, referer || AHD + '/')
    : url;
  return window.dmGetText(proxied, 25000);
}

/* ---------- search ---------- */
function h3Search(q) {
  return h3Get(AHD + '/?s=' + encodeURIComponent(q)).then(function (html) {
    var doc = h3Doc(html), out = [];
    if (!doc) return out;
    Array.prototype.forEach.call(doc.querySelectorAll('h2 a[href]'), function (a) {
      var href = a.getAttribute('href') || '';
      if (href.indexOf('animehindidubbed.in/') < 0) return;
      var title = (a.textContent || '').trim();
      if (!title) return;
      out.push({ title: title, url: href.split('?')[0].replace(/\/$/, '') });
    });
    return out;
  }, function () { return []; });
}

/* ---------- detail: extract serverVideos ---------- */
function h3ExtractServerVideos(html) {
  var m = html.match(/(?:(?:const|var|let)\s+)?serverVideos\s*=\s*\{/);
  if (!m) return null;
  var i = m.index + m[0].length - 1, depth = 0, inStr = false, esc = false;
  for (; i < html.length; i++) {
    var c = html.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) break; }
    }
  }
  if (depth !== 0) return null;
  // serverVideos is a JS object literal, not strict JSON: quote bare keys
  // and strip trailing commas before parsing.
  var js = html.slice(m.index + m[0].length - 1, i + 1)
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(js); }
  catch (e) { return null; }
}
function h3ParseEpName(name) {
  var s = String(name || '').trim(), m;
  if ((m = /^S(\d+)E(\d+)$/i.exec(s))) {
    return { season: parseInt(m[1], 10), number: parseInt(m[2], 10) };
  }
  if ((m = /^(\d+)$/.exec(s))) {
    return { season: 1, number: parseInt(m[1], 10) };
  }
  return null;
}
function h3Detail(pageUrl) {
  return h3Get(pageUrl).then(function (html) {
    var sv = h3ExtractServerVideos(html);
    var doc = h3Doc(html), h1 = doc && doc.querySelector('h1');
    var out = { title: h1 ? h1.textContent.trim() : '', episodes: [] };
    if (!sv) return out;
    // Prefer servabyss (abyssplayer, cracked). Fall back to filemoon order.
    var list = (sv.servabyss && sv.servabyss.length) ? sv.servabyss
             : (sv.filemoon && sv.filemoon.length) ? sv.filemoon : [];
    list.forEach(function (it) {
      if (!it || !it.url || it.url.indexOf('abyssplayer.com/') < 0) return;
      var p = h3ParseEpName(it.name);
      if (!p) return;
      out.episodes.push({ season: p.season, number: p.number, url: it.url });
    });
    return out;
  });
}

/* ---------- title matching (mirrors stream.js hindiMatch) ---------- */
function h3Norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function h3Score(q, t) {
  var nq = h3Norm(q), nt = h3Norm(t);
  if (!nq || !nt) return 0;
  if (nt === nq) return 100;
  var qw = nq.split(' '), tw = {};
  nt.split(' ').forEach(function (w) { tw[w] = 1; });
  var hit = 0;
  qw.forEach(function (w) { if (w.length > 2 && tw[w]) hit++; });
  if (nt.indexOf(nq) === 0 || nq.indexOf(nt) === 0) return 70;
  if (hit >= 2 && hit >= qw.length - 1) return 50;
  if (nt.indexOf(nq) >= 0 || nq.indexOf(nt) >= 0) return 25;
  return 0;
}
var h3MatchCache = {};
function h3Match(title) {
  var k = h3Norm(title);
  if (!h3MatchCache[k]) {
    h3MatchCache[k] = h3Search(title).then(function (rs) {
      var best = null, bestScore = 0;
      (rs || []).forEach(function (r) {
        var s = h3Score(title, r.title);
        if (s > bestScore) { bestScore = s; best = r; }
      });
      var m = bestScore >= 25 ? best : null;
      if (!m) setTimeout(function () { delete h3MatchCache[k]; }, 30000);
      return m;
    }, function () { setTimeout(function () { delete h3MatchCache[k]; }, 30000); return null; });
  }
  return h3MatchCache[k];
}
var h3DetailCache = {};
function h3CachedDetail(url) {
  if (!h3DetailCache[url]) {
    h3DetailCache[url] = h3Detail(url).then(function (d) { return d; },
      function () { return null; });
  }
  return h3DetailCache[url];
}
function h3FindEp(eps, n) {
  var i, e, fallback = null;
  for (i = 0; i < eps.length; i++) {
    e = eps[i];
    if (e.number === n) {
      if (e.season === 1) return e;
      if (!fallback) fallback = e;
    }
  }
  return fallback;
}

/* ---------- public API ---------- */
function h3HasEpisode(title, n) {
  return h3Match(title).then(function (m) {
    if (!m) return false;
    return h3CachedDetail(m.url).then(function (d) {
      return !!(d && h3FindEp(d.episodes, n));
    });
  });
}
function h3Watch(title, n) {
  return h3Match(title).then(function (m) {
    if (!m) throw new Error('Hindi-3 source not found for this title');
    return h3CachedDetail(m.url).then(function (d) {
      var e = d && h3FindEp(d.episodes, n);
      if (!e) throw new Error('This episode has no Hindi-3 stream');
      return h3Get(e.url, ABYSS_REF).then(function (html) {
        var dm = html.match(/const\s+datas\s*=\s*"((?:[^"\\]|\\.)*)"/);
        if (!dm) throw new Error('Hindi-3 player data not found');
        var obj = JSON.parse(atob(JSON.parse('"' + dm[1] + '"')));
        if (!obj || !obj.media) throw new Error('Hindi-3 media missing');
        var keyStr = obj.user_id + ':' + obj.slug + ':' + obj.md5_id;
        return h3AbyssDecrypt(obj.media, keyStr).then(function (data) {
          var fds = (data && data.mp4 && data.mp4.fristDatas) || [];
          var best = null, i;
          for (i = 0; i < fds.length; i++) {
            if (fds[i] && fds[i].url && (!best || (fds[i].size || 0) > (best.size || 0))) best = fds[i];
          }
          if (!best) throw new Error('Hindi-3 has no playable file');
          // The CDN requires Referer: abyssplayer.com — the backend proxy
          // injects it via xreferer (the phone browser cannot spoof it).
          var stream = window.hiProxyX(best.url, ABYSS_REF);
          return { stream: stream, subtitles: [], audioTracks: [],
                   hindiMp4: true, label: best.label || '' };
        });
      });
    });
  });
}

window.h3Search = h3Search;
window.h3HasEpisode = h3HasEpisode;
window.h3Watch = h3Watch;
})();
