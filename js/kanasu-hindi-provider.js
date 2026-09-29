// Kanasu app - Hindi provider (ToonStream scraper)
// Extracted from Konosuba player build 2026-09-28
//
// The host app must provide these 3:
//   dmGetText(url) -> Promise<string>   fetch a page as text (through your proxy if needed)
//   dmIsApp() -> boolean                 true when running inside the APK WebView
//   DM_PROXY_BASE -> string              your proxy base URL (used only when dmIsApp() is true)
//
// Public API:
//   hiSearch(q) -> Promise<[{title,slug,type,animeId,poster,rating,hindi:true}]>
//   hiDetail(slug,type) -> Promise<{title,year,desc,rating,genres,poster,episodes:[{slug,title,season,episode}]}>
//   hiWatch(slug,type,ep,epSlug) -> Promise<{stream,subtitles,audioTracks,animeId,ep,hindiMp4}>
//
// Everything else (hiDoc, hiPost, hiProxyX, hiResolveHls, RubyStream unpacker) is in this file.

/* ---------- Hindi provider (ToonStream: search -> detail -> direct HLS/MP4) ---------- */
            var TOON = 'https://toonstream.us';
            function hiProxyX(u, referer, origin) {
              if (!dmIsApp()) return u;
              var p = DM_PROXY_BASE + '/r?u=' + encodeURIComponent(u);
              if (referer) p += '&xreferer=' + encodeURIComponent(referer);
              if (origin) p += '&xorigin=' + encodeURIComponent(origin);
              return p;
            }
            function hiPost(url, body, contentType, timeoutMs) {
              return new Promise(function (resolve, reject) {
                var done = false, xhr = new XMLHttpRequest();
                var timer = setTimeout(function () {
                  if (done) return; done = true;
                  try { xhr.abort(); } catch (e) {}
                  reject(new Error('Request timed out'));
                }, timeoutMs || 25000);
                xhr.onreadystatechange = function () {
                  if (xhr.readyState !== 4 || done) return;
                  done = true; clearTimeout(timer);
                  if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                  else reject(new Error('HTTP ' + xhr.status));
                };
                xhr.onerror = function () {
                  if (done) return; done = true; clearTimeout(timer);
                  reject(new Error('Network error'));
                };
                try {
                  xhr.open('POST', url, true);
                  xhr.setRequestHeader('Content-Type', contentType || 'application/x-www-form-urlencoded; charset=UTF-8');
                  xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                  xhr.send(body);
                } catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
              });
            }
            function hiDoc(html) {
              try { return new DOMParser().parseFromString(html, 'text/html'); }
              catch (e) { return null; }
            }
            function hiAttr(el, a, b) {
              if (!el) return null;
              return el.getAttribute(a) || (b ? el.getAttribute(b) : null);
            }
            function hiSlug(href) {
              if (!href) return '';
              var s = String(href).split('?')[0].replace(/\/$/, '');
              var parts = s.split('/');
              return parts[parts.length - 1] || '';
            }
            function hiSearch(q) {
              var url = TOON + '/s?q=' + encodeURIComponent(q);
              return dmGetText(hiProxyX(url, TOON + '/', null), 25000, false).then(function (html) {
                var doc = hiDoc(html), out = [];
                if (!doc) return out;
                doc.querySelectorAll('article.post').forEach(function (art) {
                  var link = art.querySelector('a.lnk-blk');
                  if (!link) return;
                  var href = hiAttr(link, 'href');
                  if (!href) return;
                  var slug = hiSlug(href);
                  if (!slug) return;
                  var img = art.querySelector('.post-thumbnail img');
                  var h2 = art.querySelector('h2.entry-title');
                  var vote = art.querySelector('.vote');
                  var type = /\/movies\//.test(href) ? 'movie' : 'series';
                  out.push({
                    animeId: 'hindi:' + slug, anilistId: 'hindi:' + slug,
                    title: h2 ? h2.textContent.trim() : slug,
                    image: img ? (hiAttr(img, 'src') || '') : '',
                    hindi: true, hindiSlug: slug, hindiType: type,
                    year: null, format: type === 'movie' ? 'MOVIE' : 'TV',
                    hasDub: true,
                    rating: vote ? parseFloat(String(vote.textContent).replace(/[^0-9.]/g, '')) || null : null
                  });
                });
                return out;
              }, function () { return []; });
            }
            function hiParseInfo(doc, type) {
              var info = {};
              var h1 = doc.querySelector('h1');
              info.title = h1 ? h1.textContent.trim() : '';
              var yr = doc.querySelector('span.year');
              info.year = yr ? parseInt(String(yr.textContent).replace(/[^0-9]/g, ''), 10) || null : null;
              var seasonBtns = doc.querySelectorAll('a.season-btn[data-season]');
              var maxSeason = 0;
              seasonBtns.forEach(function (b) {
                var sn = parseInt(b.getAttribute('data-season'), 10);
                if (sn > maxSeason) maxSeason = sn;
              });
              info.totalSeasons = maxSeason > 0 ? maxSeason : 1;
              info.totalEpisodes = null;
              var descP = doc.querySelector('.description p');
              if (descP) info.description = descP.textContent.trim();
              var vote = doc.querySelector('.vote');
              info.tmdbRating = vote ? parseFloat(String(vote.textContent).replace(/[^0-9.]/g, '')) || null : null;
              var gs = [];
              doc.querySelectorAll('a[href*="/genre/"], a[href*="/category/"]').forEach(function (a) {
                var t = a.textContent.trim();
                if (t && gs.indexOf(t) < 0 && gs.length < 8) gs.push(t);
              });
              info.genres = gs;
              info.format = type === 'movie' ? 'MOVIE' : 'TV';
              var posterImg = doc.querySelector('.post-thumbnail img, figure img[alt^="Image "]');
              info.poster = posterImg ? (hiAttr(posterImg, 'src') || '') : '';
              return info;
            }
            function hiPostId(doc) {
              var m = (doc.body ? doc.body.className : '').match(/postid-(\d+)/);
              return m ? m[1] : null;
            }
            function hiSeriesEpisodes(slug, totalSeasons) {
              var jobs = [];
              for (var s = 1; s <= totalSeasons; s++) {
                (function (season) {
                  var url = TOON + '/series/' + slug + '/season/' + season;
                  jobs.push(dmGetText(hiProxyX(url, TOON + '/', null), 25000, false).then(function (html) {
                    var doc = hiDoc(html), eps = [];
                    if (doc) doc.querySelectorAll('article.post').forEach(function (art) {
                      var a = art.querySelector('a.lnk-blk');
                      if (!a) return;
                      var href = hiAttr(a, 'href');
                      if (!href) return;
                      var numEl = art.querySelector('.num-epi');
                      var numTxt = numEl ? numEl.textContent.trim() : '';
                      var epNum = null;
                      var nm = numTxt.match(/(\d+)x(\d+)/);
                      if (nm) epNum = parseInt(nm[2], 10);
                      var titleEl = art.querySelector('.entry-title1');
                      eps.push({ slug: hiSlug(href), epNum: epNum,
                        title: titleEl ? titleEl.textContent.trim() : (numTxt || '') });
                    });
                    return { season: season, eps: eps };
                  }, function () { return { season: season, eps: [] }; }));
                })(s);
              }
              return Promise.all(jobs).then(function (all) {
                all.sort(function (x, y) { return x.season - y.season; });
                var out = [], n = 0, multi = totalSeasons > 1;
                all.forEach(function (g) {
                  g.eps.forEach(function (e) {
                    n++;
                    out.push({ number: n, season: g.season, slug: e.slug,
                      title: (multi ? ('S' + g.season + ' \u00B7 ') : '') + (e.title || ('Episode ' + (e.epNum || n))) });
                  });
                });
                return out;
              });
            }
            function hiDetail(slug, type) {
              type = type === 'movie' ? 'movie' : 'series';
              var url = type === 'movie' ? (TOON + '/movies/' + slug + '/') : (TOON + '/series/' + slug + '/');
              return dmGetText(hiProxyX(url, TOON + '/', null), 25000, false).then(function (html) {
                var doc = hiDoc(html);
                if (!doc) throw new Error('Could not read Hindi details');
                var info = hiParseInfo(doc, type);
                var epP = (type === 'series') ? hiSeriesEpisodes(slug, info.totalSeasons || 1) : Promise.resolve([]);
                return epP.then(function (eps) {
                  return {
                    anilistId: null,
                    info: {
                      title: info.title, description: info.description || '',
                      image: info.poster || '', banner: '',
                      year: info.year, format: info.format,
                      status: null, duration: null, studios: null, ageRating: null,
                      genres: info.genres || [],
                      subbed: null, hasDub: true, dubbed: null,
                      averageScore: info.tmdbRating != null ? info.tmdbRating * 10 : null,
                      meanScore: null
                    },
                    episodes: eps,
                    meta: { episodes: [], rating: info.tmdbRating || null, ratingScale: 10,
                      synopsis: info.description || null, genres: info.genres || [], reviews: [] }
                  };
                });
              });
            }
            function hiPackedArgs(text) {
              try {
                var sig = 'eval(function(p,a,c,k,e,d)';
                var startIdx = text.indexOf(sig);
                if (startIdx === -1) return null;
                var splitIdx = text.indexOf(".split('|')", startIdx);
                if (splitIdx === -1) return null;
                var kEnd = splitIdx - 1;
                var q = text.charAt(kEnd);
                if (q !== "'" && q !== '"') return null;
                var kStart = text.lastIndexOf(q, kEnd - 1);
                if (kStart === -1) return null;
                var k = text.substring(kStart + 1, kEnd).split('|');
                var rest = text.substring(startIdx, kStart);
                var m = rest.match(/,(\d+),(\d+),\s*$/);
                if (!m) return null;
                var a = parseInt(m[1], 10), c = parseInt(m[2], 10);
                var pPart = rest.substring(0, rest.length - m[0].length);
                var pMatch = pPart.match(/\(\s*(['"])([\s\S]*)\1\s*$/);
                if (!pMatch) return null;
                var p = pMatch[2];
                if (!p || isNaN(a) || isNaN(c) || !k.length) return null;
                return { p: p, a: a, c: c, k: k };
              } catch (e) { return null; }
            }
            function hiDeanUnpack(p, a, c, k) {
              while (c--) {
                if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
              }
              return p;
            }
            function hiUnpackM3u8(html) {
              var doc = hiDoc(html);
              if (!doc) return null;
              var scripts = doc.querySelectorAll('script');
              for (var i = 0; i < scripts.length; i++) {
                var text = scripts[i].textContent || '';
                if (text.indexOf('eval(function(p,a,c,k,e,d)') === 0) {
                  var args = hiPackedArgs(text);
                  if (args) {
                    var unp = hiDeanUnpack(args.p, args.a, args.c, args.k);
                    var m = unp.match(/file\s*:\s*(['"])(https?:\/\/[^"']+\.m3u8[^"']*)\1/);
                    if (m) return m[2];
                  }
                }
              }
              return null;
            }
            function hiAsCdn(embedUrl) {
              var hash = embedUrl.split('/').pop();
              var apiUrl = 'https://as-cdn21.top/player/index.php?data=' + encodeURIComponent(hash) + '&do=getVideo';
              return dmGetText(hiProxyX(embedUrl, TOON + '/', null), 20000, false).then(function () {
                return hiPost(hiProxyX(apiUrl, null, 'https://as-cdn21.top'),
                  JSON.stringify({ hash: hash, r: '' }), 'application/json', 20000);
              }).then(function (t) {
                var d;
                try { d = JSON.parse(t); } catch (e) { throw new Error('bad as-cdn response'); }
                var url = d.securedLink || d.videoSource;
                if (!url) throw new Error('as-cdn: no stream');
                return { url: url, type: d.hls ? 'hls' : 'mp4', referer: embedUrl, origin: 'https://as-cdn21.top' };
              });
            }
            function hiRuby(embedUrl) {
              var segs = embedUrl.replace('.html', '').split('/');
              var code = segs.pop() || segs.pop();
              var body = 'op=embed&file_code=' + encodeURIComponent(code) + '&auto=1&referer=' + encodeURIComponent(TOON + '/');
              return hiPost(hiProxyX('https://rubystm.com/dl', embedUrl, null), body,
                'application/x-www-form-urlencoded; charset=UTF-8', 20000).then(function (t) {
                var m = hiUnpackM3u8(t);
                if (!m) throw new Error('rubystm: no stream');
                return { url: m, type: 'hls', referer: embedUrl, origin: 'https://rubystm.com' };
              });
            }
            function hiVidmoly(embedUrl) {
              // VidMoly embed page carries the m3u8 in plain text:
              //   sources: [{ file: 'https://.../master.m3u8?...' }]
              return dmGetText(hiProxyX(embedUrl, TOON + '/', null), 20000, false).then(function (html) {
                var m = String(html).match(/sources\s*:\s*\[\{\s*file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i)
                  || String(html).match(/['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i);
                if (!m) throw new Error('vidmoly: no stream');
                return { url: m[1], type: 'hls', referer: embedUrl, origin: 'https://vidmoly.net' };
              });
            }
            function hiTurbo(embedUrl) {
              // TurboNewVid embed page carries the m3u8 in plain text:
              //   var urlPlay = \'https://cdn3.turbonewvid.com/data3/<hash>/<hash>.m3u8\';
              return dmGetText(hiProxyX(embedUrl, TOON + '/', null), 20000, false).then(function (html) {
                var m = String(html).match(/var\s+urlPlay\s*=\s*\\'([^'\\]+\.m3u8[^'\\]*)\\'/i)
                  || String(html).match(/data-hash="(https?:\/\/[^"]+\.m3u8[^"]*)"/i)
                  || String(html).match(/['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i);
                if (!m) throw new Error('turbo: no stream');
                return { url: m[1], type: 'hls', referer: embedUrl, origin: 'https://turbonewvid.com' };
              });
            }
            function hiRewritePlaylist(text, playlistUrl, referer, origin) {
              function abs(u) { try { return new URL(u, playlistUrl).toString(); } catch (e) { return u; } }
              function px(u) { return hiProxyX(u, referer, origin); }
              return String(text).split('\n').map(function (line) {
                var t = line.trim();
                if (!t || t.charAt(0) === '#') {
                  if (t.indexOf('#EXT-X-KEY') === 0 || t.indexOf('#EXT-X-MAP') === 0 || t.indexOf('#EXT-X-MEDIA') === 0) {
                    return line.replace(/URI="([^"]+)"/g, function (m, u) { return 'URI="' + px(abs(u)) + '"'; });
                  }
                  return line;
                }
                return px(abs(t));
              }).join('\n');
            }
            function hiResolveHls(m3u8url, referer, origin) {
              function blobOf(text) {
                var blob = new Blob([text], { type: 'application/x-mpegURL' });
                return URL.createObjectURL(blob);
              }
              return dmGetText(hiProxyX(m3u8url, referer, origin), 25000, false).then(function (pl) {
                if (!/#EXT-X-STREAM-INF/i.test(pl)) return blobOf(hiRewritePlaylist(pl, m3u8url, referer, origin));
                var lines = pl.split('\n'), first = null;
                for (var i = 0; i < lines.length; i++) {
                  if (/^#EXT-X-STREAM-INF/i.test(lines[i].trim())) {
                    for (var j = i + 1; j < lines.length; j++) {
                      var t = lines[j].trim();
                      if (t && t.charAt(0) !== '#') { first = t; break; }
                    }
                    break;
                  }
                }
                if (!first) throw new Error('No variant stream found');
                var vurl;
                try { vurl = new URL(first, m3u8url).toString(); } catch (e) { vurl = first; }
                return dmGetText(hiProxyX(vurl, referer, origin), 25000, false).then(function (pl2) {
                  return blobOf(hiRewritePlaylist(pl2, vurl, referer, origin));
                });
              });
            }
            function hiWatch(slug, type, ep, epSlug) {
              var pageUrl = type === 'movie'
                ? (TOON + '/movies/' + slug + '/')
                : (TOON + '/episode/' + (epSlug || slug) + '/');
              return dmGetText(hiProxyX(pageUrl, TOON + '/', null), 25000, false).then(function (html) {
                var doc = hiDoc(html), seen = {}, frames = [];
                if (doc) doc.querySelectorAll('iframe[src], iframe[data-src]').forEach(function (f) {
                  var u = hiAttr(f, 'src') || hiAttr(f, 'data-src');
                  if (u && /^https?:\/\//i.test(u) && !seen[u]) { seen[u] = 1; frames.push(u); }
                });
                if (!frames.length) throw new Error('No video servers found for this Hindi episode');
                return frames;
              }).then(function (frames) {
                // Try the most reliable servers first, regardless of page order.
                function hostRank(u) {
                  if (u.indexOf('https://turbonewvid.com/') === 0) return 0;
                  if (u.indexOf('https://rubystm.com') === 0) return 1;
                  if (u.indexOf('https://vidmoly.net/') === 0) return 2;
                  return 3;
                }
                frames.sort(function (a, b) { return hostRank(a) - hostRank(b); });
                function attempt(i) {
                  if (i >= frames.length) return Promise.reject(new Error('All Hindi servers failed for this episode'));
                  var u = frames[i], job;
                  if (u.indexOf('https://turbonewvid.com/') === 0) job = hiTurbo(u);
                  else if (u.indexOf('https://rubystm.com') === 0) job = hiRuby(u);
                  else if (u.indexOf('https://vidmoly.net/') === 0) job = hiVidmoly(u);
                  else job = Promise.reject(new Error('unsupported host'));
                  if (window.console && console.log) console.log('[hi] trying', u.slice(0, 60));
                  job = job.catch(function (e) {
                    if (window.console && console.log) console.log('[hi] failed', u.slice(8, 40), String((e && e.message) || e).slice(0, 80));
                    throw e;
                  });
                  return job.then(function (s) { return s; }, function () { return attempt(i + 1); });
                }
                return attempt(0);
              }).then(function (src) {
                if (src.type === 'hls') {
                  return hiResolveHls(src.url, src.referer, src.origin).then(function (blobUrl) {
                    return { stream: blobUrl, subtitles: [], audioTracks: [],
                      animeId: 'hindi:' + slug, ep: ep, _direct: true, _playlistKey: null };
                  });
                }
                return { stream: hiProxyX(src.url, src.referer, src.origin), subtitles: [], audioTracks: [],
                  animeId: 'hindi:' + slug, ep: ep, _direct: true, _playlistKey: null, hindiMp4: true };
              });
            }
            