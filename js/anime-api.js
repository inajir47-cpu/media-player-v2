/* ============================================================================
 * MEDIA PLAYER V2 · ONLINE PHASE — multi-API anime data layer
 * ----------------------------------------------------------------------------
 * Adapter pattern: AniList (GraphQL), Jikan (MAL REST), Kitsu (JSON:API).
 * Every provider is normalized into one schema so the UI never breaks when
 * the user switches source in Settings.
 *
 * NormalizedAnimeItem:
 *   { key, provider, id, title, image, banner, score, popularity,
 *     genres[], status, year, episodes, synopsis }
 * NormalizedAnimeDetail extends it with:
 *   { studios[], startText, trailerYoutube, nextAiring { episode, airingAt },
 *     seasons [{ id, title, image, episodes, kind }],
 *     characters [{ name, image, role, va { name, image } }],
 *     relations [{ id, title, image, kind }] }
 *
 * Simple in-memory cache with a 5-minute TTL guards every call.
 * Active provider persists in localStorage under 'active_anime_api_provider'.
 * ========================================================================== */
(function () {
  'use strict';

  var LS_PROVIDER = 'active_anime_api_provider';
  var TTL = 5 * 60 * 1000; // 5 minutes
  var cache = new Map();

  var PROVIDERS = {
    anilist: { name: 'AniList',       note: 'Fast · airing schedules & cast' },
    jikan:   { name: 'Jikan · MAL',   note: 'MyAnimeList rankings · can be slow' },
    kitsu:   { name: 'Kitsu',         note: 'Fallback source' }
  };

  function getProvider() {
    try {
      var p = localStorage.getItem(LS_PROVIDER);
      if (p && PROVIDERS[p]) return p;
    } catch (e) { /* private mode */ }
    return 'anilist';
  }

  function setProvider(key) {
    if (!PROVIDERS[key]) return;
    try { localStorage.setItem(LS_PROVIDER, key); } catch (e) {}
    cache.clear(); // stale data from the old source must not leak through
  }

  function cached(key, fn) {
    var now = Date.now();
    var hit = cache.get(key);
    if (hit && now - hit.t < TTL) return Promise.resolve(hit.v);
    return fn().then(function (v) {
      cache.set(key, { t: now, v: v });
      return v;
    });
  }

  function httpError(provider, res) {
    var err = new Error(provider + ' request failed (HTTP ' + res.status + ')');
    err.provider = provider;
    err.status = res.status;
    return err;
  }

  function pickTitle(t) {
    if (!t) return 'Unknown title';
    return t.english || t.romaji || t.en || t.canonical || 'Unknown title';
  }

  /* ============================ AniList ================================== */

  var AL = 'https://graphql.anilist.co';
  var AL_ITEM = 'id title{romaji english} coverImage{large extraLarge} bannerImage ' +
    'averageScore popularity genres status format startDate{year} episodes chapters volumes ' +
    'description(asHtml:false) trailer{id site}';

  function alQuery(query, variables) {
    return fetch(AL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (res) {
      if (!res.ok) throw httpError('AniList', res);
      return res.json();
    }).then(function (json) {
      if (json.errors && json.errors.length) {
        throw new Error('AniList: ' + json.errors[0].message);
      }
      return json.data;
    });
  }

  function alItem(m) {
    return {
      key: 'anilist:' + m.id, provider: 'anilist', id: m.id,
      malId: m.idMal || null,
      title: pickTitle(m.title),      image: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || '',
      banner: m.bannerImage || '',
      score: m.averageScore || null, popularity: m.popularity || 0,
      genres: m.genres || [], status: m.status || '',
      format: m.format || null, // TV, TV_SHORT, MOVIE, SPECIAL, OVA, ONA, MUSIC
      year: (m.startDate && m.startDate.year) || null,
      episodes: m.episodes || null,
      chapters: m.chapters || null, volumes: m.volumes || null,
      synopsis: (m.description || '').replace(/<[^>]*>/g, '').trim(),
      trailerYoutube: (m.trailer && m.trailer.site === 'youtube') ? m.trailer.id : null
    };
  }

  // Main characters first, then supporting, then everything else.
  function roleWeight(r) {
    r = String(r || '').toUpperCase();
    return r === 'MAIN' ? 0 : r === 'SUPPORTING' ? 1 : 2;
  }

  function anilistTop(range, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    return cached('anilist:top:' + t + ':' + range, function () {
      var sort = range === 'today' ? 'TRENDING_DESC'
               : range === 'week'  ? 'POPULARITY_DESC' : 'SCORE_DESC';
      var statusFilter = range === 'week' ? ',status_in:[RELEASING]' : '';
      return alQuery(
        'query($sort:[MediaSort],$t:MediaType){Page(page:1,perPage:10){media(type:$t,sort:$sort' +
        statusFilter + '){' + AL_ITEM + '}}}',
        { sort: [sort], t: t }
      ).then(function (d) {
        return d.Page.media.map(function (m) { var i = alItem(m); i.mediaType = t; return i; });
      });
    });
  }

  var AL_SORT = { popularity: 'POPULARITY_DESC', score: 'SCORE_DESC', latest: 'START_DATE_DESC' };

  // Anime tab: Series / Movies / OVAs rows — top titles by format.
  function anilistFormat(format, page) {
    return cached('anilist:format:' + format + ':' + page, function () {
      return alQuery(
        'query($f:[MediaFormat],$p:Int,$s:[MediaSort]){Page(page:$p,perPage:12){' +
        'pageInfo{hasNextPage} media(type:ANIME,format_in:$f,sort:$s){' + AL_ITEM + '}}}',
        { f: [format], p: page, s: ['POPULARITY_DESC'] }
      ).then(function (d) {
        return d.Page.media.map(function (m) { var i = alItem(m); i.mediaType = 'ANIME'; return i; });
      });
    });
  }

  function anilistSearch(q) {
    return cached('anilist:search:' + q.toLowerCase(), function () {
      return alQuery(
        'query($q:String){' +
        ' anime:Page(perPage:12){media(search:$q,type:ANIME){' + AL_ITEM + '}}' +
        ' manga:Page(perPage:12){media(search:$q,type:MANGA){' + AL_ITEM + '}}}',
        { q: q }
      ).then(function (d) {
        var a = ((((d || {}).anime || {}).media) || []).map(function (m) { var i = alItem(m); i.mediaType = 'ANIME'; return i; });
        var g = ((((d || {}).manga || {}).media) || []).map(function (m) { var i = alItem(m); i.mediaType = 'MANGA'; return i; });
        return { anime: a, manga: g };
      });
    });
  }

  function anilistGenre(genre, page, sort, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var g = genre === 'Isekai' ? null : genre; // Isekai is a tag, not a genre, on AniList
    return cached('anilist:genre:' + t + ':' + genre + ':' + page + ':' + sort, function () {
      return alQuery(
        'query($g:[String],$t:[String],$s:[MediaSort],$p:Int,$mt:MediaType){Page(page:$p,perPage:24){' +
        'pageInfo{hasNextPage} media(type:$mt,genre_in:$g,tag_in:$t,sort:$s){' + AL_ITEM + '}}}',
        { g: g ? [g] : null, t: g ? null : ['Isekai'], s: [AL_SORT[sort] || AL_SORT.popularity], p: page, mt: t }
      ).then(function (d) {
        return { items: d.Page.media.map(function (m) { var i = alItem(m); i.mediaType = t; return i; }),
                 hasMore: !!(d.Page.pageInfo && d.Page.pageInfo.hasNextPage) };
      });
    });
  }

  function anilistDetail(id, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    return cached('anilist:detail:' + t + ':' + id, function () {
      return alQuery(
        'query($id:Int,$t:MediaType){Media(id:$id,type:$t){' + AL_ITEM +
        ' idMal duration streamingEpisodes{title thumbnail url site}' +
        ' studios{nodes{name}} startDate{year month day}' +
        ' nextAiringEpisode{episode airingAt}' +
        ' stats{scoreDistribution{score amount}}' +
        ' reviews(perPage:8,sort:RATING_DESC){nodes{id summary body(asHtml:false)' +
        ' score user{name avatar{large}} createdAt}}' +
        ' relations{edges{relationType node{id title{romaji english} coverImage{large} averageScore status' +
        ' startDate{year month day} episodes chapters format}}}' +
        ' characters(perPage:25){edges{role node{id name{full} image{large}}' +
        ' voiceActors(language:JAPANESE){name{full} image{large}}}}}}',
        { id: parseInt(id, 10), t: t }
      ).then(function (d) {
        var m = d.Media;
        var item = alItem(m);
        item.mediaType = t;
        item.studios = (m.studios && m.studios.nodes || []).map(function (s) { return s.name; });
        item.startText = [m.startDate.day, m.startDate.month, m.startDate.year].filter(Boolean).join('/');
        item.nextAiring = m.nextAiringEpisode
          ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt * 1000 } : null;
        // Reviews + score distribution ride along with the detail query so
        // the rating popup opens instantly — no wait when tapped.
        item.scoreDist = ((m.stats && m.stats.scoreDistribution) || []).map(function (s) {
          return { score: s.score, amount: s.amount };
        });
        item.reviews = ((m.reviews && m.reviews.nodes) || []).map(function (rv) {
          var u = rv.user || {};
          return { id: rv.id, summary: rv.summary || '', body: rv.body || '',
                   score: rv.score || null, user: u.name || '?',
                   avatar: (u.avatar && u.avatar.large) || '',
                   createdAt: rv.createdAt || null };
        });
        var rels = (m.relations && m.relations.edges) || [];
        // Seasons: walk the prequel/sequel chain around this title.
        var seasons = rels
          .filter(function (e) { return e.relationType === 'SEQUEL' || e.relationType === 'PREQUEL'; })
          .map(function (e) {
            return { id: e.node.id, title: pickTitle(e.node.title),
                     image: (e.node.coverImage && e.node.coverImage.large) || '',
                     episodes: e.node.episodes || null, chapters: e.node.chapters || null,
                     year: (e.node.startDate && e.node.startDate.year) || null,
                     kind: e.relationType === 'SEQUEL' ? 'Sequel' : 'Prequel' };
          });
        item.seasons = [{ id: m.id, title: item.title, image: item.image,
                          episodes: item.episodes, year: item.year, kind: 'This season' }]
          .concat(seasons);
        item.characters = ((m.characters && m.characters.edges) || [])
          .sort(function (x, y) { return roleWeight(x.role) - roleWeight(y.role); })
          .slice(0, 12).map(function (e) {
          var va = (e.voiceActors && e.voiceActors[0]) || null;
          return { id: e.node.id || null,
                   name: (e.node.name && e.node.name.full) || '?',
                   image: (e.node.image && e.node.image.large) || '',
                   role: e.role === 'MAIN' ? 'Main' : 'Supporting',
                   va: va ? { name: va.name.full || '?', image: (va.image && va.image.large) || '' } : null };
        });
        item.relations = rels.slice(0, 12).map(function (e) {
          var rsd = e.node.startDate || {};
          return { id: e.node.id, title: pickTitle(e.node.title),
                   image: (e.node.coverImage && e.node.coverImage.large) || '',
                   score: e.node.averageScore || null,
                   kind: e.relationType.charAt(0) + e.relationType.slice(1).toLowerCase(),
                   format: e.node.format || null,
                   status: e.node.status || null,
                   year: rsd.year || null,
                   startTs: (rsd.year && rsd.month && rsd.day)
                     ? Date.UTC(rsd.year, rsd.month - 1, rsd.day) : null };
        });
        item.durationMin = m.duration || null;
        var sd = m.startDate || {};
        item.startTs = (sd.year && sd.month && sd.day)
          ? Date.UTC(sd.year, sd.month - 1, sd.day) : null;
        item.streamEps = (m.streamingEpisodes || []).map(function (s) {
          return { title: s.title || '', thumb: s.thumbnail || '', url: s.url || '' };
        });
        return item;
      });
    });
  }

  /* ============================= Jikan =================================== */

  function anilistCharacter(id) {
    return cached('anilist:character:' + id, function () {
      return alQuery(
        'query ($id: Int) { Character(id: $id) {' +
        ' id name{full native} image{large} description(asHtml:false)' +
        ' dateOfBirth{year month day} age gender bloodType favourites' +
        ' media(perPage:12 sort:POPULARITY_DESC){edges{characterRole' +
        '  voiceActors(language:JAPANESE){id name{full} image{large}}' +
        '  node{type id title{romaji english} coverImage{large} averageScore}}}}}',
        { id: parseInt(id, 10) }
      ).then(function (d) {
        var c = d.Character || {};
        var dob = c.dateOfBirth || {};
        var seen = {}, seenAnime = {}, vas = [], anime = [];
        ((c.media && c.media.edges) || []).forEach(function (e) {
          var n = e.node || {};
          if (n.id && !seenAnime[n.id]) {
            seenAnime[n.id] = 1;
            anime.push({ id: n.id,
                         title: pickTitle(n.title || {}),
                         image: (n.coverImage && n.coverImage.large) || '',
                         score: n.averageScore || null,
                         mediaType: n.type || 'ANIME',
                         role: e.characterRole === 'MAIN' ? 'Main' : 'Supporting' });
          }
          ((e.voiceActors) || []).forEach(function (v) {
            if (v && v.id && !seen[v.id]) {
              seen[v.id] = 1;
              vas.push({ name: (v.name && v.name.full) || '?',
                         image: (v.image && v.image.large) || '' });
            }
          });
        });
        var bday = [dob.day, dob.month, dob.year].filter(Boolean).join('/');
        return { id: c.id || null, name: (c.name && c.name.full) || '?',
                 native: (c.name && c.name.native) || '',
                 image: (c.image && c.image.large) || '',
                 description: (c.description || '').trim(),
                 age: c.age || null, birthday: bday || null,
                 gender: c.gender || null, bloodType: c.bloodType || null,
                 favourites: c.favourites || 0, anime: anime, vas: vas };
      });
    });
  }

  function anilistRecommendations(id, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    return cached('anilist:reco:' + t + ':' + id, function () {
      return alQuery(
        'query ($id: Int) { Media(id: $id) {' +
        ' recommendations(sort: RATING_DESC, perPage: 10){nodes{' +
        '  mediaRecommendation{id title{romaji english} coverImage{large} averageScore}}}}}',
        { id: parseInt(id, 10) }
      ).then(function (d) {
        var out = [];
        ((((d.Media || {}).recommendations || {}).nodes) || []).forEach(function (n) {
          var m = n.mediaRecommendation;
          if (m && m.id) { var ri = alItem(m); ri.mediaType = t; out.push(ri); }
        });
        return out;
      });
    });
  }

  var JK = 'https://api.jikan.moe/v4';

  function jkGet(path) {
    return fetch(JK + path).then(function (res) {
      if (!res.ok) throw httpError('Jikan', res);
      return res.json();
    });
  }

  function jkItem(a, type) {
    var img = (a.images && a.images.jpg) || {};
    var jf = { 'TV': 'TV', 'Movie': 'MOVIE', 'OVA': 'OVA', 'Special': 'SPECIAL',
               'ONA': 'ONA', 'Music': 'MUSIC' };
    return {
      key: 'jikan:' + a.mal_id, provider: 'jikan', id: a.mal_id,
      malId: a.mal_id || null,
      title: a.title_english || a.title || 'Unknown title',
      image: img.large_image_url || img.image_url || '',
      banner: '', score: a.score ? Math.round(a.score * 10) : null,
      popularity: 0, genres: (a.genres || []).map(function (g) { return g.name; }),
      status: (a.status || '').replace(/\s+/g, '_').toUpperCase(),
      format: jf[a.type] || null,
      year: a.year || null, episodes: a.episodes || null,
      chapters: a.chapters || null, volumes: a.volumes || null,
      mediaType: type === 'MANGA' ? 'MANGA' : 'ANIME',
      synopsis: (a.synopsis || '').replace(/\[Written by MAL Rewrite\]\s*/g, '').trim(),
      trailerYoutube: (a.trailer && a.trailer.youtube_id) || null
    };
  }

  function jikanTop(range, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var base = t === 'MANGA' ? '/top/manga' : '/top/anime';
    var path = range === 'today' ? base + (t === 'MANGA' ? '?filter=publishing&limit=10' : '?filter=airing&limit=10')
             : range === 'week'  ? (t === 'MANGA' ? base + '?filter=bypopularity&limit=10' : '/seasons/now?limit=10')
             : base + '?limit=10';
    return cached('jikan:top:' + t + ':' + range, function () {
      return jkGet(path).then(function (j) {
        return (j.data || []).slice(0, 10).map(function (a) { return jkItem(a, t); });
      });
    });
  }

  var jkGenreIds = null; // resolved lazily from /genres/{anime,manga} (names → MAL ids)
  function jikanSearch(q) {
    var t = encodeURIComponent(q);
    function get(ep) {
      return jkGet('/' + ep + '?q=' + t + '&limit=12&order_by=members&sort=desc')
        .catch(function () { return { data: [] }; });
    }
    return cached('jikan:search:' + q.toLowerCase(), function () {
      return Promise.all([get('anime'), get('manga')]).then(function (parts) {
        return {
          anime: (((parts[0] || {}).data) || []).map(function (a) { return jkItem(a, 'ANIME'); }),
          manga: (((parts[1] || {}).data) || []).map(function (a) { return jkItem(a, 'MANGA'); })
        };
      });
    });
  }

  function jikanGenreId(name, type) {
    var t = type === 'MANGA' ? 'manga' : 'anime';
    var store = jkGenreIds && jkGenreIds[t];
    if (store && store[name] !== undefined) return Promise.resolve(store[name]);
    return jkGet('/genres/' + t + '?filter=genres').then(function (j) {
      jkGenreIds = jkGenreIds || {};
      jkGenreIds[t] = {};
      (j.data || []).forEach(function (g) { jkGenreIds[t][g.name.toLowerCase()] = g.mal_id; });
      return jkGet('/genres/' + t + '?filter=themes');
    }).then(function (j) {
      (j.data || []).forEach(function (g) { jkGenreIds[t][g.name.toLowerCase()] = g.mal_id; });
      return jkGenreIds[t][name.toLowerCase()] || null;
    });
  }

  var JK_SORT = { popularity: 'members', score: 'score', latest: 'start_date' };

  // Jikan top/anime filtered by type: tv / movie / ova.
  function jikanFormat(format, page) {
    var t = { TV: 'tv', MOVIE: 'movie', OVA: 'ova' }[format] || 'tv';
    return cached('jikan:format:' + t + ':' + page, function () {
      return jkGet('/top/anime?type=' + t + '&limit=12&page=' + page).then(function (j) {
        return (j.data || []).map(function (a) { return jkItem(a, 'ANIME'); });
      });
    });
  }

  function jikanGenre(genre, page, sort, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var ep = t === 'MANGA' ? 'manga' : 'anime';
    return cached('jikan:genre:' + t + ':' + genre + ':' + page + ':' + sort, function () {
      return jikanGenreId(genre, t).then(function (gid) {
        if (!gid) throw new Error('Jikan has no genre named "' + genre + '"');
        var ob = JK_SORT[sort] || JK_SORT.popularity;
        return jkGet('/' + ep + '?genres=' + gid + '&order_by=' + ob + '&sort=desc&limit=24&page=' + page + '&sfw=true');
      }).then(function (j) {
        return { items: (j.data || []).map(function (a) { return jkItem(a, t); }),
                 hasMore: !!(j.pagination && j.pagination.has_next_page) };
      });
    });
  }

  function jikanDetail(id, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var ep = t === 'MANGA' ? 'manga' : 'anime';
    var entryType = t === 'MANGA' ? 'manga' : 'anime';
    return cached('jikan:detail:' + t + ':' + id, function () {
      return Promise.all([jkGet('/' + ep + '/' + id + '/full'), jkGet('/' + ep + '/' + id + '/characters')])
        .then(function (parts) {
          var a = parts[0].data, item = jkItem(a, t);
          item.studios = (a.studios || []).map(function (s) { return s.name; });
          item.startText = (a.aired && a.aired.string) || (a.published && a.published.string) || '';
          item.nextAiring = a.broadcast && a.broadcast.string && /airing/i.test(a.status || '')
            ? { episode: null, airingAt: null, text: a.broadcast.string } : null;
          item.seasons = (a.relations || []).reduce(function (acc, r) {
            (r.entry || []).forEach(function (e) {
              if (e.type === entryType) acc.push({ id: e.mal_id, title: e.name, image: '', episodes: null, chapters: null, kind: r.relation });
            });
            return acc;
          }, []);
          item.characters = (parts[1].data || [])
            .sort(function (a, b) { return roleWeight(a.role) - roleWeight(b.role); })
            .slice(0, 12).map(function (c) {
            var va = (c.voice_actors || []).filter(function (v) { return v.language === 'Japanese'; })[0] ||
                     (c.voice_actors || [])[0];
            return { id: (c.character && c.character.mal_id) || null,
                     name: c.character.name || '?',
                     image: ((c.character.images || {}).jpg || {}).image_url || '',
                     role: c.role || '',
                     va: va ? { name: va.person.name || '?',
                                image: (((va.person.images || {}).jpg) || {}).image_url || '' } : null };
          });
          item.relations = item.seasons.slice(0, 12);
          item.durationMin = parseDuration(a.duration);
          var from = (a.aired && a.aired.from) || (a.published && a.published.from);
          item.startTs = from ? new Date(from).getTime() : null;
          return item;
        });
    });
  }

  /* ============================= Kitsu =================================== */

  function jikanCharacter(id) {
    return cached('jikan:character:' + id, function () {
      return jkGet('/characters/' + id + '/full').then(function (j) {
        var c = j.data || {};
        var voices = (c.voices || [])
          .filter(function (v) { return v.language === 'Japanese'; })
          .concat((c.voices || []).filter(function (v) { return v.language !== 'Japanese'; }));
        var seen = {}, vas = [];
        voices.forEach(function (v) {
          var p = v.person || {};
          if (p.mal_id && !seen[p.mal_id]) {
            seen[p.mal_id] = 1;
            vas.push({ name: p.name || '?',
                       image: (((p.images || {}).jpg) || {}).image_url || '' });
          }
        });
        var anime = ((c.anime) || []).slice(0, 12).map(function (e) {
          var a = e.anime || {};
          return { id: a.mal_id || null, title: a.title || '?',
                   image: (((a.images || {}).jpg) || {}).image_url || '',
                   mediaType: 'ANIME', role: e.role || '' };
        });
        ((c.manga) || []).slice(0, 12).forEach(function (e) {
          var a = e.manga || {};
          anime.push({ id: a.mal_id || null, title: a.title || '?',
                       image: (((a.images || {}).jpg) || {}).image_url || '',
                       mediaType: 'MANGA', role: e.role || '' });
        });
        return { id: c.mal_id || null, name: c.name || '?',
                 native: c.name_kanji || '',
                 image: ((((c.images || {}).jpg) || {}).image_url) || '',
                 description: (c.about || '').trim(),
                 age: null, birthday: null, gender: null, bloodType: null,
                 favourites: c.favorites || 0, anime: anime, vas: vas };
      });
    });
  }

  /* ---- Character backup source: Jikan lookup by name (used when the
         primary provider fails). Character pages barely change, so they are
         also kept on the device for 7 days — reopening one makes no call. -- */
  var LS_CHARCACHE = 'mpv2:charcache:v1';
  var CHAR_TTL = 7 * 24 * 60 * 60 * 1000;
  function charCacheGet(key) {
    try {
      var o = JSON.parse(localStorage.getItem(LS_CHARCACHE) || '{}');
      var e = o[key];
      if (e && Date.now() - e.t < CHAR_TTL) return e.v;
    } catch (x) {}
    return null;
  }
  function charCacheSet(key, v) {
    try {
      var o = JSON.parse(localStorage.getItem(LS_CHARCACHE) || '{}');
      o[key] = { t: Date.now(), v: v };
      var ks = Object.keys(o);
      while (ks.length > 80) { delete o[ks.shift()]; ks = Object.keys(o); }
      localStorage.setItem(LS_CHARCACHE, JSON.stringify(o));
    } catch (x) {}
  }
  function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* ---- 48-hour device cache: opening the same title again makes no API
         call within 48h. Keyed per provider + id (+page), capped in size. --- */
  var LS_API48 = 'mpv2:api48:v1';
  var API48_TTL = 48 * 60 * 60 * 1000;
  function api48Get(key) {
    try {
      var o = JSON.parse(localStorage.getItem(LS_API48) || '{}');
      var e = o[key];
      if (e && Date.now() - e.t < API48_TTL) return e.v;
    } catch (x) {}
    return null;
  }
  function api48Set(key, v) {
    try {
      var o = JSON.parse(localStorage.getItem(LS_API48) || '{}');
      o[key] = { t: Date.now(), v: v };
      var ks = Object.keys(o);
      while (ks.length > 80) { delete o[ks.shift()]; ks = Object.keys(o); }
      localStorage.setItem(LS_API48, JSON.stringify(o));
    } catch (x) {}
  }  function jikanCharacterByName(name) {
    return cached('jikan:charsearch:' + normName(name), function () {
      return jkGet('/characters?q=' + encodeURIComponent(name) + '&limit=5').then(function (j) {
        var list = j.data || [], q = normName(name), best = null;
        for (var i = 0; i < list.length && !best; i++) {
          var c = list[i];
          if (normName(c.name) === q || normName(c.name_kanji) === q) best = c;
        }
        if (!best) best = list[0];
        if (!best || !best.mal_id) throw new Error('Backup source found no match for "' + name + '".');
        return best.mal_id;
      });
    }).then(jikanCharacter);
  }

  function jikanRecommendations(id, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var ep = t === 'MANGA' ? 'manga' : 'anime';
    return cached('jikan:reco:' + t + ':' + id, function () {
      return jkGet('/' + ep + '/' + id + '/recommendations').then(function (j) {
        return (j.data || []).slice(0, 10).map(function (r) {
          var e = r.entry || {};
          return { key: 'jikan:' + e.mal_id, provider: 'jikan', id: e.mal_id,
                   title: e.title || '?',
                   image: (((e.images || {}).jpg) || {}).large_image_url || '',
                   mediaType: t, score: null };
        });
      });
    });
  }

  var KS = 'https://kitsu.io/api/edge';

  function ksGet(path) {
    return fetch(KS + path, { headers: { Accept: 'application/vnd.api+json' } }).then(function (res) {
      if (!res.ok) throw httpError('Kitsu', res);
      return res.json();
    });
  }

  function ksItem(a, type) {
    var mt = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var tt = a.titles || {};
    return {
      key: 'kitsu:' + a.id, provider: 'kitsu', id: a.id,
      title: tt.en || tt.en_us || tt.en_jp || a.canonicalTitle || 'Unknown title',
      image: (a.posterImage && (a.posterImage.large || a.posterImage.medium)) || '',
      banner: (a.coverImage && a.coverImage.large) || '',
      score: a.averageRating ? Math.round(parseFloat(a.averageRating)) : null,
      popularity: a.userCount || 0, genres: [],
      status: (a.status || '').toUpperCase(),
      format: (a.subtype || '').toUpperCase() || null, // TV, MOVIE, OVA, ONA, SPECIAL, MUSIC
      year: a.startDate ? parseInt(a.startDate.slice(0, 4), 10) : null,
      episodes: a.episodeCount || null,
      chapters: a.chapterCount || null, volumes: a.volumeCount || null,
      mediaType: mt,
      synopsis: a.synopsis || '',
      trailerYoutube: a.youtubeVideoId || null
    };
  }

  function kitsuTop(range, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var ep = t === 'MANGA' ? 'manga' : 'anime';
    var path = range === 'today' ? '/trending/' + ep + '?page[limit]=10'
             : range === 'week'  ? '/' + ep + '?filter[status]=current&sort=-userCount&page[limit]=10'
             : '/' + ep + '?sort=-averageRating&page[limit]=10';
    return cached('kitsu:top:' + t + ':' + range, function () {
      return ksGet(path).then(function (j) {
        return (j.data || []).map(function (d) { return ksItem(d.attributes, t); });
      });
    });
  }

  var KS_GENRE_SLUG = { 'Action': 'action', 'Adventure': 'adventure', 'Comedy': 'comedy',
    'Drama': 'drama', 'Fantasy': 'fantasy', 'Horror': 'horror', 'Isekai': 'isekai',
    'Mystery': 'mystery', 'Romance': 'romance', 'Sci-Fi': 'sci-fi', 'Slice of Life': 'slice-of-life' };
  var KS_SORT = { popularity: '-userCount', score: '-averageRating', latest: '-startDate' };

  // Kitsu subtype filter: TV / movie / OVA.
  function kitsuFormat(format, page) {
    var st = { TV: 'TV', MOVIE: 'movie', OVA: 'OVA' }[format] || 'TV';
    var offset = (page - 1) * 12;
    return cached('kitsu:format:' + st + ':' + page, function () {
      return ksGet('/anime?filter[subtype]=' + st + '&sort=-userCount&page[limit]=12&page[offset]=' +
        offset).then(function (j) {
        return (j.data || []).map(function (d) { return ksItem(d.attributes, 'ANIME'); });
      });
    });
  }

  function kitsuSearch(q) {
    var t = encodeURIComponent(q);
    function get(ep) {
      return ksGet('/' + ep + '?filter[text]=' + t + '&page[limit]=12')
        .catch(function () { return { data: [] }; });
    }
    return cached('kitsu:search:' + q.toLowerCase(), function () {
      return Promise.all([get('anime'), get('manga')]).then(function (parts) {
        function map(list, t) {
          return (list || []).map(function (d) {
            var at = d.attributes || {}; at.id = d.id; return ksItem(at, t);
          });
        }
        return {
          anime: map(((parts[0] || {}).data), 'ANIME'),
          manga: map(((parts[1] || {}).data), 'MANGA')
        };
      });
    });
  }

  function kitsuGenre(genre, page, sort, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var ep = t === 'MANGA' ? 'manga' : 'anime';
    var slug = KS_GENRE_SLUG[genre] || genre.toLowerCase().replace(/\s+/g, '-');
    var offset = (page - 1) * 24;
    return cached('kitsu:genre:' + t + ':' + genre + ':' + page + ':' + sort, function () {
      return ksGet('/' + ep + '?filter[categories]=' + encodeURIComponent(slug) +
        '&sort=' + (KS_SORT[sort] || KS_SORT.popularity) +
        '&page[limit]=24&page[offset]=' + offset)
        .then(function (j) {
          return { items: (j.data || []).map(function (d) { return ksItem(d.attributes, t); }),
                   hasMore: (j.data || []).length === 24 };
        });
    });
  }

  function kitsuDetail(id, type) {
    var t = type === 'MANGA' ? 'MANGA' : 'ANIME';
    var ep = t === 'MANGA' ? 'manga' : 'anime';
    return cached('kitsu:detail:' + t + ':' + id, function () {
      return ksGet('/' + ep + '/' + id).then(function (j) {
        var a = j.data.attributes, item = ksItem(a, t);
        item.studios = [];
        item.malId = null;
        item.durationMin = null;
        item.startTs = a.startDate ? new Date(a.startDate + 'T00:00:00Z').getTime() : null;
        item.startText = a.startDate || '';
        item.nextAiring = null;
        item.seasons = [];
        item.characters = [];
        item.relations = [];
        return item;
      });
    });
  }

  /* ===================== episodes & chapters ============================= */

  // "24 min per ep" / "1 hr 30 min" -> minutes.
  function parseDuration(s) {
    if (!s) return null;
    var h = /(\d+)\s*hr/i.exec(s), m = /(\d+)\s*min/i.exec(s);
    var t = (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
    return t || null;
  }

  function fmtDay(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  // Normalized episode: { n, title, date, minutes, thumb, url }.
  function jikanEpisodes(malId, page, minutes) {
    return cached('ep:jikan:' + malId + ':' + page, function () {
      return jkGet('/anime/' + malId + '/episodes?page=' + page).then(function (j) {
        var pg = j.pagination || {};
        return {
          items: (j.data || []).map(function (e) {
            var ts = e.aired ? new Date(e.aired).getTime() : null;
            return { n: e.mal_id, title: e.title || ('Episode ' + e.mal_id),
                     date: fmtDay(e.aired), ts: ts, minutes: minutes || null, thumb: '', url: '' };
          }),
          hasMore: !!pg.has_next_page,
          // Jikan knows the real total even when AniList reports null
          // (ongoing series) — the heading uses it for "Episodes · N".
          total: (pg.items && pg.items.total) || null
        };
      });
    });
  }

  function kitsuEpisodes(ksId, page) {
    var limit = 20, off = (page - 1) * limit;
    return cached('ep:kitsu:' + ksId + ':' + page, function () {
      return ksGet('/episodes?filter[mediaId]=' + ksId + '&sort=number' +
                   '&page[limit]=' + limit + '&page[offset]=' + off).then(function (j) {
        return {
          items: (j.data || []).map(function (e) {
            var a = e.attributes || {};
            var t = a.canonicalTitle || (a.titles && (a.titles.en_us || a.titles.en_jp)) || '';
            var ts = a.airdate ? new Date(a.airdate + 'T00:00:00Z').getTime() : null;
            return { n: a.number, title: t || ('Episode ' + a.number),
                     date: fmtDay(a.airdate), ts: ts, minutes: a.length || null,
                     thumb: (a.thumbnail && a.thumbnail.original) || '', url: '' };
          }),
          hasMore: !!((j.links || {}).next),
          total: (j.meta && j.meta.count) || null
        };
      });
    });
  }

  function streamEpsFallback(detail) {
    var items = (detail.streamEps || []).map(function (s, i) {
      return { n: i + 1, title: s.title || ('Episode ' + (i + 1)),
               date: '', ts: null, minutes: null, thumb: s.thumb || '', url: s.url || '' };
    });
    return { items: items, hasMore: false };
  }

  // Last-resort episode list: when every API fails or comes back empty but
  // the title has a known episode total, synthesize numbered cards so the
  // Episodes section never silently vanishes. Cards fall back to the series
  // cover (no per-episode thumb available).
  function synthEpisodes(detail, page) {
    var total = (detail && detail.episodes) || 0;
    if (!total) return { items: [], hasMore: false, total: null };
    var per = 20, start = (page - 1) * per + 1, end = Math.min(total, start + per - 1);
    var items = [];
    for (var n = start; n <= end; n++) {
      items.push({ n: n, title: 'Episode ' + n, date: '',
                   ts: null, minutes: detail.durationMin || null, thumb: '', url: '' });
    }
    return { items: items, hasMore: end < total, total: total };
  }

  function anilistEpisodes(detail, page) {
    // Jikan has real air dates; merge AniList streaming thumbnails by episode
    // number parsed from the streaming title (the streaming window rarely
    // starts at episode 1, so positional matching would attach wrong stills).
    if (detail.malId) {
      return jikanEpisodes(detail.malId, page, detail.durationMin).then(function (r) {
        var byNum = {};
        (detail.streamEps || []).forEach(function (s) {
          var m = /episode\s+(\d+)/i.exec(s.title || '');
          if (m && s.thumb && !byNum[parseInt(m[1], 10)]) byNum[parseInt(m[1], 10)] = s;
        });
        r.items.forEach(function (it) {
          var s = byNum[it.n];
          if (s) { it.thumb = it.thumb || s.thumb || ''; it.url = it.url || s.url || ''; }
        });
        return r;
      }).catch(function () { return streamEpsFallback(detail); });
    }
    return Promise.resolve(streamEpsFallback(detail));
  }

  // AniList per-episode air dates, keyless. Pages through the whole
  // airingSchedule and maps episode number -> airing timestamp (ms).
  // Cached 48h like the other API responses.
  function anilistAirDates(mediaId) {
    return cached('airdates:' + mediaId, function () {
      var map = {};
      function fetchPage(p) {
        return alQuery(
          'query($id:Int,$p:Int){Media(id:$id,type:ANIME){' +
          'airingSchedule(page:$p,perPage:50){pageInfo{hasNextPage} nodes{episode airingAt}}}}',
          { id: mediaId, p: p }
        ).then(function (d) {
          var s = d.Media && d.Media.airingSchedule;
          ((s && s.nodes) || []).forEach(function (n) {
            if (n.episode && n.airingAt && !map[n.episode]) map[n.episode] = n.airingAt * 1000;
          });
          if (s && s.pageInfo && s.pageInfo.hasNextPage && p < 20) return fetchPage(p + 1);
          return map;
        });
      }
      return fetchPage(1);
    });
  }

  // Normalized chapter: { n, title, date, pages, thumb }.
  function kitsuChapters(ksId, page) {
    var limit = 20, off = (page - 1) * limit;
    return cached('ch:kitsu:' + ksId + ':' + page, function () {
      return ksGet('/chapters?filter[mangaId]=' + ksId + '&sort=number' +
                   '&page[limit]=' + limit + '&page[offset]=' + off).then(function (j) {
        return {
          items: (j.data || []).map(function (c) {
            var a = c.attributes || {};
            var t = a.canonicalTitle || (a.titles && (a.titles.en_us || a.titles.en_jp)) || '';
            var ts = a.published ? new Date(a.published + 'T00:00:00Z').getTime() : null;
            return { n: a.number, title: t || ('Chapter ' + a.number),
                     date: fmtDay(a.published), ts: ts, pages: a.length || null,
                     thumb: (a.thumbnail && a.thumbnail.original) || '' };
          }),
          hasMore: !!((j.links || {}).next),
          total: (j.meta && j.meta.count) || null
        };
      });
    });
  }

  function kitsuMappingId(site, externalId) {
    return cached('ksmap:' + site + ':' + externalId, function () {
      return ksGet('/mappings?filter[externalSite]=' + encodeURIComponent(site) +
                   '&filter[externalId]=' + encodeURIComponent(externalId) + '&include=item')
        .then(function (j) {
          var inc = ((j.included || []).filter(function (x) {
            return x.type === 'manga' || x.type === 'anime';
          }))[0];
          return inc ? inc.id : null;
        });
    });
  }

  /* ==================== MangaDex volume covers ==================== */
  /* No free database publishes an individual cover per manga chapter.
     MangaDex (keyless) publishes real per-volume cover art, so each
     chapter card shows its volume's cover (chapters in one volume share
     it). Pure enhancement: never throws, falls back silently. */
  function mdGet(path) {
    return fetch('https://api.mangadex.org' + path, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('md ' + r.status); return r.json(); });
  }
  function mdMangaUuid(malId, title) {
    if (!malId && !title) return Promise.resolve(null);
    return cached('md:uuid:' + (malId || title), function () {
      return mdGet('/manga?limit=8&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive' +
                   '&title=' + encodeURIComponent(title || '')).then(function (j) {
        var ds = j.data || [], i, links;
        for (i = 0; i < ds.length; i++) {
          links = (((ds[i] || {}).attributes || {}).links) || {};
          if (malId && String(links.mal) === String(malId)) return ds[i].id;
        }
        return ds.length ? ds[0].id : null;
      });
    });
  }
  function mdVolumeCovers(uuid) {
    return cached('md:covers:' + uuid, function () {
      function fetchPage(offset) {
        return mdGet('/cover?manga%5B%5D=' + uuid + '&limit=100&offset=' + offset +
                     '&order%5Bvolume%5D=asc').then(function (j) {
          var map = {};
          (j.data || []).forEach(function (r) {
            var a = r.attributes || {};
            if (a.volume && a.fileName && !map[a.volume])
              map[a.volume] = 'https://uploads.mangadex.org/covers/' + uuid + '/' + a.fileName;
          });
          var total = j.total || 0;
          if (offset + 100 < total) {
            return fetchPage(offset + 100).then(function (rest) {
              Object.keys(rest).forEach(function (k) { if (!map[k]) map[k] = rest[k]; });
              return map;
            });
          }
          return map;
        });
      }
      return fetchPage(0);
    });
  }
  function mdChapterVolumes(uuid, numbers) {
    // Precise per-chapter volume lookup for exactly the chapters on screen.
    var key = 'md:chvol:' + uuid + ':' + numbers.join(',');
    return cached(key, function () {
      var q = numbers.map(function (n) { return 'chapter%5B%5D=' + encodeURIComponent(n); }).join('&');
      return mdGet('/chapter?manga=' + uuid + '&' + q + '&limit=100' +
                   '&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive').then(function (j) {
        var acc = {};
        (j.data || []).forEach(function (c) {
          var a = c.attributes || {}, ch = parseFloat(a.chapter);
          if (a.volume && !isNaN(ch) && acc[ch] === undefined) acc[ch] = a.volume;
        });
        return acc;
      });
    });
  }
  function mdFillChapterThumbs(items, malId, title) {
    return mdMangaUuid(malId, title).then(function (uuid) {
      if (!uuid) return items;
      var nums = [];
      items.forEach(function (it) { if (!it.thumb) nums.push(it.n); });
      if (!nums.length) return items;
      return Promise.all([mdVolumeCovers(uuid), mdChapterVolumes(uuid, nums)]).then(function (r) {
        var covers = r[0], vols = r[1];
        items.forEach(function (it) {
          if (it.thumb) return;
          var v = vols[parseFloat(it.n)];
          var url = (v !== undefined && v !== null) ? covers[String(v)] : null;
          if (url) it.thumb = url;
        });
        return items;
      });
    }).catch(function () { return items; });
  }

  /* ==================== TMDB episode stills (optional key) ============== */
  /* TMDB is free but needs a personal API key (themoviedb.org → Settings →
     API, free signup). With a key saved, episodes that have no AniList
     streaming still get TMDB's episode stills (near-complete coverage for
     popular anime). Pure enhancement: never throws. */
  var TMDB_KEY = 'mpv2_tmdb_key_v1';
  function tmdbKey() {
    try { return (localStorage.getItem(TMDB_KEY) || '').trim(); } catch (e) { return ''; }
  }
  function tmdbSetKey(k) {
    try {
      if (k && k.trim()) localStorage.setItem(TMDB_KEY, k.trim());
      else localStorage.removeItem(TMDB_KEY);
    } catch (e) {}
    // Drop cached TMDB lookups so a new key takes effect immediately.
    try {
      cache.forEach(function (v, key) { if (key.indexOf('tmdb:') === 0) cache.delete(key); });
    } catch (e) {}
  }
  function tmdbGet(path) {
    var key = tmdbKey();
    if (!key) return Promise.reject(new Error('no tmdb key'));
    return fetch('https://api.themoviedb.org/3' + path +
                 (path.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(key))
      .then(function (r) { if (!r.ok) throw new Error('tmdb ' + r.status); return r.json(); });
  }
  function tmdbTvId(title) {
    return cached('tmdb:tv:' + title, function () {
      return tmdbGet('/search/tv?query=' + encodeURIComponent(title) + '&include_adult=false')
        .then(function (j) {
          var r = (j.results || [])[0];
          return r ? r.id : null;
        });
    });
  }
  function tmdbSeasonStills(tvId, season) {
    return cached('tmdb:se:' + tvId + ':' + season, function () {
      return tmdbGet('/tv/' + tvId + '/season/' + season).then(function (j) {
        return (j.episodes || []).map(function (e) {
          return e.still_path ? ('https://image.tmdb.org/t/p/w500' + e.still_path) : null;
        });
      });
    });
  }
  function tmdbEpisodeStills(title) {
    // Absolute-episode → still map, built by walking seasons in airing order
    // (season 0 = specials is skipped).
    return tmdbTvId(title).then(function (tvId) {
      if (!tvId) return {};
      return tmdbGet('/tv/' + tvId).then(function (d) {
        var seasons = [];
        for (var s = 1; s <= (d.number_of_seasons || 0); s++) seasons.push(s);
        return Promise.all(seasons.map(function (sn) {
          return tmdbSeasonStills(tvId, sn).catch(function () { return []; });
        })).then(function (lists) {
          var acc = {}, abs = 0;
          lists.forEach(function (list) {
            list.forEach(function (still) { abs++; if (still && !acc[abs]) acc[abs] = still; });
          });
          return acc;
        });
      });
    });
  }
  function tmdbFillEpisodeThumbs(items, title) {
    if (!tmdbKey() || !title) return Promise.resolve(items);
    return tmdbEpisodeStills(title).then(function (stills) {
      items.forEach(function (it) {
        if (!it.thumb && stills[it.n]) it.thumb = stills[it.n];
      });
      return items;
    }).catch(function () { return items; });
  }

  /* ============================ public API =============================== */

  var GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
                'Isekai', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life'];

  var ADAPTERS = {
    anilist: { top: anilistTop, genre: anilistGenre, format: anilistFormat, detail: anilistDetail, character: anilistCharacter, reco: anilistRecommendations, search: anilistSearch },
    jikan:   { top: jikanTop,   genre: jikanGenre,   format: jikanFormat,   detail: jikanDetail,   character: jikanCharacter,   reco: jikanRecommendations,   search: jikanSearch },
    kitsu:   { top: kitsuTop,   genre: kitsuGenre,   format: kitsuFormat,   detail: kitsuDetail,   character: null, reco: function () { return Promise.resolve([]); }, search: kitsuSearch }
  };

  function mediaType(t) { return t === 'MANGA' ? 'MANGA' : 'ANIME'; }

  window.MPV2 = window.MPV2 || {};
  window.MPV2.AnimeAPI = {
    PROVIDERS: PROVIDERS,
    GENRES: GENRES,
    getProvider: getProvider,
    setProvider: setProvider,
    top10: function (range, type) { return ADAPTERS[getProvider()].top(range || 'today', mediaType(type)); },
    byGenre: function (genre, page, sort, type) { return ADAPTERS[getProvider()].genre(genre, page || 1, sort || 'popularity', mediaType(type)); },
    byFormat: function (format, page) { return ADAPTERS[getProvider()].format(format, page || 1); },
    recommendations: function (id, type) { return ADAPTERS[getProvider()].reco(id, mediaType(type)); },
    detail: function (provider, id, type) {
      var p = PROVIDERS[provider] ? provider : getProvider();
      var t = mediaType(type);
      var key = 'd:' + p + ':' + t + ':' + id;
      var hit = api48Get(key);
      if (hit) return Promise.resolve(hit);
      return ADAPTERS[p].detail(id, t).then(function (d) { api48Set(key, d); return d; });
    },
    characterDetail: function (provider, id, name) {
      var p = PROVIDERS[provider] ? provider : getProvider();
      var fn = ADAPTERS[p].character;
      if (!fn) return Promise.reject(new Error('Character details are not available for ' + PROVIDERS[p].name + '.'));
      var key = 'char:' + p + ':' + id;
      var hit = charCacheGet(key);
      if (hit) return Promise.resolve(hit);
      function save(src, c) { c._src = src; charCacheSet(key, c); return c; }
      return fn(id).then(function (c) { return save(p, c); }, function (err) {
        // Primary failed: try the backup source before giving up.
        if (p === 'anilist' && name) {
          return jikanCharacterByName(name).then(function (c) { return save('jikan', c); },
            function () { throw err; });
        }
        throw err;
      });
    },
    search: function (provider, q) {
      var p = PROVIDERS[provider] ? provider : getProvider();
      var fn = ADAPTERS[p].search;
      if (!fn) return Promise.reject(new Error('Search is not available for ' + PROVIDERS[p].name + '.'));
      return fn(q);
    },
    episodes: function (provider, id, detail, page) {
      var p = PROVIDERS[provider] ? provider : getProvider();
      page = page || 1;
      var key = 'e:' + p + ':' + id + ':' + page;
      var hit = api48Get(key);
      if (hit) return Promise.resolve(hit);
      function base() {
        if (p === 'kitsu') return kitsuEpisodes(id, page);
        if (p === 'jikan') return jikanEpisodes(id, page, detail && detail.durationMin);
        return anilistEpisodes(detail || {}, page);
      }
      // Air dates: Jikan is often rate-limited/empty, so AniList's own
      // airingSchedule (keyless, cached) fills any missing per-episode dates.
      // Started in parallel; applied AFTER the synth fallback so every path
      // (Jikan, streaming fallback, synthesized cards) gets dates.
      var airP = (p === 'anilist' && detail && detail.id)
        ? anilistAirDates(detail.id).catch(function () { return {}; })
        : null;
      function withAirDates(r) {
        if (!airP) return Promise.resolve(r);
        return airP.then(function (map) {
          (r.items || []).forEach(function (it) {
            var ts = map[it.n];
            if (ts && !it.ts) {
              it.ts = ts;
              it.date = fmtDay(new Date(ts).toISOString());
            }
          });
          return r;
        });
      }
      function fill(r) {
        // TMDB stills fill episodes that have no own still yet.
        if (detail && detail.title)
          return tmdbFillEpisodeThumbs(r.items, detail.title).then(function () { return r; });
        return r;
      }
      return base().then(function (r) {
        // Never show a bare/empty section: fall back to synthesized cards
        // from the known total when the APIs come back empty.
        if (!r.items.length && detail && detail.episodes) r = synthEpisodes(detail, page);
        return withAirDates(r);
      }).then(function (r) {
        return fill(r);
      }).then(function (r) {
        api48Set(key, r); return r;
      }, function () {
        // API failed: show placeholders but don't cache them, so the next
        // open retries the real source.
        return fill(synthEpisodes(detail || {}, page));
      });
    },
    getTmdbKey: tmdbKey,
    setTmdbKey: tmdbSetKey,
    chapters: function (provider, id, detail, page) {
      var p = PROVIDERS[provider] ? provider : getProvider();
      page = page || 1;
      var key = 'c:' + p + ':' + id + ':' + page;
      var hit = api48Get(key);
      if (hit) return Promise.resolve(hit);
      // Chapters have no per-chapter covers anywhere; fill each chapter with
      // its MangaDex volume cover (best available real artwork).
      function withVolCovers(promise) {
        return promise.then(function (r) {
          if (!r.items.length) return r;
          var need = r.items.some(function (it) { return !it.thumb; });
          if (!need) return r;
          return mdFillChapterThumbs(r.items, detail && detail.malId, detail && detail.title)
            .then(function () { return r; });
        });
      }
      function done(r) { api48Set(key, r); return r; }
      if (p === 'kitsu') return withVolCovers(kitsuChapters(id, page)).then(done);
      var malId = detail && detail.malId;
      if (!malId) return Promise.resolve({ items: [], hasMore: false });
      return withVolCovers(kitsuMappingId('myanimelist/manga', malId).then(function (ksId) {
        return ksId ? kitsuChapters(ksId, page) : { items: [], hasMore: false };
      })).then(done);
    },
    clearCache: function () { cache.clear(); }
  };
})();
