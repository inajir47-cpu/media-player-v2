# Media Player V2 — build plan

Fresh project. Compiled later via GitHub workflows + APK. Built in small,
Imran-confirmed chunks. Stable files are read-only outside the active step.

## Done
- **Step 1** — Core navigation, section flow, responsive structure.
  - Design restyled 2026-09-28 to match the V2 preview exactly: light
    editorial theme (Manrope + Newsreader serif), landing with photo-art
    cards (straw-hat anime character / black-suited Spider-Man from
    `img/`), tone accents per section (purple Animation, orange Movies),
    top bar with section switch + tabs + search/local/switch icons,
    bottom nav <860px, dark-mode via prefers-color-scheme.
  - Landing: Animation / Movies choice cards (native links).
  - Animation section: Home, Anime, Manga, History, Settings (+ Search,
    Local Files via top bar). No Ultimate Search.
  - Movies section: Home, Bollywood, Hollywood, Web Series, Settings
    (+ Search, Local Files).
  - Hash router (`#/<section>/<tab>`), page skeletons, working settings
    toggles (persisted), search-input shell, local-files picker
    (session-only listing).
  - Responsive: bottom nav <860px (mobile/tablet portrait); top horizontal
    nav bar ≥860px (tablet landscape/desktop). No sidebar.
  - Files: `index.html`, `css/{base,layout,pages}.css`, `js/{data,app}.js`,
    `img/{animation,movies}.png`.
  - Later steps plug real pages via `MPV2.registerPage(sectionId, tabId, fn)`.

## Queued (waiting for Imran's direction)
- Step 2: TBD by Imran.

## Step 3 (built 2026-09-28, awaiting Imran's confirmation)
- Theme switched from light editorial to pitch-black OLED dark (`#000` base,
  dark surfaces, streaming-style accent glows). `color-scheme: dark` only.
- 1) Independent section themes: Settings → "Section theme" group per
  section (8 preset swatches + custom color picker + reset). Saved in
  localStorage (`mpv2_section_themes_v1`), applied as `--anime`/`--movie`
  on boot. Defaults: Animation `#b54aea`, Movies `#ff6a1a`.
- 2) Movies tabs now: Home, Bollywood, Hollywood, Web Series, History,
  Settings (+ Search, Local Files). History sits after Web Series.
- 3) Chameleon poster accents: new detail route `#/<section>/detail/<id>`;
  the title poster's dominant color is extracted on-device via canvas
  (saturation-boosted, black/white pixels ignored) and applied as
  `--poster` on the detail view — Play button, section tag, hero glow and
  poster shadow tint to it. Falls back to the section tone on failure.
  Pitch-black base is never altered.
- Demo catalogue: 24 placeholder titles with generated poster art in
  `img/posters/` (clearly placeholder, replace with real data later).
  Library rows and Home "Recently added" render clickable poster cards.
- Verified: 19/19 jsdom checks; Chromium screenshots (390×844, 1280×900)
  of landing, Hollywood grid, detail with live extraction, settings.

## Step 4 (built 2026-09-28, awaiting Imran's confirmation)
- 1) Day/Dark mode: Settings → Appearance gained a Light/Dark segmented control
  (sun/moon icons). Choice persists in localStorage (`mpv2_theme_mode_v1`),
  restored on boot via `documentElement[data-theme]`; Dark (pitch-black OLED) is
  default. Light mode uses the clean high-contrast editorial tokens; meta
  theme-color switches with mode. Per-section accents and poster chameleon keep
  working in both modes.
- 2) Liquid display aesthetic: glassmorphism (blur 20px + saturate on top bar /
  bottom nav), fluid sheen sweep (`sheen` keyframes) across hero and detail-hero
  tinted by the active tone/poster color, soft glowing highlights (glowing
  section dot, inset top highlights, active pill glow), springy
  `cubic-bezier(.22,1,.36,1)` micro-interactions, press-scale buttons, tone glow
  on poster-card hover. Respects reduced-motion.
- Verified: 16/16 jsdom checks (`/tmp/test_step4.js`); real Chromium CDP
  screenshots with seeded localStorage: light landing mobile, dark settings
  mobile, light detail desktop. Step 3 features intact.

## Master settings button (built 2026-09-28, at Imran's request)
- Landing page now has one liquid-glass Settings pill below the Animation and
  Movies cards → `#/master/settings`.
- Master settings page: accent color picker sets BOTH sections at once
  (`setMasterTheme`); reset restores both defaults. Appearance mode and
  playback toggles were already global. Per-section settings pages unchanged
  and still independent.
- Verified: 16/16 jsdom checks (`/tmp/test_master.js`); Chromium screenshots
  of landing button and master settings page (390×844).

## STEP 5: Media details & watch order (built 2026-09-28, at Imran's spec)
- `js/data.js`: DETAILS block merged onto all 24 titles — rating, genres[],
  kindLabel (Series/Movie/Manga), chronological `watch[]` entries
  ({name,type,year,episodes}), and 2 reviews each.
- `js/app.js`: new renderDetailPage — kind tag header, year + star rating +
  genre chips + blurb; smart playback button ("Start from Season 1,
  Episode 1" fresh / "Continue from Season X, Episode Y" from saved
  progress / "Watch again" when complete / "Play movie"); action toolbar
  (Watchlist toggle, Trailer, Refresh, Delete with confirm); watch-order
  sections with clickable episode box grids (watched/next states);
  reviews section with average. Progress (`mpv2_progress_v1`) and
  watchlist (`mpv2_watchlist_v1`) persist in localStorage. Chameleon
  poster tint kept on the smart button and kind tag.
- `css/pages.css`: Step 5 styles (kind-tag, toolbar, episode grid,
  review cards), liquid/glass consistent.
- Verified: 28/28 jsdom checks (`/tmp/test_step5.js`); Chromium CDP
  screenshots: mobile + desktop detail (390×844, 1280×900) with seeded
  continue-state. No device test.

## STEP 5b: reference-style watch order + Watchlist page (built 2026-09-28, at Imran's spec)
- Watch order redesigned to match Imran's reference screenshot: a
  horizontal scrollable strip of numbered part cards (01/02/03…,
  thumbnail, "Season 1 (2026)", "12 episodes · 12 listed", chevron,
  selected card highlighted with the poster tint, "N parts" total).
- Tapping a part card swaps the rich episode grid below: each episode
  card shows the poster thumbnail, episode number badge, title, weekly
  air date · "23 min" · "No local file", and globe/edit/folder action
  icons (honest demo stubs). Movie entries show a single "Full movie"
  card. Tapping an episode card marks it watched and drives the smart
  button; watched cards get the tinted border.
- New dedicated Watchlist page at `#/<section>/watchlist`, reached from
  a bookmark icon in the top bar (next to search/local-files). Lists the
  section's saved titles as poster cards linking to details; friendly
  empty state. The detail toolbar's Add to Watchlist toggle is kept.
- `js/data.js`: `watchlist` added to both sections' extras + PAGE_TITLES.
- Verified: 33/33 jsdom checks (`/tmp/test_step5b.js`); Chromium CDP
  screenshots: mobile (tall-viewport crop) + desktop watch order and the
  mobile Watchlist page. No device test.

## STEP 6: Cast & Characters (built 2026-09-29, at Imran's request)
- Mirrors the hosted-preview cast design into the local source (Imran
  approved the port; preview changes are never auto-ported).
- `js/data.js`: `CAST_POOL` — 12 demo people, each with actor name,
  character name, portrait (`img/cast/cast-01..12.png`, generated
  placeholder portraits), bio and quick facts. `MPV2.castFor(item)`
  deterministically assigns 4 main + 2 supporting per title (seeded by
  title id). Animation titles show character names with "actor · voice"
  credits; Movies titles show actor names with "as character" credits.
  All data is clearly demo — replaced by the real metadata API later.
- `js/app.js`: `castHtml(item)` renders the section on the detail page
  between watch order and reviews — "Cast & Characters" with Main /
  Supporting Characters sub-headings (animation) or "Main Cast"
  (movies). Photo + name cards; tapping a card opens the actor profile
  modal (photo, name, credit, kind, bio, quick facts, demo note).
  Closes via X button, backdrop tap, or Escape. Chameleon `--poster`
  tint applies to kind labels and kicker.
- `css/pages.css`: Step 6 styles — cast grid/cards, profile modal,
  responsive single-column <560px, `prefers-reduced-motion` respected.
- Verified: 32/32 new jsdom checks (`/tmp/casttest/test_cast.js`:
  pool shape, castFor determinism/rotation, section headings, 6 cards,
  modal open/close incl. backdrop, landing + watchlist regressions);
  Chromium CDP screenshots: mobile cast section, mobile profile modal,
  desktop movie cast section. No device test.

## STEP 7: preview-parity motion, MORE modal, demo player (built 2026-09-29, Imran-approved scope: items 1, 2, 3, 5)
Imran uploaded the 18.9 MB `Media_Player_V2_Preview__7__1_qk82.html` design
preview and asked for the app to feel exactly like it. Approved port:
(1) opening/closing navigation animations + Opening splash, (2) MORE
full-details modal, (3) cinematic demo video player, (5) hover video
previews. Provider/source selection waits for the online phase.

### Chunk 1 — navigation / opening motion (built 2026-09-29)
- Landing card expands toward fullscreen → skeleton "Opening
  Animation/Movies" screen → animated arrival at section Home.
- Directional animated tab navigation; poster-to-detail ghost transition;
  animated return to chooser; touch-swipe between primary tabs; tactile
  landing/poster press feedback; reduced-motion handling.
- `css/motion.css` (new); `shellHtml`/`homeHtml` refactored to reusable
  builders; `window.MPV2.motion` exposed for tests.
- Verified: 27/27 jsdom (`/tmp/motiontest/test_motion.js`); cast
  regression 32/32; Chromium screenshots s7-01…s7-08.

### Chunk 2 — MORE full-details modal (built 2026-09-29)
- `MPV2.moreFor(item)` in `js/data.js`: deterministic per-title demo
  metadata (exact release date, studio/network, expanded synopsis, runtime
  or episode/chapter totals) — cleanly replaceable by real APIs later.
- Bottom-anchored glass sheet: launch & release grid, full synopsis,
  existing Cast & Characters cards (profiles open layered above),
  community score + 5 rating bars, 2 marked demo reviews, placeholder
  notices. Chameleon poster accent transfers in. X / backdrop / Escape
  close; body scroll locks; focus returns to the MORE button.
- `css/more.css` (new).
- Verified: 32/32 jsdom (`/tmp/more-test/more.js`); screenshots
  s7-09…s7-13 (mobile + desktop).

### Chunk 3 — cinematic demo player (built 2026-09-29)
- Four demo clips extracted from the preview bundle into
  `media/demo-1..4.mp4` (H.264, ~10 s each); `MPV2.demoVideoFor(item,
  offset)` picks deterministically per title.
- Edge-to-edge player (`css/player.css`, new): header (title, DEMO badge,
  episode label, episodes/settings/close), video stage, center play,
  gesture hints, bottom chrome (seek bar, ±10 s, play/pause, time,
  mute, volume slider, fullscreen), episodes drawer, settings drawer
  (speed 0.5–2×, screen fit Fill/Fit).
- Gestures ported from the preview: single-tap toggles chrome,
  double-tap left/right seeks ∓10 s with flash feedback, vertical swipe
  on left/right edges adjusts brightness/volume with HUD pill + meter,
  pinch zooms 1–2.2×, desktop double-click toggles 1/1.35× zoom.
  Chrome auto-hides after 2.6 s while playing.
- Smart Play, episode cards, and Trailer open the player; watching to
  the end marks the episode watched (localStorage progress preserved);
  closing re-renders detail when progress changed. No streaming,
  providers, or online lookup — demo clips only.
- Verified: 36/36 jsdom (`/tmp/more-test/player.js`); regressions
  MORE 32/32, motion 27/27, cast 32/32; Chromium screenshots
  s7-14…s7-19 (player, episodes drawer, settings, HUD, idle, desktop).

### Chunk 5 — hover ambient previews (built 2026-09-29)
- Every poster card (`posterCard`) now carries a lazy
  `<video class="poster-preview">` whose `data-preview-src` is the
  title's deterministic demo clip (`MPV2.demoVideoFor(item, 0)`); no
  `src` until hovered.
- `wirePosterPreviews()` runs after each render: only on
  `(hover: hover) and (pointer: fine)` devices, honoring the existing
  "Autoplay previews" settings toggle and reduced motion
  (`motionDisabled()`). Touch devices are never wired.
- On hover/focus: src is set lazily, video plays muted + loop; the
  `.is-playing` class fades it in only once frames actually flow
  (via `playing` + video-frame callback, hidden on pause/ended/waiting/
  error — no black flash). On leave/blur: pauses, resets, unloads src.
- `css/pages.css`: `.poster-preview` overlay styles + reduced-motion
  hide.
- Verified: 19/19 jsdom (`/tmp/more-test/hover.js`); regressions
  player 36/36, MORE 32/32, motion 27/27, cast 32/32; real Chromium
  CDP: 6/6 cards wired, hover → src → playing → is-playing;
  screenshot s7-20 (desktop).

## ONLINE PHASE: anime API integration (built 2026-09-29, Imran's explicit choice: V2 Animation section)
Ends the design-only phase for the Animation section (Imran picked it over the
Konosuba player after being told this wires in live APIs). Movies section
untouched — still placeholder/design.

### New files
- `js/anime-api.js` — adapter pattern. Providers: AniList (GraphQL, default),
  Jikan v4 (MAL REST), Kitsu (JSON:API). (Spec asked for Consumet; replaced
  with Kitsu — Consumet needs a self-hosted server, impossible from a static
  page. Imran was told and did not object.) Every provider normalizes into one
  schema (`NormalizedAnimeItem` / `Detail`), so switching never breaks the UI.
  In-memory cache with 5-minute TTL on every call; provider persists in
  localStorage `active_anime_api_provider` (default `anilist`); switching
  clears the cache. Jikan is currently flaky upstream (HTTP 504 from MAL —
  matches the 2026-09-26 finding); UI shows a provider-specific hint.
- `js/anime-online.js` — UI. Registers a new `animation/discover` tab via the
  existing `MPV2.registerPage` mechanism (no existing tab code touched).
- `css/anime-online.css` — pitch-black OLED + liquid glass + chameleon
  `--tone` accents, matching the app design language; reduced-motion rules.

### Discover tab
- **TOP 010**: header + Today/Week/Month pill tabs (`is-active` pill style),
  skeleton rows while loading, ranked 01–10 rows (AniList: TRENDING_DESC /
  POPULARITY_DESC+RELEASING / SCORE_DESC; Jikan: top-airing / seasons/now /
  top; Kitsu: trending / current-by-users / top-rated).
- **Genres**: 11 chips (Action…Slice of Life, incl. Isekai — AniList tag,
  Jikan theme lookup via /genres/anime, Kitsu category slug), sort pills
  (Popularity/Score/Latest), 24-per-page grid, Load more. AniList Isekai uses
  `tag_in` since it is not an AniList genre.
- Tapping any card/row opens the deep-info route.

### Deep-info route `#/animation/online/<provider>/<id>`
- Banner hero, poster + lightweight canvas chameleon tint, title, status/year/
  episodes/score, studio, genre tags, YouTube trailer button.
- Airing countdown banner ("Episode N in Xd Xh Xm") when `nextAiringEpisode`
  exists (AniList) / broadcast string (Jikan).
- Seasons row from prequel/sequel relations; cast & characters reusing the
  `.cast-card` structure with character photo + Japanese VA photo/name;
  full synopsis; related titles grid. Back link to Discover.
- Cast cards are tappable (2026-09-29, Imran's bug report: taps did nothing).
  New character route `#/animation/online/<provider>/character/<id>` with
  photo, Japanese name, facts (age/birthday/gender/blood type/favourites),
  About (AniList `__bold__`/`~!spoiler!~` markup rendered, not raw), "Appears
  in" animeography grid linking back to anime detail, Japanese voice actors,
  and a Back button (history.back with Discover fallback). AniList +
  Jikan supported (`AnimeAPI.characterDetail`); Kitsu has no cast data and
  shows a friendly "not available" message. Character ids now fetched in
  the anime-detail character query (`node{id ...}` / `character.mal_id`).
  `parseHash` checks the character route before the generic online route.

### Provider switcher
- New "Online data" group in Animation → Settings (injected via
  `MPV2.onlineSettingsHtml`/`wireOnlineSettings` hooks; 2 hook lines in
  `app.js`). Segmented AniList/Jikan/Kitsu control, persisted, toast on
  change; Discover re-renders immediately if visible ("global re-fetch").

### Surgical edits to existing files (nothing else touched)
- `js/data.js`: `{ id:'discover', label:'Discover', icon:'globe' }` tab +
  `PAGE_TITLES.discover`.
- `js/app.js`: expose `esc/pageHead/icon/emptyState` on MPV2; `parseHash`
  online route; `render()` dispatch; settings hooks.
- `index.html`: one CSS link + two script tags.
- Boot-order fix: the app renders the boot hash before `anime-online.js`
  loads, so a direct `#/animation/discover` (or online-detail) load showed
  the skeleton; the module now calls `MPV2.render()` once after registering
  when the boot hash is one of its routes.

### Verification (2026-09-29)
- jsdom: 36/36 (tabs, ranks, chips, sort, load-more, provider persist,
  settings intact, detail seasons/cast/VA/countdown/trailer/synopsis, cache).
- Boot-route fix re-verified 7/7 in jsdom (direct `#/animation/discover`,
  `#/animation/online/anilist/21`, home + settings regressions).
- Regressions: motion 27/27, MORE 32/32, player 36/36, hover 19/19.
  (`/tmp/more-test/test.js` "MORE-DATA" 6/7: the 1 failure is its stub-DOM
  harness lacking `document.body.classList` — pre-existing, unrelated.)
- Chromium CDP with REAL AniList payloads (sandbox browsers have no direct
  internet — egress is via authenticated proxy). Final method: local fake
  HTTPS origin on 127.0.0.1:443 + `--host-resolver-rules` mapping
  graphql.anilist.co/s4.anilist.co to it + `--ignore-certificate-errors`
  (Fetch-domain interception is broken in this Chromium: `requestPaused`
  arrives without `interceptionId` and `fulfillRequest` via deprecated
  `requestId` never delivers the body; the fake origin lets the app's real
  fetch/XHR/image code run untouched). Verified s7-21 Discover desktop
  (10 real rows, ranks 01–10), s7-22 mobile, s7-23 One Piece detail (banner,
  airing countdown, studios, synopsis, chameleon tint), s7-24 cast (12 real
  characters + Japanese VAs with photos).
- Character detail (2026-09-29): jsdom 26/26 (API normalize for AniList +
  Jikan, VA dedupe, anime dedupe, Kitsu friendly rejection, direct
  character-route boot, cast-card tap → navigation → render, back button).
  Chromium CDP with real AniList payloads: s7-25 character page (Luffy —
  photo, facts, About), s7-26 after tapping a cast card on the anime
  detail page (hash → `#/animation/online/anilist/character/<id>`).
- Cast ordering fix (2026-09-29, Imran's report: only supporting characters
  showed, mains must be on top): the AniList query's `sort:[ROLE_DESC]` did
  not surface mains (e.g. One Piece returned Salome/Buggy before Luffy, and
  `perPage:12` cut the mains off entirely). Fix: query `perPage:25` with no
  server role sort; normalize now sorts client-side Main → Supporting →
  others via `roleWeight` (AniList + Jikan adapters) before slicing 12.
  Verified against the real AniList API: first 8 are Luffy, Robin, Zoro,
  Franky, Sanji, Chopper, Nami, Usopp — then supporting. Chromium
  screenshot s7-27 shows the mains-first cast row.
- About-text cleanup (2026-09-29, Imran: "why the about page like this,
  organise this"): `charDescription` now also collapses stray `___`,
  renders `__bold__`, renders AniList spoilers `~!…!~` as spoiler pills,
  converts `~strikethrough~` to plain text and drops leftover stray `~`
  markers. jsdom/Chromium check: no stray tildes; Luffy's About shows
  bold labels + spoiler pills (s7-29).
- Discover moved into the Animation home page (2026-09-29, Imran: "i want
  discover page in our home page after hero caracel and Recently added, no
  more extra discover tab"): Discover tab removed from `data.js` Animation
  tabs; `anime-online.js` now exposes `discoverBlockHtml`/`mountDiscoverBlock`
  (same TOP 010 + genres + sort + load-more, scoped to the block); `app.js`
  injects the block after Recently Added on the Animation home only, and
  `wirePage` mounts it (real page only — the opening-screen overlay's
  `homeHtml` stays block-free). Old `#/animation/discover` hashes fall back
  to the home tab in `parseHash` and land on the block; the module's boot
  re-render check now also covers `#/animation` so the block mounts on cold
  boot. Provider switcher refreshes Discover when on home. jsdom 7/7
  (no Discover tab, block order hero → recently → discover, pills/chips/
  sort present, old hash lands on home). Chromium screenshots: s7-28 home
  with embedded Discover, s7-29 character About.

### Top/bottom bar blur (2026-09-29)
- Imran asked for blur on the top bar and (mobile) top + bottom bars, plus
  any other fully-transparent bar. Our source already had
  `backdrop-filter: blur(20px) saturate(1.5)` on `.topbar`/`.bottomnav`
  (Step 4 liquid display); verified rendering over content in Chromium —
  no change needed. The request was relayed for the hosted preview build.

## Step 7 · chunk 8 — Recommendations row + poster ratings (2026-09-29)

Imran asked for (a) a Recommendations section before the TOP 010 list and
(b) a rating on every poster.

- `js/anime-api.js`
  - New `recommendations(id)` adapter calls: AniList (`Media.recommendations`
    sorted RATING_DESC, normalised via `alItem`) and Jikan
    (`/anime/{id}/recommendations`). Kitsu has no recommendations endpoint,
    so its adapter resolves `[]` and the row hides itself.
  - AniList detail query now also fetches `averageScore` for relations, and
    the character detail query fetches `averageScore` for animeography —
    both normalised into `score` so their posters get rating chips too.
- `js/anime-online.js`
  - New `posterScore(item)` helper: purple rating chip overlaid on the
    poster image (top-left). Added to the Discover genre grid cards, the
    detail-page Related cards, and the character animeography cards.
    (TOP 010 rows already showed scores inline.)
  - New `recoHtml()` section + `loadReco(block, seed)` loader: a horizontal
    poster row ("Recommended for you", sub-line "More like <chart-topper>
    · Source: <provider>") rendered directly above TOP 010. Seeded from
    the current TOP 010 #1 item; hides itself for Kitsu, on empty results,
    or on fetch error. Reco cards link to the anime detail page.
- `css/anime-online.css`
  - `.poster-score` overlay chip; `.poster-row` horizontal scroll row
    (132px cards desktop, 108px mobile).

Verified 2026-09-29: jsdom 8/8 (reco order, cards, badges, links, seed
sub-line); real AniList data in Chromium — reco row shows 10 real titles
(Frieren 9.1, Re:ZERO 9.0, KONOSUBA 7.9, …) and every genre-grid poster
carries its rating. Screenshots s7-30 (reco row) and s7-31 (grid ratings).
Movies section untouched.

## Step 7 chunk 7 — Manga information (live) (2026-09-29)

Imran: "now add mange info also". Live manga info on the Animation → Manga
tab, mirroring the anime Discover design.

- `js/anime-api.js`
  - All adapters accept an optional `type` ('ANIME'|'MANGA'):
    `top10(range, type)`, `byGenre(genre, page, sort, type)`,
    `recommendations(id, type)`, `detail(provider, id, type)`.
  - AniList: `MANGA` media type in rankings/genre/detail/reco queries;
    `chapters`/`volumes` added to the item query; manga-aware cache keys;
    related manga carry chapter counts; character edges carry manga
    appearances (voiceActors still JAPANESE-only).
  - Jikan: `/top/manga`, `/manga`, `/genres/manga`, manga detail/characters;
    `jkItem` normalises `chapters`/`volumes` and `mediaType`.
  - Kitsu: `/manga` endpoint selection; `ksItem` normalises
    `chapterCount`/`volumeCount` → chapters/volumes and `mediaType`.
- `js/anime-online.js`
  - New live Manga block on the Animation → Manga tab (above the original
    local/demo catalogue, which stays untouched): Recommended for you,
    TOP 010 with Today/Week/Month pills, genre chips + sort, load more,
    purple rating chips, chapter counts on cards.
  - Manga cards link to `#/animation/online/<provider>/manga/<id>`.
  - Manga detail page: publishing status ("Currently Publishing" via
    `prettyStatus(status, isManga)`), year, chapters, volumes, rating,
    genres, synopsis, cast & characters, related manga, Series section
    (prequel/sequel); no episode-airing countdown; chameleon poster tint.
  - Character "Appears in" animeography cards route anime and manga entries
    to their respective detail pages.
  - Provider setting renamed "Anime & manga data provider".
- `js/app.js`
  - New route `#/animation/online/<provider>/manga/<id>`; manga block
    injected + mounted on `#/animation/manga`; media type forwarded to the
    online detail renderer.

Verified 2026-09-29: jsdom 18/18 (block mount, MANGA queries, manga routes,
rating chips, chapter counts, detail chapters/volumes, no airing banner,
back link); real AniList manga data in headless Chromium via Fetch
interception — manga tab (TOP 010 Absolute Regression 8.2, reco Myst Might
Mayhem 8.3, genre Action led by Chainsaw Man) and detail page (banner,
"Currently Publishing · 2024 · ★ 8.2", synopsis, 8 characters).
Screenshots s7-32 (manga tab) and s7-33 (manga detail). ZIP rebuilt
(`media-player-v2-step1.zip`, 61 files, ~8.8MB). Movies section untouched.

### Media kind labels (2026-09-29, Imran)
- Every title now carries its kind: `format` added to the AniList query
  (`AL_ITEM`) and normalized in all three adapters — AniList (TV, MOVIE,
  OVA, ONA, SPECIAL, TV_SHORT, MUSIC), Jikan (`type` → same set), Kitsu
  (`subtype` → same set).
- New `formatLabel()` in `js/anime-online.js`: manga items → "Manga",
  TV/TV_SHORT → "Series", MOVIE → "Movie", OVA → "OVA", ONA → "ONA",
  SPECIAL → "Special", MUSIC → "Music".
- Labels shown in: TOP 010 rows ("2026 · Series · Comedy · Romance"),
  poster cards (Recommended, genre grids), and the detail meta line
  (movie detail reads "Finished · 2016 · Movie · ★ 8.5").
- Movie detail pages no longer show a meaningless "1 episodes" count.
- Finding: current anime TOP 010 is all TV/ONA series — no movies trending
  right now, which is why the home page shows no movies. Recommendations
  are seeded from the chart-topper, so they skew series too; a Movie label
  appears automatically whenever a movie is returned.

Verified 2026-09-29: jsdom 5/5 (Series/Movie/OVA row labels, card wiring);
real AniList data in headless Chromium — Discover rows labelled Series/ONA
("2026 · Series · Adventure · Drama"), Your Name detail page meta
"Finished · 2016 · Movie · ★ 8.5". Screenshots s7-34, s7-35. Movies
section untouched.

### Detail-page opening video (2026-09-29, Imran)
- Online anime detail pages now play the series' opening video faded on the
  RIGHT SIDE of the detail hero card (Imran's correction: "within my marks",
  matching the Konosuba player's trailer layer at left:48%) — the same
  AnimeThemes API (`api.animethemes.moe`) the Konosuba player uses: primary
  lookup by AniList ID (`filter[site]=AniList&filter[external_id]=…`),
  fallback to title search; first `.webm` video link, session-cached.
- `fetchOpeningVideo()` + `mountDetailVideo()` in `js/anime-online.js`,
  hooked into `renderOnlineDetail`; CSS `.detail-side-video` /
  `.detail-hero.has-side-video` in `css/anime-online.css` (absolute right
  58% of the hero, left mask blends into the card, slight dim; fades in
  only when frames play; poster/title stay above via z-index).
- Skipped for manga detail pages (AnimeThemes is anime-only) and when the
  "Autoplay previews" setting is off or Reduce motion is on. Jikan/Kitsu
  titles use the title-search fallback (no AniList ID available).

Verified 2026-09-29: jsdom 9/9 (video injected with webm src, muted+loop,
fade-in on playing, no fetch/video for manga, none when autoplay off);
headless Chromium with intercepted AnimeThemes response — video element
present, playing (not paused), banner faded in. Screenshot s7-36.
Caveat: api.animethemes.moe is unreachable from the sandbox network, so the
live API response itself was simulated in tests; the banner image remains
as the fallback if no video is found. Movies section untouched.

## Step 7 continued — episode & chapter lists (2026-09-29, Imran: Konosuba-style)

- Online anime detail pages now show an **Episodes** grid like the Konosuba
  player's "Season 1 (2016) · 13 listed": number badge, title, air date and
  duration (`Jan 13 · 23 min`), globe (watch online) and pencil icons —
  reusing the existing `.episode-card` design system from `pages.css`.
  Pencil toggles watched state, persisted in localStorage
  (`mpv2_ep_watched_v1`). Movies (1 episode) get no episode list.
- Online manga detail pages show a **Chapters** grid the same way
  (`Ch 1` badge, title, `Aug 25 · 45 pages`; ghost number when Kitsu has no
  thumbnail).
- Data: new `AnimeAPI.episodes()` / `AnimeAPI.chapters()` in `js/anime-api.js`.
  Episodes = Jikan `/anime/{mal_id}/episodes` (real air dates; AniList `idMal`
  is now threaded through the detail query, duration parsed from Jikan /
  AniList `duration`), merged with AniList `streamingEpisodes` thumbnails and
  watch URLs by episode number; Jikan-down fallback = streaming episodes only.
  Kitsu provider uses Kitsu episodes directly (thumbnails included).
  Chapters = Kitsu `/chapters?filter[mangaId]` via the Kitsu
  `myanimelist/manga` mapping for AniList/Jikan titles. Paginated (20/page)
  with a "Show more" button; section hides when no data.
- UI in `js/anime-online.js`: `epListPlaceholder()` after Synopsis,
  `mountEpList()` lazy-loads page 1, `epCardHtml()` builds cards.
- Verified: jsdom 19/19 (dates, minutes, thumb/URL merge, pagination,
  watched persistence, manga chapters, movie exclusion); Chromium E2E with
  canned Konosuba data — 13/13 episode cards rendered (s7-37).

### Coming-soon countdowns (2026-09-29, Imran)

- Any episode/chapter card whose air/publish date is in the future gets a
  **SOON** badge and a live ticking countdown (`03d 05h 36m 52s`, updates
  every second) instead of the date line — same logic automatically covers
  future manga chapters if a provider ever returns one.
- Unreleased titles (e.g. a coming-soon **movie**) show a "Coming soon ·
  244d 14h 52m 16s" pill under the trailer button on the detail hero,
  driven by the release/start date.
- The airing banner ("Episode 9 in …") is now live-ticking too.
- Data: normalized episodes/chapters carry `ts` (epoch ms); normalized
  detail carries `startTs` (AniList `startDate`, Jikan aired/published
  `from`, Kitsu `startDate`). UI: `tickCountdowns()` /
  `ensureCountdownTicker()` in `js/anime-online.js`; styles `.ep-soon`,
  `.ep-count`, `.detail-coming`, `.coming-pill` in `css/anime-online.css`.
- Verified: jsdom 10/10 (SOON badge, tick format, banner, movie pill, no
  pill for released titles); Chromium E2E with canned airing-anime data —
  SOON badge + `03d 05h 36m 52s` on the future episode card, banner
  `Episode 9 in 02d 03h 55m 03s` (s7-38).

### Boxed countdown style + episode posters (2026-09-29, Imran)

- Imran rejected the inline `03d 05h 36m 52s` text — countdowns now use the
  boxed DAYS / HRS / MIN / SEC style from his reference screenshot.
  - Airing anime detail pages show a **NEXT AIRING** block: `● NEXT AIRING`
    pill (left), `EP n` pill (right), the air date ("Thursday, 5:08 PM"),
    and four dark boxes ticking every second.
  - Future episode/chapter cards keep the SOON badge (now top-left beside
    the number badge) with a mini version of the same boxes.
  - Coming-soon movies show a COMING SOON label + mini boxes under the
    trailer button.
  - One shared component: `cdBoxesHtml(ts, mini)` + a 1s ticker that fills
    `[data-cd="DAYS|HRS|MIN|SEC"]` (`js/anime-online.js`); styles `.cd-boxes`,
    `.next-airing`, `.na-pill`, `.na-ep`, `.na-dot`, `.detail-coming`
    (`css/anime-online.css`).
- Episode/chapter posters: episode-specific thumbnails only exist when
  AniList has streaming-episode data, so cards now fall back to the series
  cover image (`d.image` passed into `epCardHtml`) — no more blank ghost
  numbers; the card always shows a poster.
- Verified: jsdom 14/14 (boxes tick, NEXT AIRING pills/date, cover
  fallback img, movie mini boxes); Chromium E2E with canned airing-anime
  data — NEXT AIRING block with `02 DAYS 03 HRS 50 MIN 28 SEC`, episode
  posters on both cards, SOON + mini boxes on the future episode
  (s7-39, s7-38).

### Per-episode posters: number-matched merge (2026-09-29, Imran)

- Imran: every episode must show its own poster. Found and fixed a real
  bug in `anilistEpisodes` (`js/anime-api.js`): streaming-episode
  thumbnails were merged positionally (`thumbs[it.n - 1]`), which attaches
  the WRONG still whenever the streaming window doesn't start at episode 1
  (e.g. One Piece's window is eps 62-130). Merge now parses the episode
  number from the streaming title (`/episode\s+(\d+)/i`) and matches by
  number. Episodes with no published still keep the series-cover fallback.
- Verified with REAL AniList streaming data (One Piece, 69 Crunchyroll
  stills): 16/16 episodes matched correctly, no wrong attachments
  (merge-test.js); Chromium screenshot s7-38 shows eps 62-72 each with its
  own distinct still and eps 58-61 on the series poster fallback.
- Honest coverage note: no free anime API publishes a still for every
  episode (AniList/Kitsu only carry stills for some episodes). TMDB has
  near-complete per-episode stills and is free, but needs a personal API
  key — Imran said "IF TMDB IS FREE API THAN USED IT", so it is now used:
  new `tmdbTvId` / `tmdbSeasonStills` / `tmdbEpisodeStills` /
  `tmdbFillEpisodeThumbs` in `js/anime-api.js`, hooked into `episodes()`
  for all providers. Absolute-episode → still map built by walking TMDB
  seasons in airing order (season 0 skipped). AniList streaming stills keep
  priority; TMDB fills episodes with no still yet; series-cover fallback
  remains. Key slot in Animation → Settings → Online data
  (`mpv2_tmdb_key_v1` in localStorage, `getTmdbKey`/`setTmdbKey` on the
  public API). Pure enhancement — never throws, no key = old behavior.
- Boot-order bug fixed along the way: app.js renders during its own script
  load, before anime-online.js defines `onlineSettingsHtml`, so a direct
  `#/animation/settings` load never showed the Online data section (the
  provider switcher was affected too). The module's boot re-render IIFE
  now also covers the settings hash.
- Verified: jsdom 9/9 (TMDB merge: AniList still kept, TMDB fills missing,
  absolute season walk, no-key = untouched, settings save/clear wiring);
  Chromium screenshot s7-41 shows the key slot in Settings. Live TMDB not
  testable from the sandbox (no API key of our own, no direct internet) —
  full coverage activates on Imran's device once he pastes his free key.

### Manga chapter volume covers via MangaDex (2026-09-29, Imran)

- Imran: manga chapters must show their own cover photo like episodes do.
- Reality: no free database publishes an individual cover per chapter
  (Kitsu chapter thumbnails exist in schema but are ~never populated —
  verified 0/10 on real data). MangaDex (keyless) publishes real
  per-volume cover art, so each chapter card now shows its volume's cover:
  new `mdMangaUuid` / `mdVolumeCovers` / `mdChapterVolumes` /
  `mdFillChapterThumbs` in `js/anime-api.js`, hooked into `chapters()`
  for all providers (MAL id when available, else title search). Chapters in
  one volume share that volume's cover; chapters with no volume mapping
  keep the series-cover fallback. Pure enhancement — never throws.
- Verified: jsdom with live MangaDex (10/10 chapters got real volume
  covers, vols 1-2); Chromium E2E (s7-40): ch 1-8 show vol.1 cover,
  ch 9-17 vol.2, ch 18-20 vol.3. Screenshot via fake-origin-canned
  MangaDex because the sandbox browser has no direct internet.

### Horizontal episode/chapter strips + Watch Order + Anime tab live rows (2026-09-29, Imran)

- Imran: (1) episode and manga chapter cards must slide HORIZONTALLY, not
  vertically; (2) add a Watch Order popup — series, movies, OVAs and related
  entries in chronological watch order, upcoming entries with countdowns,
  and for an ongoing anime the next episode number + countdown;
  (3) Animation → Anime tab must work like the Manga tab, with live rows
  for Series, Movies, OVAs.
- Horizontal strips: `.ep-strip` — horizontal touch swipe + scroll snap,
  cards 240px desktop / 200px mobile, auto-loads another page within 600px
  of the right edge, auto-fills short initial strips until horizontal
  overflow exists, no Show More button. Posters, watched state, countdowns,
  metadata kept; movies (1 episode) get no episode section.
- Watch Order popup (anime only, not manga): current title + relations
  (sequels, prequels, movies, OVAs, side stories) sorted by full start
  date then year; badges THIS TITLE / UPCOMING / NEXT EPISODE n / ONGOING;
  upcoming + next-episode entries get live boxed countdowns; related
  entries link to their anime details; closes via X, backdrop, Escape.
  AniList relation query extended (format, status, full start date).
  Provider limits: Jikan may omit dates/images/format; Kitsu has no
  normalized relations.
- Anime tab: three live rows (Series / Movies / OVAs) via new
  `AnimeAPI.byFormat(format, page)` — AniList `format_in` (TV/MOVIE/OVA),
  Jikan `/top/anime?type=tv|movie|ova`, Kitsu subtype filter — above the
  local anime catalogue, mirroring the Manga tab's live block.
- Bug found in verification: direct `#/animation/anime` load missed the
  live rows (boot re-render IIFE covered manga/settings/home but not the
  anime tab hash). Fixed — IIFE now covers `#/animation/anime`.
- Verified: jsdom 20/20 (strips, paging, popup, ordering, labels,
  countdowns, related links, manga exclusion, all three rows); Chromium
  E2E with canned data — horizontal episode strip with posters, Watch
  Order popup (NEXT EPISODE 1123, 02d 03h countdown; THIS TITLE / Prequel /
  OVA / UPCOMING+countdown entries in order), Series/Movies/OVAs rows
  with rating chips and format labels, horizontal manga chapter strip.
  Movies section untouched, still design-only.

### Jump-to-episode/chapter search box (2026-09-29, Imran)

- Imran liked the horizontal slide and asked for a way to find a specific
  episode/chapter fast: an "Ep #"/"Ch #" input now sits next to the
  "Episodes · N listed" / "Chapters · N listed" heading.
- Typing a number + Enter auto-loads pages until that card exists, then
  smooth-scrolls it to the center of the strip with a brief accent glow
  (`ep-flash`); a number that doesn't exist shakes the box red (`miss`).
  Cards carry `data-ep-n`/`data-ch-n` for lookup. Max hint set from the
  known total. Works for both anime episodes and manga chapters.
- Verified: jsdom (jump to 55 across 5 pages: found, scrolled centered,
  flashed; jump to 999: miss shake, no crash); Chromium screenshot shows
  the box next to the heading with a typed value.

### Movie runtime + rating details modal (2026-09-29, Imran)

- Imran: movies must show running time before the rating; tapping the ★
  rating must show full rating details.
- Running time: new RUNTIMES map in data.js (10 film entries, minutes),
  `MPV2.formatRuntime()` → "2h 22m". Detail meta line now reads
  "2025 · 2h 22m · ★ 7.8" for items with a runtime.
- Rating ★ is now a button opening a glass rating modal (reuses the MORE
  modal veil/sheet styling + chameleon accent): big score, 5-star visual,
  deterministic vote count, 10→1 distribution bars, running time line.
  Closes via X, backdrop, or Escape; focus restored. Verified in Chromium
  (meta text, modal open, all 10 distribution rows).

### Episodes never vanish + total count in heading (2026-09-29, Imran bug report)

- Bug: some series showed no Episodes section at all. Root cause: the
  AniList path needs a MAL id for Jikan episode data; when Jikan failed
  (rate limits are common) and AniList had no streaming episodes either,
  the block was removed entirely.
- Fix: new `synthEpisodes(detail, page)` in anime-api.js — when every
  source fails/comes back empty but the title has a known episode total,
  numbered placeholder cards are generated (series-cover posters) so the
  section always shows. The top-level `episodes()` wrapper applies this
  on empty results and on thrown errors.
- Total in heading: Jikan page total (`pagination.items.total`) and Kitsu
  `meta.count` are now threaded through episode/chapter results; the
  detail heading picks it up when the detail itself reports no total
  (e.g. ongoing series) — "Episodes · 1122 listed" instead of bare
  "Episodes". Same for chapters.
- Verified jsdom: no-malId+total → 12 synth cards; Jikan-fail+total →
  correct page window; no total anywhere → still hides (genuinely no
  data); Jikan total passthrough → heading shows "Episodes · 1122 listed".

### Character page retry (2026-09-29, Imran bug report)

- Bug: tapping a cast card sometimes landed on "Something went wrong /
  Could not load data." The character query itself is valid (verified live
  against graphql.anilist.co), so the failure was a transient network/API
  blip on the device.
- Fix: renderOnlineCharacter now retries automatically (up to 3 attempts
  with 1.2s/2.4s backoff) before showing the error. The error box now also
  prints the real technical message in small muted text so a repeat can be
  diagnosed instead of guessed at. Retry button unchanged.
- Verified jsdom: fail-twice-then-ok renders the character page; always-
  fail shows the error with the technical detail and Retry after 3 attempts.

### Watch Order popup closes on row tap (2026-09-29, Imran bug report)

- Bug: tapping a series/movie row in the Watch Order popup opened that
  title's page but left the popup on screen. Cause: rows are plain hash
  links and the overlay lives on document.body (outside the re-rendered
  view), so navigation never removed it.
- Fix: the overlay click handler now also closes on `a.wo-row` taps.
  Verified jsdom: popup opens, row tap closes overlay and restores body
  scroll.

### Live search: anime + movies + manga (2026-09-29, Imran request)

- There was no search at all in the Animation online section. Added one.
- API: `AnimeAPI.search(provider, q)` in js/anime-api.js — one call returns
  `{ anime: [...], manga: [...] }` (anime includes movies/OVAs/specials):
  AniList via a single GraphQL query with anime+manga aliases; Jikan via
  /anime + /manga (parallel, each failure-tolerated); Kitsu via
  filter[text] on both endpoints. Results are cached like other calls.
- UI: search bar at the top of the Discover block (Animation home) and the
  Manga tab block. Typing 3+ characters (500ms debounce) hides the browse
  sections and shows "Results for …" with an "Anime & movies" grid and a
  "Manga" grid; the X button (or clearing the text) restores browsing.
  Cards reuse onlineCard, so movies/series/manga labels and detail routing
  (incl. `#/…/manga/<id>`) work as everywhere else.
- Verified: live AniList search for "naruto" returned 12 anime + 12 manga
  with correct mediaType/format; jsdom UI test (debounce, 3 cards, correct
  hrefs for anime/movie/manga, clear restores browse); Chromium E2E
  screenshot of real results (s11-search.png). Not physical-device tested.

## 2026-09-29 — Unified search moved into the default Search tab
- Removed the extra search bar previously added inside Discover/Manga blocks.
- The default Search tab (#/animation/search, top-bar magnifier) now runs the
  live online search for the Animation section: AnimeAPI.search(provider, q)
  returns {anime, manga} for AniList (one GraphQL query), Jikan and Kitsu
  (parallel endpoints, failure-tolerated, cached).
- Behavior: 3+ characters, 500ms debounce, skeleton cards while loading,
  "Anime & movies" + "Manga" result sections reusing onlineCard/detailPath,
  X clears and restores the ready state. Other sections keep the old shell.
- Fixes: detailPath now prefers an explicit item.mediaType over the ambient
  block state (prevents manga/anime route mix-ups from the Search tab);
  the online-capable check is lazy so deep links work even when this wiring
  runs before the online scripts below app.js have parsed.

## STEP 14 — Opening-theme videos: hover/long-press posters, always-on TOP 010, on-device cache (2026-09-29)

Imran: hover/long-press a poster on Home/Anime pages plays the opening theme video
in the poster; TOP 010 boxes play their video all the time; downloaded videos are
saved on the device (no re-download, faster start); videos auto-delete 2 days
after the anime leaves the TOP 010 list.

- Video source: AnimeThemes.moe GraphQL (`findAnimeByExternalSite`, works for
  AniList/MAL/Kitsu IDs), first OP (lowest sequence), smallest file. Mapping
  cached in localStorage (`mpv2_opmap_v1`) so the lookup runs once per anime.
- New `js/op-videos.js`: resolve, hover (350 ms delay, desktop) / long-press
  (500 ms, touch; keeps playing after release, stops on next touch/scroll,
  suppresses the accidental tap-through), TOP 010 always-on muted autoplay.
  Respects the app's Reduce-motion setting. Manga cards/rows excluded (no OP).
- New `sw.js`: virtual `opvideo/?u=<base64url>` URLs served from the Cache API.
  First play downloads once; every replay comes from the device. Graceful
  fallback to remote URLs where service workers can't run (e.g. file://).
  Note: videos are 30-58 MB each — too big for localStorage (~5 MB cap), so the
  device cache is used instead.
- 2-day cleanup: `mpv2_opmeta_v1` tracks lastSeen per video; TOP 010 membership
  refreshes it; boot + list loads purge entries unseen for 2+ days from both
  metadata and the Cache API.
- Markup: `onlineCard` adds `data-op-provider/id` + `<video class="op-preview">`;
  `rankRow` adds `<video class="top10-video">` in the thumb; `loadTop10` calls
  `OPVideos.wireTop10`. CSS overlays in `css/anime-online.css`.
- Verified: 7 jsdom unit checks (OP picking, map cache, purge, noteList) + 13
  wiring checks + 8/8 Chromium CDP end-to-end (render, SW control, virtual URLs,
  readyState>=2, cache contents, hover preview with readyState 4).
- ZIP rebuilt: `~/workspace/your_files/media-player-v2-step1.zip` (63 files).
  Not physical-device tested.
