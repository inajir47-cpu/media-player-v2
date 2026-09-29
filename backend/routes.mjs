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
  getCachedMaster,
  invalidateStream,
  unb64url,
  b64url,
  workerProxyUrl,
  WORKER_BASE,
} from './stream.mjs';

const router = Router();

const UPSTREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

router.get('/health', (_req, res) => res.json({ ok: true, service: 'stream' }));

// GET /api/stream/en/diag — temporary connectivity diagnostics (Render -> worker -> upstream).
// Optional ?url=<plain https url> probes that URL through the worker too.
router.get('/en/diag', async (req, res) => {
  const out = { node: process.version };
  const timed = async (label, fn) => {
    const t0 = Date.now();
    try {
      out[label] = { ...(await fn()), ms: Date.now() - t0 };
    } catch (e) {
      out[label] = { error: String((e && e.message) || e), ms: Date.now() - t0 };
    }
  };
  await timed('workerHealth', async () => {
    const r = await fetch(`${WORKER_BASE}/health`, { headers: { 'User-Agent': UPSTREAM_UA } });
    return { status: r.status, body: (await r.text()).slice(0, 120) };
  });
  const apiUrl = 'https://reanime.to/api/flix/154587/1';
  await timed('viaWorker', async () => {
    const r = await fetch(workerProxyUrl(apiUrl), { headers: { 'User-Agent': UPSTREAM_UA } });
    return { status: r.status, body: (await r.text()).slice(0, 160) };
  });
  await timed('direct', async () => {
    const r = await fetch(apiUrl, { headers: { 'User-Agent': UPSTREAM_UA, Accept: 'application/json, */*' } });
    return { status: r.status, body: (await r.text()).slice(0, 120) };
  });
  const probe = String(req.query.url || '');
  if (/^https:\/\//.test(probe)) {
    await timed('probeViaWorker', async () => {
      const r = await fetch(workerProxyUrl(probe), { headers: { 'User-Agent': UPSTREAM_UA } });
      return { status: r.status, body: (await r.text()).slice(0, 160) };
    });
  }
  res.json(out);
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
      // Served by /en/pl below: decrypted master with every URI rewritten to
      // our Cloudflare Worker proxy (never touches the blocked egress IP).
      stream: `/api/stream/en/pl?animeId=${encodeURIComponent(animeId)}&ep=${ep}`,
      audioTracks: stream.audioTracks,
      subtitles: stream.subtitles,
    });
  } catch (e) {
    const status = e?.status === 404 ? 404 : 502;
    res.status(status).json({ error: e?.message || 'Stream resolution failed' });
  }
});

// GET /api/stream/en/pl?animeId=&ep=
// Serves the cached master playlist (decrypted, worker-rewritten) for the player.
// No upstream fetch happens here — everything already resolved by /en/watch.
router.get('/en/pl', (req, res) => {
  const animeId = String(req.query.animeId || '').trim();
  const ep = parseInt(String(req.query.ep || ''), 10);
  if (!animeId || !Number.isFinite(ep)) {
    return res.status(400).json({ error: 'animeId and ep are required' });
  }
  const master = getCachedMaster(animeId, ep);
  if (!master) {
    return res.status(404).json({ error: 'Stream expired — please retry' });
  }
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.send(master);
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
