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
| MangaDex | Manga chapter feeds (EN/JA) + at-home page images | Keyless. Treated limit: 5 requests/second (feeds serialize with a 300ms floor; page URLs cached in memory). Direct-first JSON with Cloudflare Worker fallback for CORS. Pages load from the MangaDex CDN. Title and language coverage varies by title (Japanese depends on what scanlators uploaded). |
| reanime.to + flixcloud.cc | English sub/dub streams (HD-1, HD-2 providers) | Not ours — can break or block us anytime |
| ToonStream → TurboNewVid → RubySTM → VidMoly | Hindi streams (Hindi provider) | Not ours — can break anytime |
| codedew.com + rareamimes.mov | Hindi-2 streams (Rare Animes India) | Not ours — can break anytime |
| animehindidubbed.in + abyssplayer.com | Hindi-3 streams (AnimeHindiDubbed) | Not ours — can break anytime |

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
3b. **Hindi-3 (abyssplayer) stops resolving**: the extraction is
   `js/ahd-hindi-provider.js` — search `?s=` → `serverVideos` literal →
   servabyss `abyssplayer.com/<slug>` embed → page's `datas` base64 JSON →
   AES-256-CTR decrypt with key = MD5-hex of `user_id:slug:md5_id`
   (counter = first 16 key bytes, length 128) → best `mp4.fristDatas`
   (note upstream misspelling) URL → `/api/stream/r` with
   `xreferer=https://abyssplayer.com/` (CDN 403s without that Referer;
   the phone browser cannot spoof it, so it must be proxied).
   Direct media CDN observed: `*.sssrr.org`.
3c. **Hindi-1 (ToonStream) server rot, 2026-09-30**: the episode pages still
   resolve but the video servers died one by one — turbonewvid's HLS
   segments are Google-Drive PNG placeholders to datacenter IPs (the
   manifest parses, so the player showed a duration then failed with
   hls.js `mediaSourceRequiresReset`), rubystm.com and vidmoly's
   vmeas.cloud are HTTP 403 to Render. **UPDATE same night**: the
   abyssplayer.com route is ALSO dead — its `*.sssrr.org` CDN serves
   truncated files (4–20 MB instead of 100–345 MB, Cloudflare-cached,
   verified from sandbox/Render/worker on 9 URLs across 6 subdomains),
   so both Hindi-1's `hiAbyss` fix and Hindi-3's Servabyss route fail
   with unplayable files. Current fix: Hindi-1 routes through the
   **Cloudflare worker** (`hiProxyW` in `js/kanasu-hindi-provider.js`),
   which rubystm/vidmoly do NOT block — server rank is now
   rubystm → vidmoly → turbonewvid → abyssplayer(last). This needs
   **worker v2** (forwards POST/PUT/PATCH + body; redeploy = paste
   `worker/hls-proxy-worker.js` in Cloudflare dashboard). Worker-fetched
   m3u8 playlists are already rewritten to worker URLs, so
   `hiResolveHls` skips `hiRewritePlaylist` when it sees
   `workers.dev/hls?d=` (double-proxy breaks playback).
3d. **Hindi-3 REMOVED, 2026-09-30**: Imran ordered removal. The
   `*.sssrr.org` CDN serves truncated files, so the provider could never
   play. Removed: `hindi3` availability/button/watch handler/label from
   `js/stream.js`. `js/ahd-hindi-provider.js` stays loaded ONLY as a shared
   utility — Hindi-1's `hiAbyss` fallback uses its `h3AbyssDecrypt`.
   (If the CDN ever recovers, the provider code is in git history.)
4. **A source dies completely**: **remove the provider button** — standing rule, no fake buttons.
   Tell Imran plainly what died.
9. **Stream CDN returns "Invalid signature" / endless loading** (happened with Hindi-2's
   JuicyCodes CDN on 2026-09-30): the CDN binds stream signatures to the IP that loaded the
   embed page. The worker fetches the embed page over IPv6 but the stream host was IPv4-only,
   so the worker could never present the same IP. Fix: resolve + proxy the stream from the
   **backend** (one stable IPv4 egress for embed page, playlists and segments). Proven
   pattern: `/api/stream/hi2/pl` + `/api/stream/hi2/v` (commit `c7566e4`). Discovery
   (search/episodes) can stay on the phone via the worker; only the fileId crosses over.
5. **GitHub push blocked / auth failed**: the PAT expired. Ask Imran for a **fresh** PAT.
   Never reuse or store an old one.
6. **Render deploy fails**: check the Render dashboard deploy logs; hit manual redeploy if needed.
7. **Worker nears 100k requests/day**: check Cloudflare analytics; upgrade to the paid Workers
   plan only if usage is sustained.
8. **Episode stills missing**: Imran hasn't added his TMDB key in Settings yet — remind him.
   The key cannot be created for him.
9. **Adult (18+) toggle leaks a title**: fixed 2026-09-30 (commit `05613a6`).
   Two causes: (a) the 48h detail cache could serve entries saved *before* the
   adult pack — they have no `isAdult` field, so the gate was skipped. The
   cache key is now versioned (`d:v2:…`); old entries are never reused, details
   refetch once. (b) `isAdult` filtering now covers every list surface (TOP 010,
   Discover/genre, home recommendations, detail recommendations, hero), not
   just search. Also: home "Recently Watched" cards have the X remove button
   (same instant-remove + live refresh + toast as the History tab).
10. **18+ badges + Recently Viewed remove**: 2026-09-30 (commit `182d3e2`).
    `recordView()` now persists `isAdult`, so Recently Viewed /
    Recently Viewed Manga cards render the 18+ badge (moved top-left; the X
    sits top-right). TOP 010 rows and hero slides also badge adult titles when
    the opt-in is ON. Home "Recently Viewed" and Manga-tab "Recently Viewed
    Manga" cards have the X remove button: instant storage removal + card
    removal (section hides when empty) + toast, never navigates. Bug caught in
    testing: the section must be captured *before* `card.remove()` detaches the
    button from the DOM, otherwise `closest('section')` returns null.
    Follow-up 2026-09-30: an earlier debug claimed the emptied manga section
    stayed in the DOM — **could not reproduce** on current code. Chromium
    re-verified: removing the last manga card removes the whole section from
    the DOM; removing one of two keeps the section with the survivor; manga
    removal never touches the anime store (storage isolation confirmed).
11. **External link confirmation modal**: 2026-09-30 (commit `551f686`). One document-level delegated handler in `js/anime-online.js`
    (`wireExternalConfirm()`) intercepts every absolute http(s) link — trailer
    button, episode globe, markdown links in descriptions/reviews — before it
    navigates. Shows an OLED-styled modal: YouTube links get "This will open
    YouTube to play the trailer.", others get "This will open an external
    website (<domain>)." Cancel/backdrop/Esc dismiss; only Proceed calls
    `window.open(url, '_blank', 'noopener')`. Internal `#/...` hash links are
    never intercepted. `data-no-confirm` on an anchor bypasses the modal.
12. **God Mode + search filters**: 2026-09-30 (pushed this date; Render
    redeployed). Animation search has a prominent God
    Mode toggle (persisted `mpv2_godmode_v1`) and All / Movie / Web Series /
    Manga filter chips (persisted `mpv2_search_filter_v1`). God Mode bypasses
    AniList/Jikan and searches provider servers directly in parallel with
    per-provider timeout + failure isolation: Hindi-1, Hindi-2, Reanime
    (EN sub/dub), MangaDex (native safe/suggestive ratings only). Every
    direct result shows its server tag and language/audio badges (HINDI/DUB,
    ENGLISH/SUB/DUB, EN/JA). Routing: Hindi → existing title-match provider
    dialog; Reanime → AniList detail hash when an ID exists; MangaDex →
    earliest EN chapter in the reader. Timing lesson: app.js's boot `render()`
    runs during its own parse, before the online scripts below it execute, so
    the toggle/chips are injected by an idempotent bounded poll
    (`wireSearchEnhancements`, ≤10s) + window-load hook, not a single
    `setTimeout(0)` — the 0ms timer can fire in a script-download gap before
    the helpers exist. Verified: jsdom harness 41/41, real Chromium 22/22
    (screenshot `your_files/media-player-v2-backup/v2-godmode-results.png`).

13. **2026-09-30 — nhentai adult-manga provider (Option 1).** New
    `js/nhentai-provider.js`: keyless nhentai.net v2 API (search, gallery
    detail, /config CDN pools), direct-first with worker `?d=` fallback.
    God Mode (`anime-api.js`) also queries `nhSearch`, but ONLY when the 18+
    Settings opt-in is on — otherwise nhentai is never touched (same rule as
    adult AniList titles). Cards show red `nhentai` server tag + 18+ badge +
    EN/JA badge; tap shows the 18+ safety warning modal every time, then opens
    the gallery in the Manga Reader with pre-resolved page URLs (surgical
    `manga-reader.js` change: `chapter.pages` bypasses MangaDex at-home
    resolution; progress namespaced under `nhentai:<id>`). Verified: jsdom
    35/35, real Chromium 10/10
    (screenshots `v2-nhentai-results.png`, `v2-nhentai-warning.png`,
    `v2-nhentai-reader.png`). Pack: `v2-nhentai-20260930.zip`. Local commit
    `a0ab568`, pushed 2026-09-30 (Render redeployed). Lesson: nhentai blocks datacenter IPs —
    sandbox/Render usually can't reach it; phone browser or the worker edge
    near the user is the real test. **Option 2 (Heliotrope/Hitomi mirror) is
    the planned backup provider — not built yet.**
14. **2026-09-30 — Heliotrope adult-manga provider (Option 2, backup).** New
    `js/heliotrope-provider.js`: keyless Heliotrope REST on
    `https://inst.psec.dev` (all-languages instance; API surface read from its
    live `/docs/openapi.json` and response shapes probed live).
    `POST /api/hitomi/search?offset=1` `{query:[q]}` -> `{results:[...]}`;
    card thumbnails via `GET /api/hitomi/thumbnail/{id}?size=big&single=false`;
    reader pages via `GET /api/hitomi/image/{id}`; titles via
    `GET /api/hitomi/galleryinfo/{id}`. ALL image URLs (cards + pages) are
    routed through Heliotrope's `GET /api/proxy/{urlencoded}` so the reader
    never hits CORS/hotlink walls. Direct-first, worker `?d=` fallback
    (worker v2+ forwards the POST body — verified). God Mode
    (`anime-api.js`) queries `htSearch` in PARALLEL with `nhSearch` under the
    same 18+ opt-in (`mpv2_settings_v1.adult`), per-provider isolation: when
    nhentai is down/blocked, hitomi results still land. Cards show purple
    `hitomi` server tag + 18+ badge + EN/JA/ZH/KO badge; tap shows the 18+
    warning every time, then opens the gallery in the Manga Reader with
    pre-resolved proxied pages (progress namespaced under `hitomi:<id>`).
    Verified: jsdom 29/29, real Chromium 10/10 (screenshots
    `v2-hitomi-results.png`, `v2-hitomi-warning.png`, `v2-hitomi-reader.png`).
    Pack: `v2-hitomi-20260930.zip`. Local commit `8bb818f`, NOT
    pushed 2026-09-30 (Render redeploying). Lesson: sandbox browsers fail CORS to inst.psec.dev AND
    block all external egress (even the worker), so the browser-side test
    used canned API responses; direct + worker paths were proven separately
    via curl. PHONE-TESTED 2026-09-30: Imran confirmed the live site works
    (God Mode + both adult providers).

15. **2026-09-30 — Popup OLED theme match + smooth poster tint.** Strict
    color-only pass, zero logic changes: the Server/Provider Selection popup
    (`.st-dialog` + its sticky `.st-head` in `css/stream.css`) was still on the
    old blue-tinted `rgba(14,14,20,.96)` / `rgb(14,14,20)` — now
    `background:#0a0a0c; border:1px solid #232326`, exactly matching the
    Trailer/External-Link warning popup (`.ext-confirm`), which was already
    OLED-compliant and untouched. Badges, rating colors, selection glow,
    buttons, and all popup logic unchanged. Poster tinting: `tintFromPoster`
    (`js/anime-online.js`) was already firing on anime/series/manga detail +
    character pages, but the tint snapped instantly; registered
    `@property --tone` (`syntax:'<color>'`, inherits, initial `#b54aea`) and
    added `transition: --tone .6s ease` on `.online-detail` so the chameleon
    accent cross-fades smoothly. Verified: real Chromium 8/8 (computed
    colors, transition presence, glow/button regression checks; screenshot
    `v2-provider-dialog.png`). Local commit, NOT pushed (needs fresh PAT).
    Phone test pending — only Imran's device counts.

16. **2026-09-30 — God Mode search parsing fixes (Reanime + Hindi-2).**
    Imran's screenshot showed Reanime cards rendering raw `[object Object]` /
    `[object Object] poster`, and Hindi-2 titles ending in junk
    `Download HD` (the card template appends `" poster"` to the alt, which is
    where the full `Download HD poster` came from). Fixes, normalization-only:
    `js/stream.js` — new `reStr()` helper unwraps nested title/poster objects
    (`{english/romaji/title/name}`, `{large/medium/small/url/src}`, else
    first string prop) so `searchReanime` always emits plain strings; dub
    detection now tests the extracted title. `js/codedew-hindi-provider.js`
    (`cdSearch`) — scraped titles are sanitized with
    `.replace(/\s+download(\s+hd)?\s*$/i,'')` so `... Episodes Download HD`
    becomes `... Episodes`; clean titles untouched. No routing/playback logic
    changed. Verified: real Chromium 15/15 against canned nested payloads.
    Local commit, NOT pushed (needs fresh PAT). Phone test pending.

17. 2026-09-30 — God Mode final routing/history/theme update (Imran approved
    exact diffs, then confirmed apply). `js/anime-online.js`:
    - God Mode cards no longer auto-play or directly open a reader.
    - MangaDex tap: removed the auto-first-chapter open; new
      `openGodChapterPicker()` shows the EN chapter feed in a popup and the
      reader opens only on the chapter the user picks.
    - Hindi tap: `Stream.playEpisode({title}, 1)` runs availability checks and
      opens the standard provider/server selection dialog (manual choice).
    - Reanime with AniList ID routes to the standard detail page; without ID
      falls back to the provider dialog. nhentai/Hitomi keep the 18+ warning
      gate and open the reader only on Proceed.
    - New `godRecordView(card, kind)`: every tap instantly calls `recordView()`
      for Recently Viewed. Adult galleries log only on 18+ Proceed (cancelled
      warning leaves no trace — same rule as standard detail). Manga/adult
      entries go to the manga Recently Viewed store.
    - Recently Viewed hrefs: real detail route where one exists (reanime +
      AniList ID); otherwise the search view `#/animation/search` (never a
      dead link). `recordView()` now accepts a supplied `d.href` override.
    - Hindi cards carry `data-god-slug`; MangaDex cards carry
      `data-god-title`; Reanime cards already carried title/AniList ID.
    - Only the provider-selection and external-link warning popup colors were
      touched (earlier commit); the chapter picker is styled to the OLED
      theme (`#101014`/`#232326`); the 0.6s poster tint transition is untouched.
    Verified: real Chromium 15/15 (dialog opens, no autoplay, picker lists
    chapters in order, reader NOT auto-opened, chapter pick opens reader,
    detail route, all three kinds logged with correct hrefs). Local commit
    6e34b9c, NOT pushed (needs fresh PAT). Phone test pending.

18. 2026-09-30 — Final Combined Update: God Mode routing, adaptive layout,
    history & theme polish (Imran approved exact diffs, then confirmed
    apply). `js/anime-online.js`:
    - Hindi tap is now AniList-first: `godCleanHindi()` strips provider
      suffixes (Hindi/Hindi Dub/Dubbed/Episodes/Season N/Download HD), the
      cleaned title is searched on AniList, `godTitleMatch()` compares the
      top hit by normalized containment, and a match opens the real detail
      page `#/animation/online/anilist/<id>`. No match falls back to the
      existing provider dialog with a full streaming ctx
      (title/poster/provider:'hindi'/pid) — so video History entries now
      carry posters.
    - MangaDex tap opens the new adaptive `openGodMangaDetail()` info view:
      provider metadata (title/poster/status/year/chapter count/description/
      up to 8 tags) fetched in parallel with the EN chapter feed; missing
      fields are omitted, never break the layout. Reader opens only on the
      picked chapter, with enriched ctx
      (title/poster/href/readerProvider:'mangadex').
    - nhentai/Hitomi keep the exact 18+ warning/direct-reader flow; reader
      ctx enriched the same way (title/poster/href/readerProvider).
    `js/manga-reader.js`: `saveProgress()` now also calls `MPV2.Watch.upsert()`
    (throttled to 1 write per 8s per chapter) with kind:'manga', poster,
    href, provider, chapter/episode, chapterId, page position/duration —
    chapter reads land in the actual History Tab like video watches.
    `js/manga-source.js`: `openEntry()` takes the full ctx (title/poster/
    href/readerProvider) instead of a bare title string; both callers
    updated. `js/app.js`: `historyCardHtml()` renders manga entries
    (`CH <n>` badge, `Ch <n> · page <cur>/<total>`, Completed at the done
    threshold); new `reopenMangaEntry()` resumes nhentai/Hitomi/MangaDex
    reads from History Continue (re-resolves pages, restores ctx);
    `wireRecentWatched()` routes manga entries to it before video playback.
    `js/watch-history.js`: manga entries excluded from the anime
    episode-progress map (chapter progress stays in its dedicated store).
    `css/anime-online.css`: scoped `.god-detail`/`.god-dposter`/`.god-dinfo`/
    `.god-dmeta`/`.god-dstat`/`.god-ddesc`/`.god-dtags`/`.god-dtag` styles,
    OLED `#0a0a0c`-family, `.god-detail` carries `transition: --tone .6s`
    and `tintFromPoster()` is called on the popup. No badge, rating, global
    theme, provider-dialog, or external-warning logic touched.
    Verified: real Chromium **19/19** with canned AniList/MangaDex
    responses — Hindi match routes to the AniList detail page (query proven
    cleaned to "Naruto Shippuden"), no-match opens the provider dialog with
    full ctx and zero autoplay, detail popup shows poster/stats/desc/tags
    with chapters in order and no auto-reader, bare payload omits
    desc/tags gracefully, chapter pick writes a complete manga Watch entry,
    History card shows `CH 1`, Continue reopens the reader (no video
    element), nhentai 18+ gate intact with enriched ctx in history, reanime
    routing unchanged, ext-confirm popup still `#0a0a0c`/`#232326`,
    `--tone` set from the poster. Screenshot: `v2-godmode-detail.png`.
    Pushed 2026-09-30 (`928c030..b037d75` on main; Render auto-deploys).
    Phone test pending — only Imran's device counts.
19. 2026-09-30 — Conditional "Hentai" genre chip with direct adult-provider
    routing (Imran approved exact plan, then confirmed apply).
    `js/anime-online.js` only (+57 lines, no other file touched):
    - New `HENTAI_GENRE = '__hentai__'` sentinel (can never collide with a
      real meta-API genre).
    - `genreHtml()`: appends the "Hentai" chip only when `adultAllowed()`
      (the 18+ Settings opt-in) is on; 18+ off → chip never rendered. The
      one shared builder covers both the Discover block (Animation home)
      and the Manga tab.
    - `loadGenre()`: new branch at the top — when the sentinel genre is
      active it calls `loadHentaiGenre()` and never reaches
      `API().byGenre()` (AniList/Jikan/Kitsu are never queried). If the
      18+ opt-in was switched off mid-browse, it falls back to 'Action'.
      All call sites (chip tap, sort pill, retry, infinite-scroll sentinel)
      route through this branch.
    - New `loadHentaiGenre()`: queries `window.nhSearch('hentai')` and
      `window.htSearch('hentai')` in parallel (same adult pair God Mode
      uses), renders results with the existing `godCard()` builder (18+
      badge + server tag), `state.hasMore = false` so the sentinel stays
      quiet (provider search is single-page).
    - `wireDiscover()` click handler: new `[data-god-kind]` delegation at
      the top routes card taps to `window.MPV2.openGodCard()` — the exact
      18+ warning → reader pipeline, unchanged.
    No CSS, provider, settings, or theme changes (reuses `.chip` and
    `.god-card` styles).
    Verified: real Chromium **11/11** with canned nhentai/Hitomi
    responses — chip hidden with 18+ off, visible with 18+ on (Discover
    + Manga), Hentai click calls nhSearch + htSearch with zero
    AniList/Jikan traffic, grid renders 2 nhentai + 1 hitomi cards with
    18+ badges, card tap shows the 18+ warning (no auto-reader), Proceed
    opens the reader with provider pages, mid-browse 18+ opt-out falls
    back to Action with no adult call, normal Action genre still uses
    byGenre. Local commit, NOT pushed (needs fresh PAT). Phone test
    pending — only Imran's device counts.

## Standing rules — obey on every update

- Build strictly part-by-part; surgical changes only; **diagnose the exact cause before rebuilding**.
- Preview first. Build an APK only when explicitly requested; announce readiness, never attach it in chat.
- Screenshots go directly as chat images, never as links.
- Node/jsdom/browser checks are **never** device testing — only Imran's phone counts as verified.
- Never store passwords, tokens, TMDB keys, proxy credentials, or PATs in memory or files.
- No unapproved providers, no fake provider buttons, no unrelated upgrades without explicit approval.
- Preserve OLED styling, liquid-display effects, chameleon behavior, categorized Settings,
  and localStorage persistence.
