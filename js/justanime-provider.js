/* JustAnime provider — Z-Anime's Provider 2 ("Ultra fast adfree sub/dub + Hindi").
 * Reverse-engineered from the Z-Anime watch page (2026-10-01); responses
 * verified live. API + stream host both send `Access-Control-Allow-Origin: *`,
 * so the phone calls them directly — no worker hop needed.
 *   GET {S}/watch/{anilistId}/{sub|dub}/{ep}
 *     -> { success, streamUrl, streams:[{url,type}], subtitles, tracks, intro, outro }
 *   GET {S}/hindi?title={t}&episode={e}&season={s} -> { success, streamUrl }
 * S = https://senshi.zanethegodcracker.workers.dev/api
 */
(function () {
  'use strict';

  var SENS = 'https://senshi.zanethegodcracker.workers.dev/api';

  function watchUrl(anilistId, audio, ep) {
    return SENS + '/watch/' + encodeURIComponent(anilistId) + '/' +
      (audio === 'dub' ? 'dub' : 'sub') + '/' + encodeURIComponent(ep);
  }
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('ja ' + r.status);
      return r.json();
    });
  }
  function pickStream(d) {
    if (!d || !d.success) return null;
    if (d.streamUrl) return d.streamUrl;
    var st = d.streams || d.sources || [];
    if (st.length) return st[0].url || st[0].file || null;
    return null;
  }
  function pickSubs(d) {
    var out = [];
    (d.subtitles || d.tracks || []).forEach(function (s) {
      var f = s && (s.url || s.file);
      if (f) out.push({ url: f, label: s.label || s.lang || s.language || 'English', lang: 'en' });
    });
    return out;
  }

  // Availability, cached per (anilistId, ep, audio) for the session.
  var availCache = {};
  function jaProbe(anilistId, ep, audio) {
    if (!anilistId || !ep) return Promise.resolve(false);
    var key = anilistId + ':' + ep + ':' + audio;
    if (key in availCache) return Promise.resolve(availCache[key]);
    return getJSON(watchUrl(anilistId, audio, ep)).then(function (d) {
      var ok = !!pickStream(d);
      availCache[key] = ok;
      return ok;
    }, function () { return false; });
  }
  function jaHasEpisode(anilistId, ep) { return jaProbe(anilistId, ep, 'sub'); }
  function jaHasDub(anilistId, ep) { return jaProbe(anilistId, ep, 'dub'); }

  // Resolves to { url, subtitles, intro, outro } for the player.
  function jaWatch(anilistId, ep, audio) {
    return getJSON(watchUrl(anilistId, audio, ep)).then(function (d) {
      var url = pickStream(d);
      if (!url) throw new Error('No stream on JustAnime');
      return { url: url, subtitles: pickSubs(d),
               intro: d.intro || null, outro: d.outro || null };
    });
  }

  window.JustAnimeProvider = {
    id: 'justanime',
    label: 'JustAnime',
    hasEpisode: jaHasEpisode,
    hasDub: jaHasDub,
    watch: jaWatch
  };
  window.jaHasEpisode = jaHasEpisode;
  window.jaHasDub = jaHasDub;
})();
