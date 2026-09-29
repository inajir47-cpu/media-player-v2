/**
 * MPV2 HLS Proxy Worker (Cloudflare Workers, free tier)
 * -------------------------------------------------------
 * Proxies HLS playlists (.m3u8) and media segments (.ts/.m4s/.mp4/.key)
 * so video sites see Cloudflare's IP instead of your server's IP.
 *
 * Usage:
 *   https://<your-worker>.workers.dev/hls?d=<base64url-of-target-url>
 *   https://<your-worker>.workers.dev/hls?u=<base64url-of-target-url>
 *
 * Example:
 *   const target = 'https://cdn.example.com/video/master.m3u8';
 *   const proxied = workerUrl + '/hls?d=' + b64url(target);
 *   player.load(proxied);   // hls.js plays it directly
 *
 * Deploy: Cloudflare dashboard -> Workers & Pages -> Create Worker ->
 * paste this file -> Deploy. Free tier = 100k requests/day.
 */

// base64url decode (accepts standard base64 too)
function b64dec(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64encUrl(url) {
  const bytes = new TextEncoder().encode(url);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url -> raw bytes (for the XOR playlist key in ?k=). */
function b64decBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * XOR-decrypt a base64 ciphertext with key bytes (FlixCloud playlist
 * encryption). Returns the plaintext string, or null on failure.
 */
function xorDecryptPlaylist(b64Text, keyBytes) {
  try {
    const bin = atob(String(b64Text || '').trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
    }
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < out.length; i += CH) {
      s += String.fromCharCode.apply(null, out.subarray(i, i + CH));
    }
    return s;
  } catch {
    return null;
  }
}

function corsHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  }, extra || {});
}

// Rewrite one URI found inside a playlist (segment, nested playlist, key)
function proxify(uri, baseUrl, selfUrl, extra) {
  try {
    const abs = new URL(uri, baseUrl).toString();
    return selfUrl + '?d=' + b64encUrl(abs) + (extra || '');
  } catch (e) {
    return uri;
  }
}

function rewritePlaylist(text, baseUrl, selfUrl, extra) {
  const lines = text.split('\n');
  const out = lines.map(line => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      // Rewrite URI="..." attributes too (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA)
      if (t.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (m, uri) => 'URI="' + proxify(uri, baseUrl, selfUrl, extra) + '"');
      }
      return line;
    }
    return proxify(t, baseUrl, selfUrl, extra);
  });
  return out.join('\n');
}

async function handleProxy(request, target) {
  const selfUrl = new URL(request.url);
  selfUrl.search = '';
  const selfBase = selfUrl.toString().replace(/\/$/, '');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': '*/*',
  };
  // Pass through Range for seeking
  const range = request.headers.get('Range');
  if (range) headers['Range'] = range;
  // Optional Referer passthrough: &ref=<b64url-of-referer>
  try {
    const refParam = new URL(request.url).searchParams.get('ref');
    if (refParam) {
      const ref = b64dec(refParam);
      if (/^https?:\/\//i.test(ref)) headers['Referer'] = ref;
    }
  } catch (e) { /* ignore bad ref */ }

  let upstream;
  try {
    upstream = await fetch(target, { headers, redirect: 'follow' });
  } catch (e) {
    return new Response('Upstream fetch failed: ' + e.message, { status: 502, headers: corsHeaders() });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Upstream error ' + upstream.status, { status: upstream.status, headers: corsHeaders() });
  }

  const ct = (upstream.headers.get('Content-Type') || '').toLowerCase();
  const isPlaylist = ct.includes('mpegurl') || ct.includes('x-mpegurl') ||
    target.split('?')[0].toLowerCase().endsWith('.m3u8');

  const outHeaders = corsHeaders();
  const cacheCtl = upstream.headers.get('Cache-Control');
  if (cacheCtl) outHeaders['Cache-Control'] = cacheCtl;

  if (isPlaylist) {
    let text = await upstream.text();
    // Encrypted nested playlists: decrypt with ?k= before rewriting.
    const reqParams = new URL(request.url).searchParams;
    const keyParam = reqParams.get('k');
    if (!text.trimStart().startsWith('#EXTM3U') && keyParam) {
      const plain = xorDecryptPlaylist(text, b64decBytes(keyParam));
      if (plain) text = plain;
    }
    if (text.trimStart().startsWith('#EXTM3U')) {
      // Propagate ref + key so deeper levels (segments, nested playlists)
      // are fetched with the right Referer and can be decrypted.
      const refVal = reqParams.get('ref');
      const keyVal = reqParams.get('k');
      let extra = '';
      if (refVal) extra += '&ref=' + refVal;
      if (keyVal) extra += '&k=' + keyVal;
      const rewritten = rewritePlaylist(text, target, selfBase, extra);
      outHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
      return new Response(rewritten, { status: 200, headers: outHeaders });
    }
    // Not actually a playlist (e.g. undecryptable ciphertext) — pass through
    // untouched so the caller sees the real bytes.
    const ptCt = upstream.headers.get('Content-Type');
    if (ptCt) outHeaders['Content-Type'] = ptCt;
    return new Response(text, { status: upstream.status, headers: outHeaders });
  }

  // Segments / keys / mp4 / subtitles: stream bytes through untouched
  const passCt = upstream.headers.get('Content-Type');
  if (passCt) outHeaders['Content-Type'] = passCt;
  const cr = upstream.headers.get('Content-Range');
  if (cr) outHeaders['Content-Range'] = cr;
  const al = upstream.headers.get('Accept-Ranges');
  if (al) outHeaders['Accept-Ranges'] = al;
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'mpv2-hls-proxy' }),
        { headers: corsHeaders({ 'Content-Type': 'application/json' }) });
    }

    if (url.pathname === '/hls' || url.pathname === '/hls/') {
      const d = url.searchParams.get('d') || url.searchParams.get('u');
      if (!d) {
        return new Response('Missing ?d=<base64url>', { status: 400, headers: corsHeaders() });
      }
      let target;
      try {
        target = b64dec(d);
        if (!/^https?:\/\//i.test(target)) throw new Error('bad url');
      } catch (e) {
        return new Response('Invalid target URL', { status: 400, headers: corsHeaders() });
      }
      return handleProxy(request, target);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  }
};
