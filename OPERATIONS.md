# Media Player V2 — Operations Note

One central note: what we use, how much we use, and what to do when something breaks.
Obey this on every update. Updated 2026-09-30.

## Services we use

| Service | What for | Cost / limits |
|---|---|---|
| GitHub (`inajir47-cpu/media-player-v2`) | Code hosting; push to `main` triggers Render deploy | Free |
| Render | Backend hosting (Node/Express API) | Free tier — sleeps when idle (cold starts), auto-deploys on git push |
| Cloudflare Worker (`mpv2-hls-proxy.gmpdi020.workers.dev`) | HLS proxy + upstream fetcher for the phone | Free tier — 100,000 requests/day |
| TMDB | Episode stills metadata | Free, but needs **Imran's own API key** (slot is built in Settings; key not yet added) |
| AniList / TVmaze / Jikan | Anime metadata (titles, images, episode lists) | Free, no keys needed |
| reanime.to + flixcloud.cc | English sub/dub streams (HD-1, HD-2 providers) | Not ours — can break or block us anytime |
| ToonStream → TurboNewVid → RubySTM → VidMoly | Hindi streams (Hindi provider) | Not ours — can break anytime |
| codedew.com + rareamimes.mov | Hindi-2 streams (Rare Animes India) | Not ours — can break anytime |

## Tools we use

| Tool | What for |
|---|---|
| Git | Commits. Pushes need a **fresh PAT pasted by Imran each time** — never stored, never reused, used transiently only |
| Cloudflare dashboard | Worker updates = paste latest `worker/hls-proxy-worker.js` → Deploy (manual step, Imran does it) |
| Render dashboard | Auto-deploys on push — nothing to do manually unless a deploy fails |
| `node --check` | Syntax check on JS files before every commit |
| jsdom | UI/logic verification only — **never called device testing** |
| Leased browser | Live investigation of streaming sites (search forms, embed pages) |

## If something breaks or gets blocked — playbook

1. **Upstream 403s Render** (datacenter IP blocked — happened with reanime.to + flixcloud.cc):
   Move that source's upstream calls to run in the **phone's browser through the Cloudflare worker**
   (worker fetches with CORS `*`; the phone's region is usually not blocked).
   Proven pattern: commit `a60b97a`.
2. **Worker 403s an upstream from here** (happened with codedew.com from the sandbox):
   **Test on Imran's phone first** — the UAE edge often works where the sandbox is blocked.
   Do not rebuild until the phone test confirms the failure.
3. **Source changes its embed/encryption** (new host, new `_juicycodes` algorithm):
   Fetch a real embed page, re-decode, update `js/codedew-hindi-provider.js` or `js/flixcloud.js`,
   push, Imran tests on phone.
4. **A source dies completely**: **remove the provider button** — standing rule, no fake buttons.
   Tell Imran plainly what died.
5. **GitHub push blocked / auth failed**: the PAT expired. Ask Imran for a **fresh** PAT.
   Never reuse or store an old one.
6. **Render deploy fails**: check the Render dashboard deploy logs; hit manual redeploy if needed.
7. **Worker nears 100k requests/day**: check Cloudflare analytics; upgrade to the paid Workers
   plan only if usage is sustained.
8. **Episode stills missing**: Imran hasn't added his TMDB key in Settings yet — remind him.
   The key cannot be created for him.

## Standing rules — obey on every update

- Build strictly part-by-part; surgical changes only; **diagnose the exact cause before rebuilding**.
- Preview first. Build an APK only when explicitly requested; announce readiness, never attach it in chat.
- Screenshots go directly as chat images, never as links.
- Node/jsdom/browser checks are **never** device testing — only Imran's phone counts as verified.
- Never store passwords, tokens, TMDB keys, proxy credentials, or PATs in memory or files.
- No unapproved providers, no fake provider buttons, no unrelated upgrades without explicit approval.
- Preserve OLED styling, liquid-display effects, chameleon behavior, categorized Settings,
  and localStorage persistence.
