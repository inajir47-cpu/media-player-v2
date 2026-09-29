// Media Player V2 — streaming API routes (mounted at /api/stream).

import { Router } from 'express';
import {
  searchAnime,
  getAnimeEpisodes,
  getEpisodeServers,
  resolveWatch,
  decryptPlaylist,
  rewritePlaylist,
  proxyStreamUrl,
  playlistKeyForStream,
  invalidateStream,
  unb64url,
  b64url,
} from './stream.mjs';

const router = Router();

const UPSTREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

router.get('/health', (_req, res) => res.json({ ok: true, service: 'stream' }));

// TEMP DEBUG — diagnosing the Render 403 from reanime.to. Remove after.
router.get('/debug/upstream', async (_req, res) => {
  const UA2 =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const RE = 'https://reanime.to';
  const attempts = [];
  const tryFetch = async (name, url, headers) => {
    try {
      const r = await fetch(url, { headers, redirect: 'manual' });
      const text = await r.text();
      attempts.push({
        name,
        status: r.status,
        server: r.headers.get('server'),
        cfRay: r.headers.get('cf-ray'),
        cfCache: r.headers.get('cf-cache-status'),
        location: r.headers.get('location'),
        body: text.slice(0, 500),
      });
    } catch (e) {
      attempts.push({ name, error: e?.message || String(e) });
    }
  };
  await tryFetch('api-minimal', `${RE}/api/v1/search?q=naruto&limit=1`, {
    'User-Agent': UA2,
    Accept: 'application/json, */*',
  });
  await tryFetch('api-browser-headers', `${RE}/api/v1/search?q=naruto&limit=1`, {
    'User-Agent': UA2,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${RE}/`,
    Origin: RE,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
  });
  await tryFetch('homepage', `${RE}/`, {
    'User-Agent': UA2,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  });
  res.json({ attempts });
});

// GET /api/stream/en/search?q=
router.get('/en/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });
  try {
    const results = await searchAnime(q);
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: e?.message || 'Anime search failed' });
  }
});

// GET /api/stream/en/episodes?animeId=
router.get('/en/episodes', async (req, res) => {
  const animeId = String(req.query.animeId || '').trim();
  if (!animeId) return res.status(400).json({ error: 'animeId is required' });
  try {
    const detail = await getAnimeEpisodes(animeId);
    res.json({ animeId, anilistId: detail.anilistId, episodes: detail.episodes, info: detail.info });
  } catch (e) {
    res.status(502).json({ error: e?.message || 'Failed to load episodes' });
  }
});

// GET /api/stream/en/servers?anilistId=&ep=
// Powers the per-episode availability badges + globe icon.
router.get('/en/servers', async (req, res) => {
  const anilistId = parseInt(String(req.query.anilistId || ''), 10);
  const ep = parseInt(String(req.query.ep || ''), 10);
  if (!Number.isFinite(anilistId) || !Number.isFinite(ep)) {
    return res.status(400).json({ error: 'anilistId and ep are required' });
  }
  try {
    const servers = await getEpisodeServers(anilistId, ep);
    res.json({
      anilistId,
      ep,
      servers: servers.map((s) => ({ serverName: s.serverName, dataType: s.dataType })),
    });
  } catch (e) {
    res.status(502).json({ error: e?.message || 'Failed to load servers' });
  }
});

// GET /api/stream/en/watch?animeId=&anilistId=&ep=&type=sub|dub
// Resolves the episode to a proxied HLS master playlist + tracks.
router.get('/en/watch', async (req, res) => {
  const animeId = String(req.query.animeId || '').trim();
  const anilistId = parseInt(String(req.query.anilistId || ''), 10);
  const ep = parseInt(String(req.query.ep || ''), 10);
  const type = String(req.query.type || '').toLowerCase();
  if (!animeId || !Number.isFinite(anilistId) || !Number.isFinite(ep)) {
    return res.status(400).json({ error: 'animeId, anilistId and ep are required' });
  }
  try {
    const stream = await resolveWatch(animeId, anilistId, ep, type === 'dub' ? 'dub' : type === 'sub' ? 'sub' : undefined);
    res.json({
      animeId,
      ep,
      serverName: stream.serverName,
      dataType: stream.dataType,
      stream: proxyStreamUrl(stream.hlsUrl, animeId, ep),
      audioTracks: stream.audioTracks,
      subtitles: stream.subtitles,
    });
  } catch (e) {
    const status = e?.status === 404 ? 404 : 502;
    res.status(status).json({ error: e?.message || 'Stream resolution failed' });
  }
});

/**
 * GET|POST /api/stream/r?u=<b64url>&animeId=&ep=&xreferer=&xorigin=
 * Generic upstream proxy. Used for:
 *  - English HLS playlists/segments/keys (animeId+ep enables playlist decrypt+rewrite)
 *  - The Hindi provider's page fetches, POSTs and media segments (xreferer/xorigin forwarded)
 */
async function handleProxy(req, res) {
  const upstream = unb64url(String(req.query.u || ''));
  if (!upstream) return res.status(400).json({ error: 'u is required' });

  const animeId = String(req.query.animeId || '');
  const ep = parseInt(String(req.query.ep || ''), 10);
  const xreferer = String(req.query.xreferer || '');
  const xorigin = String(req.query.xorigin || '');

  const headers = { 'User-Agent': UPSTREAM_UA };
  if (xreferer) headers.Referer = xreferer;
  else if (animeId) headers.Referer = 'https://flixcloud.cc/';
  if (xorigin) headers.Origin = xorigin;

  let body;
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
    const ct = req.headers['content-type'];
    if (ct) headers['Content-Type'] = ct;
  }

  const doFetch = () => fetch(upstream, { method: req.method, headers, body });

  try {
    const r = await doFetch();
    // Token expired? Drop the cache so the next /watch re-resolves.
    if ((r.status === 401 || r.status === 403) && animeId && Number.isFinite(ep)) {
      invalidateStream(animeId, ep);
      return res.status(410).json({ error: 'Stream expired, please retry' });
    }
    if (!r.ok) return res.status(502).json({ error: `Upstream ${r.status}` });

    const buf = Buffer.from(await r.arrayBuffer());
    const asText = buf.toString('utf8');

    const servePlaylist = (text) => {
      const rewritten =
        animeId && Number.isFinite(ep) ? rewritePlaylist(text, upstream, animeId, ep) : text;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(rewritten);
    };

    // Maybe an encrypted playlist — try decrypting with the cached key.
    const key = animeId && Number.isFinite(ep) ? playlistKeyForStream(animeId, ep) : undefined;
    if (key) {
      try {
        return servePlaylist(decryptPlaylist(asText, key));
      } catch {
        /* not an encrypted playlist — fall through to raw bytes */
      }
    }
    if (asText.trimStart().startsWith('#EXTM3U')) {
      return servePlaylist(asText);
    }

    const contentType = r.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(buf);
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Proxy failed' });
  }
}

router.get('/r', handleProxy);
router.post('/r', handleProxy);

export default router;
