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
20. 2026-09-30 — TMDB recommendations for Movies + Anime (Imran pasted his
    own TMDB API key in chat and asked for it to be used; key is NEVER
    stored in code/memory/files — it lives only in the existing runtime
    Settings slot `mpv2_tmdb_key_v1`, entered by Imran at Animation →
    Settings → Online data → TMDB API key).
    `js/anime-api.js`: new cached `tmdbTrendingMovies(includeAdult)` →
    `/trending/movie/week` and `tmdbTvRecommendations(title,
    includeAdult)` → title search + `/tv/{id}/recommendations`, both
    normalized to {id, media, title, image, year, rating} via the existing
    `tmdbGet`/`cached` plumbing (key-change cache invalidation already
    handled); never throw — no key or any failure resolves to [].
    `js/anime-online.js`: new "Trending Movies" block on the Movies home
    (`tmdbMoviesBlockHtml` + `mountTmdbMovies`) — poster cards with year +
    TMDB rating; without a saved key it shows a pointer to the Settings
    field instead of a dead row. New "More Like This" row on the anime
    detail page (`mountTmdbRecommendations`, seeded by the title, skipped
    for manga/adult titles). Cards link out to the title's TMDB page; the
    existing document-level external-confirm modal handles the tap, so
    Movies stays design-only (no in-app detail/playback pipeline added).
    `js/app.js`: two surgical insertions following the Discover-block
    pattern (append block HTML on movies home, mount in `wirePage`).
    Verified: real Chromium **9/9** with canned TMDB responses — no-key
    prompt with zero TMDB traffic (movies home + detail), key set renders
    2 trending cards (title/year/rating, `api_key=` on the request), card
    href points at themoviedb.org, tap opens the external-confirm modal
    without leaving the app, detail page shows "More Like This" with the
    canned recommendation (search + recommendations endpoints called),
    and the key string never appears in page HTML. Local commit
    `4e7dc17`, PUSHED 2026-09-30 (Imran pasted a fresh PAT in chat, used
    transiently and scrubbed from the remote URL; `b037d75..4e7dc17` on
    main, Render auto-deploys). Phone test pending — only Imran's device
    counts.
21. 2026-09-30 — APK build pipeline (Imran explicitly asked for the APK
    file). New `.github/workflows/build-apk.yml` (manual
    `workflow_dispatch` trigger; same Capacitor 6 + Gradle debug-APK
    route as the proven konosuba builder): bundles `index.html` +
    `css/` + `js/` + `img/` + `media/` into `www/` (backend/, worker/,
    docs, Dockerfile excluded), drops `sw.js` (a service worker would pin
    stale builds inside the WebView; `app.js` already tolerates a failed
    registration), rewrites same-origin `/api/*` calls to
    `https://media-player-v2.onrender.com/api/*` at build time (inside the
    APK the origin is `https://localhost`, so the live Render backend
    serves streaming/search), app id `app.mediaplayerv2`, version 2.0.0,
    icon/splash generated from `img/movies.png` (best-effort step; the APK
    builds even if icon generation fails). Third-party APIs (TMDB,
    AniList, Jikan, MangaDex) are absolute https URLs — untouched.
    BUILT 2026-09-30 at Imran's explicit request: workflow run
    36737927822 succeeded, `Media-Player-V2-2.0.0-debug.apk` (17.2 MB,
    sha256 `34ebf28a…b948b5`, package `app.mediaplayerv2`) verified —
    backend `/api/*` calls rewritten to the Render origin (4 files, zero
    relative leftovers), custom icon present, `sw.js` excluded. Copy in
    `~/workspace/your_files/media-player-v2-backup/`. NOT phone-tested —
    only Imran's device counts.
22. 2026-09-30 — APK streaming fix (Imran reported no provider streaming
    worked in the APK). Root cause: `js/stream.js` builds backend URLs as
    `location.origin + '/api/...'`, which resolves to `https://localhost`
    inside the APK WebView. The workflow now rewrites that form as a
    single unit FIRST, then standalone `/api/` literals (the first attempt
    stacked both rewrites and doubled the origin — caught in verification,
    that build was discarded and never sent to Imran). Commits `d80130b` +
    `bef4d40`, pushed with a fresh transient PAT (scrubbed after). Imran
    runs the workflow and downloads the APK from GitHub himself.
23. 2026-09-30 — Hardware/gesture back-button fix (Imran approved the
    exact diffs before apply). New `js/back-button.js` exposes
    `window.__mpv2BackPressed()`: closes the topmost overlay first
    (`.ext-confirm` → `.md-reader` via `MPV2.MangaReader.close()` →
    `#moreModal`/`#ratingModal` → any `.st-scrim` by clicking its own
    `.st-x`, each module's X already wired to its own close fn), then
    `history.back()` for in-app navigation, then double-press-to-exit
    with a "Press back again to exit" toast on the root `#/` home.
    The video player's existing back→mini-player popstate behavior in
    `stream.js` is deliberately preserved (not closed). `index.html`
    loads the new file last. The workflow now overwrites the default
    Capacitor `MainActivity` with one whose `onBackPressed()` asks the
    JS handler first via `evaluateJavascript`: `'1'` = consumed in-app,
    `'exit'` = confirmed exit → `finishAffinity()` (avoids the trap where
    the WebView's own history would navigate back INTO the app instead
    of exiting), otherwise the default WebView-back/exit. Verified:
    JS syntax OK, workflow YAML valid, heredoc-extracted Java keeps its
    `\"` escapes, jsdom 6/6 (overlay closes, reader close, ext-confirm,
    non-root history.back, root double-press → 'exit'). Website behavior
    untouched (no native caller there). NOT phone-tested — only Imran's
    device counts.
24. 2026-09-30 — View-reset + overflow hardening (Imran approved the exact
    diffs before apply). (a) `js/app.js` `render()` now preserves scroll
    position on same-hash re-renders: provider switches, TMDB key
    save/clear, and the late-module boot re-render no longer jump to top;
    real navigations (hash changed) still scroll to top, and fresh boot is
    unaffected (`lastRenderedHash` starts `null`). Tab taps, swipe tabs,
    and the motion system were audited and are clean (active-tab taps
    guarded, `motion.busy` resets on every path). (b) `css/base.css`:
    `overflow-x:clip` on `html`+`body` as a page-level horizontal-scroll
    guard — `clip` (not `hidden`) so the sticky topbar keeps working.
    Measured in real Chromium at phone widths before the change: zero
    page-level horizontal overflow on all 9 routes (landing, animation
    home/discover/anime/manga/settings/history, movies home, both detail
    pages); overlays are all `fixed inset-0` / `width:min(...)`, viewport
    meta + global `box-sizing` already correct. Verified jsdom 5/5
    (boot→top, nav→top, same-hash preserves scroll). NOT phone-tested —
    only Imran's device counts.
25. 2026-09-30 — Modal popup scroll containment (Imran approved the exact
    diffs before apply; screenshots showed the character popup's scrollbar
    bleeding past the rounded corners and running over the sticky header).
    `js/anime-online.js` `openPopup()`: body wrapped in a dedicated
    `<div class="st-scroll">`. `css/anime-online.css`: `.st-dialog.rv-dialog`
    is now `overflow:hidden` + flex column with `padding:0` (the
    `.st-dialog.rv-dialog` specificity is deliberate — stream.css loads
    after this file, so a bare `.rv-dialog` lost on overflow/padding);
    `.st-head` is a fixed relative bar (`z-index:5`); only `.st-scroll`
    scrolls (`overflow-y:auto`, `overflow-x:clip`), with the slim OLED
    scrollbar moved onto it. The dialog frame clips the scrollbar to its
    20px radius; the scrollbar can never cross the header/✕ again.
    Covers all four `openPopup()` popups: Rating & Reviews, Character,
    Voice actor, MangaDex chapter picker. Provider chooser (stream.js)
    untouched — separate pattern, offered as follow-up. Verified real
    Chromium 11/11 (computed styles, header pinned while body scrolls,
    dialog within 82vh, screenshots top+bottom states clean). NOT
    phone-tested — only Imran's device counts.
26. 2026-09-30 — Review image attachments render inline (Imran approved the
    exact diffs before apply; screenshots showed raw `~img420(URL)~` strings
    in Rating & Reviews). `js/anime-online.js`: new `rvImg()` helper +
    `rvMd()` now converts AniList `~img420(URL)~` / `img420(URL)` and
    markdown `![alt](URL)` into lazy-loaded `<img class="rv-img">`
    (async decoding, broken images hide via onerror); image passes run
    BEFORE the link/bold/strike/spoiler passes so nothing collides, and
    `esc()` still runs first so URLs stay attribute-safe. Raw HTML `<img>`
    in reviews stays escaped (deliberate — un-escaping would open XSS).
    `css/anime-online.css`: `.rv-img` OLED styling (block, max-width 100%,
    12px radius, subtle border) + light-mode variant. Verified real
    Chromium 9/9 with the shipped parser (3 tags → 3 imgs, zero raw text,
    links/bold/strike intact, broken img hides, loaded img stays visible
    within body, light-mode rule present). NOT phone-tested — only Imran's
    device counts.
27. 2026-09-30 — Episode list truncation fix (Imran approved the exact diff
    before apply; detail header said "Episodes · 19 listed" but the grid
    stopped at 11). Root cause: the synth fallback in `js/anime-api.js`
    `episodes()` only fired on ZERO provider items, but Jikan
    rate-limit/empty failures fall back to `streamEpsFallback()` — a
    SUBSET of streaming episodes with hardcoded `hasMore:false` — so the
    strip never loaded more. Fix: when the known total exists, the provider
    claims the list is complete (`!hasMore`), but returned fewer items,
    the missing numbers are synthesized (real cards kept untouched, still
    get air dates + TMDB stills downstream). Page 1 fills all missing
    1..N; later pages only extend the tail beyond the highest provided
    number (the strip appends, so no duplicates); empty later pages left
    alone. Verified node 9/9 (reported-bug case, full pages untouched,
    page-2 tail fill without dupes, empty-page fallback, unknown total
    untouched, gappy provider). Chapters use a different pattern (no synth
    fallback) — left alone. NOT phone-tested — only Imran's device counts.
28. 2026-09-30 — Live countdown timers for unreleased episodes: VERIFIED
    ALREADY SHIPPED, no code change. Imran requested the feature; inspection
    showed it fully built: `epCardHtml()` detects future episodes
    (`it.ts > Date.now()`), paints a SOON badge + boxed DAYS/HRS/MIN/SEC
    countdown (`cdBoxesHtml(it.ts, true)`), a single global 1-second ticker
    (`ensureCountdownTicker()`, started on detail render) updates every
    `[data-cd-boxes]` in the document (late-paginated cards included), and
    stream.js only paints playback badges/globe when a staged source exists
    (unaired cards get none). Verified end-to-end in real Chromium against
    the shipped page with seeded cache (3-episode detail, ep 3 airing in
    2d 3h 4m): 3 cards rendered, ep 3 showed SOON + 02/03/03/51 countdown
    matching the seeded timestamp, aired eps showed normal dates, no globe
    on the unaired card, SEC ticked 53->50 over 2.6s (ticker live).
    Screenshots: countdown-strip.png, countdown-ep3.png. NOT phone-tested
    — only Imran's device counts.
29. 2026-09-30 — Cross-media routing for Adaptation cards in the Related
    section: FIXED. Clicking an Adaptation relation that points to a Light
    Novel or One-Shot showed the retry/error screen. Root cause: the Related
    card render (`js/anime-online.js`) classified only `r.format === 'MANGA'`
    as manga-type, but AniList's manga-type media comes in three formats —
    `MANGA`, `NOVEL`, `ONE_SHOT` (all `type: MANGA`). Novels/one-shots fell
    through to the anime route, so the anime detail loader ran
    `Media(id, type: ANIME)` on a novel ID → AniList returned `Media: null`
    → `alItem(null)` threw on `m.id` → the detail `.catch` rendered the
    error screen. (Pure MANGA adaptations already routed correctly and were
    never broken.) Fix: one-line classifier —
    `r.format === 'MANGA' || r.format === 'NOVEL' || r.format === 'ONE_SHOT'`
    → novel/one-shot cards now route through `#/.../manga/<id>` into
    `renderOnlineDetail(..., 'MANGA')` → `anilistDetail(id, 'MANGA')` finds
    them. The router's manga branch already precedes the anime branch; the
    Recommendations strip already classifies by `mediaType` (unaffected);
    Jikan relations are anime-only upstream (nothing to fix there). Verified
    in real Chromium against the shipped page with seeded cache: before —
    novel card href `#/animation/online/anilist/333` → error screen; after —
    novel href `#/animation/online/anilist/manga/333` and one-shot href
    `#/animation/online/anilist/manga/444`, clicking the novel card rendered
    the novel detail with no error. NOT phone-tested — only Imran's device
    counts.
30. 2026-09-30 — Franchise/Seasons aggregation: FIXED (AniList). The Seasons
    strip showed only directly-linked SEQUEL/PREQUEL titles (e.g. KonoSuba S1
    + S2), missing S3, the movie, OVAs and spin-offs. Two compounding causes:
    (a) the filter dropped SIDE_STORY/SPIN_OFF/PARENT edges; (b) AniList
    relations are per-title, not per-franchise — S3 and the movie hang off S2
    (S1 -> S2 -> movie -> S3), so no filter widening alone could reveal them.
    Fix in `js/anime-api.js`: new franchise helpers — `alFranchise()` walks
    the sequel/prequel chain transitively (light relations-only query per hop
    via `alFranchiseRels()`, 48h-persistent in api48 like detail, capped at 15
    titles, manga-type formats excluded), collects directly-connected side
    stories/spin-offs/parent stories, and orders chain-first (prequels ...,
    this title, ... sequels) then sides by year. `frKind()` labels cards by
    format (Movie/OVA/Special) or relation (Sequel/Prequel/Side story/
    Spin-off). Every hop is failure-isolated — a dead hop ends that walk, a
    total failure falls back to the direct edges — so the detail can never
    error-screen because of this. Adaptations stay in Related; the render
    needed no change. Verified in real Chromium against the shipped page with
    fetch interception (KonoSuba-like 4-hop chain + OVA side story + novel):
    strip showed S1 (This season), S2 (Sequel), Movie (Movie), S3 (Sequel),
    OVA (Side story) in order, novel correctly absent, no error. Screenshot:
    franchise-strip.png. Jikan left as-is (its relations are already
    unfiltered anime-only; no multi-hop to respect its strict rate limits).
    NOT phone-tested — only Imran's device counts.
31. 2026-09-30 — Franchise strip: chronological release-date sorting. The
    strip now sorts ALL franchise nodes oldest-to-newest by air year via the
    new `frSortChrono()` in `js/anime-api.js` (decorated sort with explicit
    index tiebreak — same-year items keep chain order: prequels, this title,
    sequels, then side entries; unknown years sink to the end). Applied to
    both the transitive-walk result and the instant fallback in
    `anilistDetail()`, so both paths order identically. The "This season" card
    now sits at its own release year (identified by its kind label) instead of
    being pinned first. Verified in real Chromium with the KonoSuba-like
    chain: S1 (2016), OVA (2016), S2 (2017), Movie (2019), S3 (2024) — the OVA
    correctly interleaves ahead of S2, proving true chronological order.
    Screenshot: franchise-strip-chrono.png. NOT phone-tested — only Imran's
    device counts.

## Standing rules — obey on every update

- Build strictly part-by-part; surgical changes only; **diagnose the exact cause before rebuilding**.
- Preview first. Build an APK only when explicitly requested; announce readiness, never attach it in chat.
- Screenshots go directly as chat images, never as links.
- Node/jsdom/browser checks are **never** device testing — only Imran's phone counts as verified.
- Never store passwords, tokens, TMDB keys, proxy credentials, or PATs in memory or files.
- No unapproved providers, no fake provider buttons, no unrelated upgrades without explicit approval.
- Preserve OLED styling, liquid-display effects, chameleon behavior, categorized Settings,
  and localStorage persistence.
32. 2026-09-30 — Instant dynamic theme color (chameleon tint perf fix). The
    canvas was already 24x24 (pixel work = microseconds); the real delay was a
    SECOND full poster download+decode (`new Image()` with CORS can't reuse the
    non-CORS display `<img>` cache entry) with `--tone` unset until its onload.
    Rewrote `tintFromPoster()` in `js/anime-online.js`: (a) synchronous instant
    tone — localStorage cache hit (`mpv2:tone:v1`, cap 200) or deterministic
    title-hash HSL fallback, applied before first paint; (b) extraction now
    runs in `requestIdleCallback` (setTimeout fallback) with `decoding='async'`
    + `willReadFrequently`, stores the result in the cache; (c) `tintKey`
    stamp on `[data-tone-root]` blocks late async results from tinting a page
    navigated away from; (d) lookup now matches root itself or a descendant.
    Call sites pass title/name for the hash fallback. Verified in real Chromium
    against the shipped function with a local red PNG: phase 1 instant
    `hsl(166,45%,45%)` -> idle cross-fade to `rgb(255,0,0)`, cache persisted;
    phase 2 (repeat visit) instant `rgb(255,0,0)` with ZERO poster network
    requests. Screenshot: tint-proof.png. NOT phone-tested — only Imran's
    device counts.
33. 2026-09-30 — Disabled horizontal swipe-to-switch-tabs (product decision).
    `wireSwipeTabs()` in `js/app.js` (the only tab-switch gesture in the app:
    touchstart/touchend on #view, >72px horizontal swipe -> route transition)
    is now a documented no-op; the render() call site is untouched and the body
    can be restored from git history. Hero carousel swipes (slide changes,
    stopPropagation contained), video player gestures (seek/brightness/volume),
    and poster/episode strip scrolling are fully preserved — verified in real
    Chromium on #/animation/home with stubbed API data: 200px swipe on the tab
    page left the hash unchanged, hero swipe advanced slide 0->1, and tab bar
    tap navigated to #/animation/anime. NOT phone-tested — only Imran's device
    counts.
34. 2026-09-30 — Automatic provider fallback: Jikan/Kitsu -> AniList.
    `js/anime-api.js`: new `adapterCall()` wraps top10/byGenre/byFormat/search —
    any Jikan/Kitsu failure (429/5xx, timeout, network) transparently retries
    the equivalent AniList query; AniList is terminal and never falls back
    further; if the fallback also fails the ORIGINAL error is rethrown so
    retry screens keep their provider-specific hint. `detail()` and
    `recommendations()` bridge foreign ids first (`anilistIdFor()`: Jikan MAL
    id -> AniList `idMal` lookup; Kitsu id -> Kitsu /mappings -> MAL id ->
    `idMal`), cached, served under the original cache key. New 15s `timed()`
    wrapper on `jkGet`/`ksGet` so hanging providers engage the fallback
    instead of wedging the UI. Also fixed a latent bug: `jikanSearch`/
    `kitsuSearch` swallowed total blackouts into empty results (inner catch);
    now both-halves-failed rejects so the fallback engages, while one
    surviving half keeps the old partial-tolerance behavior.
    Verified in real Chromium with stubbed network: Jikan 429 -> top10 and
    MAL-id detail (bridged to AniList id 999 'Naruto') served from AniList;
    Kitsu 429 -> search served from AniList; Jikan recommendations bridged;
    double failure rethrows 'Jikan request failed (HTTP 429)'; hanging Jikan
    fell back after exactly 15.0s. Caveat: a fully-down Kitsu cannot serve its
    own /mappings, so Kitsu-id deep links still retry — lists/search fall back
    and fallback cards carry provider 'anilist', so normal navigation works.
    NOT phone-tested — only Imran's device counts.
35. 2026-09-30 — Instant episode loading + red globe for dead episodes.
    `js/stream.js`: removed the dead `hindiWithRetry()` (9s sleeps x2 per
    episode — retries could never succeed because hindiMatch/hindiDetail
    already cache failures as null, so it only burned ~18s per episode while
    holding a queue slot). `checkEpisodeStaged()` now runs a fast lane
    (EN/zanime/Hindi-2, holds the queue slot) and a detached Hindi slow lane
    that repaints on completion but never blocks other cards; slot releases
    when the fast lane settles. `wGetJSON()` (Cloudflare worker) capped at
    12s so a hung worker can't wedge the queue. New `done` callback fires
    when every lane settles: `paintCard(..., final)` paints nothing while
    checks are in flight, but on a final zero-source verdict renders a
    non-interactive red globe (`span.episode-action.st-globe.unavailable`,
    title/aria "No streams available") instead of no globe. `css/stream.css`:
    `.st-globe.unavailable` red tint (#f87171, SVG uses currentColor).
    Verified in real Chromium with stubbed providers (6/6): slow 3s Hindi
    scraper did not delay the EN SUB badge + blue globe (painted at 836ms);
    no globe painted while checks in flight; zero-source episode got the red
    span (computed rgb(248,113,113)); episode with sources kept its blue
    button globe; hung worker released at 12.1s with the queue unblocked.
    Preserved: staged badge painting, dialog refresh, queue dedupe,
    MutationObserver for late cards, manga chapter globes (untouched).
    NOT phone-tested — only Imran's device counts.
36. 2026-09-30 — DUB badge: stop caching transient English failures.
    Bug (Imran: DUB option missing on V2 website while Konosuba player shows
    it for the same title): `js/stream.js` `enServers()` cached the `[]`
    from a failed worker request in `serversCache` for the whole session, so
    one transient mobile-network failure hid SUB/DUB for that episode until
    reload. Konosuba's player uses XHR with a 20s timeout and no failure
    cache, so it survived the same network. Fix: the rejection handler now
    does `delete serversCache[k]` before returning `[]` — genuine empty
    results stay cached (no extra worker traffic), failures retry on the
    next check. Pairs with entry 35's 12s `wGetJSON` cap (already local,
    awaiting push): a hung/timed-out worker can no longer wedge the badge
    queue (MAXC=4) nor poison the cache. Verified jsdom 3/3 with the real
    stream.js: fail-then-revisit retried the worker and painted SUB+DUB.
    NOT phone-tested — only Imran's device counts.
37. 2026-10-01 — APK build: stop the /api/ rewrite from corrupting upstream
    provider URLs. Bug (Imran: fresh APK from b8c39de still had no English
    DUB and no hentai, while the PC website worked): build-apk.yml's sed
    rewrote EVERY '/api/ to the Render backend URL, including upstream
    providers' own API paths. In the APK, REANIME+'/api/flix/' became
    REANIME+'https://media-player-v2.onrender.com/api/flix/' (worker asked
    Render for ReAnime data -> 404 -> no DUB), NH+'/api/v2/...' became
    NH+'https://media-player-v2.onrender.com/api/v2/...' (hentai broken),
    and Z-Anime '/api/embed/' + hitomi '/api/hitomi/' + '/api/proxy/' were
    silently broken too. Fix: both seds now rewrite ONLY /api/stream/*
    (the app's own backend; verified all JS backend calls live under it),
    leaving every upstream /api/* path byte-identical. Verified by running
    the exact new seds on a fresh copy: 3 backend calls rewritten, 0
    upstream corruptions, 0 leftover relative backend calls, 0 doublings,
    node --check clean. Imran must re-run the workflow to get a fixed APK.
    NOT phone-tested — only Imran's device counts.
38. 2026-10-01 — Z-Anime English dub now lights the DUB badge. Gap (Imran:
    "add Z-Anime also for English"): Z-Anime was already a provider option
    (Z badge + "English sub & dub" dialog entry), but availability only
    probed its SUB embed — its DUB was never checked, so it could never
    light the DUB badge. Fix: js/zanime-provider.js extracted the probe
    into zProbe(anilistId, ep, audio, cache) with separate sub/dub session
    caches, added zHasDub() (exported as window.zaHasDub); js/stream.js
    checkEpisodeStaged() probes zaHasDub in the fast lane — a dub hit sets
    avail.dub + avail.zanime (provider option appears even when only dub
    exists). Sub behaviour byte-identical. Verified node: sub probe hits
    .../1/sub, dub probe hits .../1/dub, caches independent, no refetch on
    repeat. Zane's upstream could not be verified from the sandbox (worker
    unreachable from here) — phone test is the verdict. NOT phone-tested.
39. 2026-10-01 — Added JustAnime provider (Z-Anime Provider 2). Imran asked
    to reverse-engineer Z-Anime's other providers and add them. RE of the
    Z-Anime watch-page JS mapped all 5 providers: hianime (ZANE CLOUD),
    justanime (senshi API — "Ultra fast adfree sub/dub + Hindi"), anilist
    (10+ subtitles), zplayer (embed, already integrated), mutti (kitty).
    Only justanime's backend was fully isolated. New js/justanime-provider.js:
    GET senshi.zanethegodcracker.workers.dev/api/watch/{anilistId}/{sub|dub}/{ep}
    -> {success, streamUrl, streams[], subtitles/tracks[], intro, outro};
    Hindi endpoint also documented ({S}/hindi?title=&episode=&season=) but not
    wired (our Hindi lanes are separate). API + stream host send ACAO:*, so the
    phone calls them directly. stream.js: JustAnime feeds SUB/DUB badges,
    appears as its own "JustAnime" provider option, playback hands the direct
    HLS URL + subtitles to the player. Verified node with stubbed fetch
    (avail sub/dub, stream fallback streams[0].url, subtitle mapping, session
    cache) + live senshi responses from sandbox. Permission note: Zane's
    explicit permission covered the zplayer embed; senshi/justanime workers are
    his private infra — Imran (co-admin) approved integrating. NOT phone-tested.
40. 2026-10-01 — Z-Player now uses all embed servers (hd-1/2/3), not just
    hd-1. Imran confirmed. js/zanime-provider.js: zFindServer() tries every
    server in SERVERS order and caches the first working one per
    (anilistId, ep, audio); an episode counts as available when ANY server
    has it. zHasEpisode/zHasDub use it; new bestServer() feeds playback.
    js/stream.js: the za playback branch resolves bestServer() and builds the
    embed URL with it (falls back to hd-1). Verified node: hd-1 fail ->
    hd-2 probed and used, embed URL correct, session cache stops refetches,
    sub/dub caches independent. NOT phone-tested.
41. 2026-10-01 — JustAnime dialog fix (Imran's phone screenshot): selecting
    JustAnime showed no language options and the wrong subtitle
    ("English stream · FlixCloud"). Cause: providerDesc()/providerLangs()
    had no branch for the new kind 'ja'. Added both, mirroring 'za':
    desc "English sub & dub · senshi", langs Japanese/English
    (Japanese->sub, English->dub). Also fixes the in-player language
    switcher, which uses providerLangs(). NOT phone-tested.
42. 2026-10-01 — hanime video provider added (Imran confirmed). hanime.tv's
    API is signature-walled (all direct endpoints 404/401), so the
    open-source hanime.tv-api scraper worker was deployed to Imran's own
    Cloudflare account as hanime-scraper
    (https://hanime-scraper.gmpdi020.workers.dev) using a transient API
    token (discarded; first token pasted had wrong permissions, second
    worked). Worker verified live: /api/search?q= and /api/video/:slug
    return results + 720p/480p/360p m3u8 streams.
    App wiring: new js/hanime-provider.js (haSearch God Mode items with
    kind 'hanime' + isAdult, video() picks best quality); index.html loads
    it; anime-api.js adds haSearch to God Mode jobs behind the 18+ opt-in;
    anime-online.js renders hanime cards (18+ badge) and openGodCard plays
    them after the adult warning; stream.js adds kind 'ha' resolve branch
    and public playHanime(slug,title,poster) (isMovie hides episode nav).
    Committed locally, NOT pushed, NOT phone-tested.
43. 2026-10-01 — Hentai genre on homepage now includes hentai videos
    (Imran: "need to show in homepage hentai in genres"). The Hentai genre
    chip (18+ opt-in only) already existed; loadHentaiGenre only pulled
    nhentai + hitomi manga. One-line addition: the genre grid now also
    queries window.haSearch('hentai'), so hanime videos mix into the same
    grid (cards already render/play via the earlier hanime wiring).
    Committed locally, NOT pushed, NOT phone-tested.
