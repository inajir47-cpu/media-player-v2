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

function corsHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  }, extra || {});
}

// Rewrite one URI found inside a playlist (segment, nested playlist, key)
function proxify(uri, baseUrl, selfUrl) {
  try {
    const abs = new URL(uri, baseUrl).toString();
    return selfUrl + '?d=' + b64encUrl(abs);
  } catch (e) {
    return uri;
  }
}

function rewritePlaylist(text, baseUrl, selfUrl) {
  const lines = text.split('\n');
  const out = lines.map(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      // Rewrite EXT-X-KEY / EXT-X-MAP URI="..." attributes too
      if (t.startsWith('#EXT-X-KEY') || t.startsWith('#EXT-X-MAP')) {
        return line.replace(/URI="([^"]+)"/, (m, uri) => 'URI="' + proxify(uri, baseUrl, selfUrl) + '"');
      }
      return line;
    }
    return proxify(t, baseUrl, selfUrl);
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
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, target, selfBase);
    outHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
    return new Response(rewritten, { status: 200, headers: outHeaders });
  }

  // Segments / keys / mp4: stream bytes through untouched
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
