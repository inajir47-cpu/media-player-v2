// Media Player V2 — English streaming (reanime.to + FlixCloud).
// Ported from the proven Konosuba backend (backend/src/anime/reanime.ts).
// Plain ESM JavaScript, no build step.

import { extractFlixcloud } from './flixcloud.mjs';

const REANIME = 'https://reanime.to';
const FLIX = 'https://flixcloud.cc';
// Our own Cloudflare Worker HLS proxy (free tier). Video CDNs see Cloudflare's
// IP instead of the backend's — used for English streams so Render's datacenter
// IP being blocked doesn't break playback.
const WORKER_BASE = 'https://mpv2-hls-proxy.gmpdi020.workers.dev';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, Accept: 'application/json, */*' };

const streamCache = new Map(); // cacheKey(animeId, ep) -> CacheEntry
const keyByStream = new Map(); // cacheKey(animeId, ep) -> playlist key
const STREAM_TTL_MS = 3 * 60 * 60 * 1000;

function cacheKey(animeId, ep) {
  return `${animeId}::${ep}`;
}

async function getJson(url, referer) {
  const res = await smartFetch(url, referer);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`reAnime ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

function pickTitle(t) {
  t = t || {};
  return t.english || t.romaji || t.native || 'Unknown';
}

/** Search anime by title. Results include subbed/dubbed episode counts. */
export async function searchAnime(q) {
  const data = await getJson(
    `${REANIME}/api/v1/search?${new URLSearchParams({ q, limit: '12' })}`,
  );
  return (data.results || []).map((r) => ({
    animeId: r.anime_id,
    anilistId: typeof r.anilist_id === 'number' ? r.anilist_id : null,
    title: pickTitle(r.title || {}),
    image: r.cover_image?.large || r.cover_image?.medium || null,
    year: typeof r.season_year === 'number' ? r.season_year : null,
    episodes: typeof r.episodes === 'number' ? r.episodes : null,
    subbed: typeof r.subbed === 'number' ? r.subbed : null,
    dubbed: typeof r.dubbed === 'number' ? r.dubbed : null,
    hasDub: typeof r.dubbed === 'number' && r.dubbed > 0,
    format: r.format || null,
    status: r.status || null,
  }));
}

/** Episode list for an anime (reanime slug). */
export async function getAnimeEpisodes(animeId) {
  const [detail, eps] = await Promise.all([
    getJson(`${REANIME}/api/v1/anime/${encodeURIComponent(animeId)}`).catch(() => null),
    getJson(
      `${REANIME}/api/v1/anime/${encodeURIComponent(animeId)}/episodes?${new URLSearchParams({ limit: '2000' })}`,
    ).catch(() => ({ data: [] })),
  ]);
  const episodes = (eps.data || [])
    .map((e) => ({ number: Number(e.episode_number), title: e.title || `Episode ${e.episode_number}` }))
    .filter((e) => Number.isFinite(e.number) && e.number > 0)
    .sort((a, b) => a.number - b.number);
  return {
    anilistId: typeof detail?.anilist_id === 'number' ? detail.anilist_id : null,
    episodes,
    info: detail ? { title: pickTitle(detail.title || {}), image: detail.cover_image?.large || null } : null,
  };
}

/**
 * Servers for one episode (anilistId-based). Each entry: { serverName, dataLink, dataType }.
 * dataType is "sub" | "dub". Exported — powers the episode availability badges.
 */
export async function getEpisodeServers(anilistId, ep) {
  const data = await getJson(`${REANIME}/api/flix/${anilistId}/${ep}`);
  const servers = data.servers || [];
  const order = { 'HD-1': 0, 'HD-2': 1 };
  return servers
    .filter((s) => s.dataLink)
    .sort((a, b) => (order[a.serverName] ?? 9) - (order[b.serverName] ?? 9));
}

/** Decrypt a FlixCloud master/media playlist (base64 + XOR with playlist key). */
export function decryptPlaylist(text, b64key) {
  const trimmed = text.trim();
  if (trimmed.startsWith('#EXTM3U')) return trimmed;
  const key = Buffer.from(b64key, 'base64');
  const payload = Buffer.from(trimmed, 'base64');
  const out = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ key[i % key.length];
  const decoded = out.toString('utf8').trim();
  if (!decoded.startsWith('#EXTM3U')) throw new Error('Playlist decrypt failed');
  return decoded;
}

/** Parse #EXT-X-MEDIA audio tracks from a master playlist. */
function parseAudioTracks(master) {
  const tracks = [];
  for (const line of master.split('\n')) {
    if (!line.startsWith('#EXT-X-MEDIA')) continue;
    const attrs = {};
    const body = line.slice('#EXT-X-MEDIA:'.length);
    for (const m of body.matchAll(/([A-Z-]+)=(?:\"([^\"]*)\"|([^,]*))/g)) {
      attrs[m[1]] = m[2] ?? m[3] ?? '';
    }
    if ((attrs['TYPE'] || '').toUpperCase() === 'AUDIO') {
      tracks.push({ lang: attrs['LANGUAGE'] || '', label: attrs['NAME'] || attrs['LANGUAGE'] || 'Audio' });
    }
  }
  return tracks;
}

export function b64url(s) {
  return Buffer.from(s, 'utf8').toString('base64url');
}

export function unb64url(s) {
  try {
    const decoded = Buffer.from(s, 'base64url').toString('utf8');
    if (!/^https?:\/\//i.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function proxyStreamUrl(upstreamUrl, animeId, ep) {
  const p = new URLSearchParams({ u: b64url(upstreamUrl), animeId, ep: String(ep) });
  return `/api/stream/r?${p.toString()}`;
}

/** Route any upstream URL through our Cloudflare Worker HLS proxy. */
export function workerProxyUrl(upstreamUrl, referer, keyB64url) {
  let w = `${WORKER_BASE}/hls?d=${b64url(upstreamUrl)}`;
  if (referer) w += `&ref=${b64url(referer)}`;
  if (keyB64url) w += `&k=${keyB64url}`;
  return w;
}

/** Fetch an upstream URL through the worker (Cloudflare egress IP). */
async function fetchViaWorker(url, referer) {
  const res = await fetch(workerProxyUrl(url, referer), {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Worker proxy ${res.status} for ${url}`);
  return res;
}

/**
 * Upstream fetch for the English flow: worker first (dodges datacenter-IP
 * blocks on Render), direct fetch as fallback (e.g. local PC backend).
 */
async function smartFetch(url, referer) {
  try {
    return await fetchViaWorker(url, referer);
  } catch {
    return fetch(url, {
      headers: { ...H, ...(referer ? { Referer: referer } : {}) },
    });
  }
}

/**
 * Rewrite every URI in an HLS playlist to go through our worker proxy.
 * Idempotent: URLs the worker already rewrote are normalized (not double-wrapped).
 */
export function rewritePlaylistViaWorker(text, playlistUrl, referer, keyB64url) {
  const proxied = (raw) => {
    try {
      const abs = new URL(raw, playlistUrl).toString();
      let target = abs;
      if (abs.startsWith(`${WORKER_BASE}/hls`)) {
        try {
          const d = new URL(abs).searchParams.get('d');
          if (d) target = unb64url(d) || abs;
        } catch { /* keep abs */ }
      }
      // Nested playlists may be encrypted too — hand the worker the XOR key
      // so it can decrypt them before rewriting. Segments/keys don't need it.
      let k = null;
      try {
        if (keyB64url && new URL(target).pathname.toLowerCase().endsWith('.m3u8')) k = keyB64url;
      } catch { /* keep k null */ }
      return workerProxyUrl(target, referer, k);
    } catch {
      return raw;
    }
  };
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxied(uri)}"`);
      }
      return proxied(t);
    })
    .join('\n');
}

/** Rewrite every URI in an HLS playlist to go through our /api/stream/r proxy. */
export function rewritePlaylist(text, playlistUrl, animeId, ep) {
  const proxied = (raw) => {
    try {
      const abs = new URL(raw, playlistUrl).toString();
      return proxyStreamUrl(abs, animeId, ep);
    } catch {
      return raw;
    }
  };
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxied(uri)}"`);
      }
      return proxied(t);
    })
    .join('\n');
}

async function fetchUpstream(url, referer) {
  return smartFetch(url, referer);
}

/**
 * Resolve a playable stream for an episode. Returns the upstream master
 * playlist URL plus audio/subtitle tracks. Results are cached; flix tokens
 * expire so entries live a few hours.
 *
 * type: 'sub' | 'dub' | undefined — prefers a server whose dataType matches.
 * (HD-1/HD-2 embeds serve both languages via audio tracks; the preference
 * only changes which server is tried first.)
 */
export async function resolveWatch(animeId, anilistId, ep, type) {
  const key = cacheKey(animeId, ep);
  const cached = streamCache.get(key);
  if (cached && Date.now() - cached.resolvedAt < STREAM_TTL_MS) {
    return cached;
  }

  let servers = await getEpisodeServers(anilistId, ep);
  if (!servers.length) throw new Error('No servers found for this episode');
  if (type === 'sub' || type === 'dub') {
    servers = [...servers].sort((a, b) =>
      (a.dataType === type ? 0 : 1) - (b.dataType === type ? 0 : 1),
    );
  }

  let lastErr = null;
  for (const server of servers) {
    try {
      const embedRes = await fetchUpstream(server.dataLink, `${REANIME}/`);
      if (!embedRes.ok) throw new Error(`Embed fetch ${embedRes.status}`);
      const html = await embedRes.text();
      const stream = await extractFlixcloud(html, {
        apiBase: FLIX,
        headers: H,
        referer: `${REANIME}/`,
        fetchImpl: (u, opts) =>
          smartFetch(u, (opts && opts.headers && opts.headers.Referer) || `${REANIME}/`),
      });
      if (!stream.url) throw new Error('No stream URL extracted');

      // Validate + learn the audio tracks from the (possibly encrypted) master.
      // Playlist bytes come through smartFetch (worker first) so a blocked
      // datacenter egress doesn't kill resolution.
      const plRes = await smartFetch(stream.url, `${FLIX}/`);
      if (!plRes.ok) throw new Error(`Playlist fetch ${plRes.status}`);
      let master = await plRes.text();
      const playlistKey = stream.playlist_key || stream.key || null;
      if (!master.trim().startsWith('#EXTM3U')) {
        if (!playlistKey) throw new Error('Encrypted playlist but no key');
        master = decryptPlaylist(master, playlistKey);
      }
      const audioTracks = parseAudioTracks(master);
      keyByStream.set(key, playlistKey || '');
      // Served to the player via /en/pl: decrypted, with every URI rewritten
      // to the worker proxy so playback never touches the blocked egress IP.
      // Nested (variant/audio) playlists may be encrypted as well — pass the
      // XOR key along so the worker can decrypt them before rewriting.
      const rawKey = stream.playlist_key || stream.key || null;
      const keyB64url = rawKey
        ? Buffer.from(rawKey, 'base64').toString('base64url')
        : null;
      const masterForServe = rewritePlaylistViaWorker(master, stream.url, `${FLIX}/`, keyB64url);

      const subtitles = (stream.subtitles || [])
        .filter((s) => s.url)
        .map((s, i) => ({
          label: s.language || `Subtitle ${i + 1}`,
          lang: (s.language || '').toLowerCase().includes('eng') ? 'en' : '',
          url: workerProxyUrl(s.url),
        }));

      const entry = {
        hlsUrl: stream.url,
        playlistKey,
        master: masterForServe,
        audioTracks,
        subtitles,
        resolvedAt: Date.now(),
        embedUrl: server.dataLink,
        serverName: server.serverName,
        dataType: server.dataType,
      };
      streamCache.set(key, entry);
      return entry;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Stream resolution failed');
}

/** Look up a cached playlist key for proxy decryption. */
export function playlistKeyForStream(animeId, ep) {
  return keyByStream.get(cacheKey(animeId, ep)) || undefined;
}

/** Look up the cached, worker-rewritten master playlist for /en/pl. */
export function getCachedMaster(animeId, ep) {
  const cached = streamCache.get(cacheKey(animeId, ep));
  if (cached && Date.now() - cached.resolvedAt < STREAM_TTL_MS && cached.master) {
    return cached.master;
  }
  return null;
}

/** Drop a cached stream so the next request re-resolves (token refresh). */
export function invalidateStream(animeId, ep) {
  streamCache.delete(cacheKey(animeId, ep));
}
