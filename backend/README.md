# Media Player V2 — backend

Streaming-services API for Media Player V2. Serves the frontend too, so one
process runs the whole app.

## Run

```bash
cd backend
npm install
npm start
```

Then open http://localhost:3101 (or `PORT=xxxx npm start`).

## API (`/api/stream`)

English (reanime.to + FlixCloud):

- `GET /api/stream/en/search?q=` — anime search
- `GET /api/stream/en/episodes?animeId=` — episode list for a reanime slug
- `GET /api/stream/en/servers?anilistId=&ep=` — servers for one episode
  (`[{serverName, dataType}]`, dataType is `sub`|`dub`) — powers the
  per-episode availability badges
- `GET /api/stream/en/watch?animeId=&anilistId=&ep=&type=sub|dub` —
  resolves to `{ stream, audioTracks, subtitles }`; `stream` is a proxied
  HLS playlist URL ready for hls.js

Generic upstream proxy (also used by the Hindi provider in the frontend):

- `GET|POST /api/stream/r?u=<b64url>&animeId=&ep=&xreferer=&xorigin=`
  - `u`: base64url of the upstream http(s) URL (required)
  - `animeId` + `ep`: enables FlixCloud playlist decrypt + URI rewrite
  - `xreferer` / `xorigin`: forwarded as Referer / Origin headers
  - POST bodies are forwarded with their content type

The Hindi provider (`js/kanasu-hindi-provider.js` in the frontend) runs in
the browser and reaches ToonStream/RubyStream only through this proxy —
browsers block those sites directly.
