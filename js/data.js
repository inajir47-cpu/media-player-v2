/* ============================================================================
 * media-player-v2 — STEP 1: navigation config
 * One source of truth for sections, tabs and routes. Later steps will add
 * content modules that plug into these tab ids.
 * ========================================================================== */
(function () {
  'use strict';

  window.MPV2 = window.MPV2 || {};

  window.MPV2.SECTIONS = {
    animation: {
      id: 'animation',
      name: 'Animation',
      tagline: 'Anime series, movies and manga',
      accent: 'violet',
      tabs: [
        { id: 'home',     label: 'Home',     icon: 'home' },
        { id: 'anime',    label: 'Anime',    icon: 'sparkles' },
        { id: 'manga',    label: 'Manga',    icon: 'book' },
        { id: 'history',  label: 'History',  icon: 'clock' },
        { id: 'settings', label: 'Settings', icon: 'gear' }
      ],
      // Reachable from the top bar (and the desktop sidebar); not in the
      // mobile bottom nav so it stays at 5 thumb-friendly targets.
      extras: [
        { id: 'search',    label: 'Search',      icon: 'search' },
        { id: 'local',     label: 'Local Files', icon: 'folder' },
        { id: 'watchlist', label: 'Watchlist',   icon: 'bookmark' }
      ]
    },
    movies: {
      id: 'movies',
      name: 'Movies',
      tagline: 'Bollywood, Hollywood and web series',
      accent: 'ember',
      tabs: [
        { id: 'home',     label: 'Home',       icon: 'home' },
        { id: 'bollywood',label: 'Bollywood',  icon: 'clapper' },
        { id: 'hollywood',label: 'Hollywood',  icon: 'film' },
        { id: 'webseries',label: 'Web Series', icon: 'monitor' },
        { id: 'history',  label: 'History',    icon: 'clock' },
        { id: 'settings', label: 'Settings',   icon: 'gear' }
      ],
      extras: [
        { id: 'search',    label: 'Search',      icon: 'search' },
        { id: 'local',     label: 'Local Files', icon: 'folder' },
        { id: 'watchlist', label: 'Watchlist',   icon: 'bookmark' }
      ]
    }
  };

  // Every tab id above maps to a page renderer registered by later steps.
  // Step 1 ships the built-in skeleton renderers (see app.js).
  window.MPV2.PAGE_TITLES = {
    home: 'Home',
    anime: 'Anime',
    discover: 'Discover',
    manga: 'Manga',
    bollywood: 'Bollywood',
    hollywood: 'Hollywood',
    webseries: 'Web Series',
    history: 'History',
    settings: 'Settings',
    search: 'Search',
    local: 'Local Files',
    watchlist: 'Watchlist'
  };

  /* ---------------------------------------------------------------------------
   * STEP 3: demo catalogue (placeholder content so library rows and detail
   * pages have real posters to render and extract colors from).
   * Each entry: { id, section, tab, title, kind, year, genre, blurb, poster }
   * ------------------------------------------------------------------------- */
  function C(id, section, tab, title, kind, year, genre, blurb, poster) {
    return { id: id, section: section, tab: tab, title: title, kind: kind,
             year: year, genre: genre, blurb: blurb, poster: 'img/posters/' + poster + '.png' };
  }
  window.MPV2.CATALOG = [
    C('an1', 'animation', 'anime', 'Neon Ronin', 'Anime', 2026, 'Action · Sci-Fi',
      'A masterless swordsman takes one last contract in a city that never sleeps.', 'anime-neon-ronin'),
    C('an2', 'animation', 'anime', 'Starfall Academy', 'Anime', 2025, 'Fantasy · School',
      'Misfit cadets train to catch falling stars before they hit the earth.', 'anime-starfall-academy'),
    C('an3', 'animation', 'anime', 'Paper Samurai', 'Anime', 2024, 'Adventure',
      'A young fold-master discovers her origami can cut through steel.', 'anime-paper-samurai'),
    C('an4', 'animation', 'anime', 'Ghost Circuit', 'Anime', 2026, 'Cyberpunk',
      'A courier races data through the haunted networks of Neo-Kyoto.', 'anime-ghost-circuit'),
    C('an5', 'animation', 'anime', 'Moonlit Forge', 'Anime', 2023, 'Fantasy',
      'The last blacksmith who can fold moonlight into blades.', 'anime-moonlit-forge'),
    C('an6', 'animation', 'anime', 'Ember Drift', 'Anime', 2025, 'Racing · Drama',
      'Underground drifters chase the perfect run across a burning coastline.', 'anime-ember-drift'),
    C('mg1', 'animation', 'manga', 'Ink & Iron', 'Manga', 2024, 'Steampunk',
      'An illustrator whose drawings come alive joins the sky-pirate rebellion.', 'manga-ink-iron'),
    C('mg2', 'animation', 'manga', 'The Last Cartographer', 'Manga', 2025, 'Adventure',
      'Mapping a world that rearranges itself every full moon.', 'manga-last-cartographer'),
    C('mg3', 'animation', 'manga', 'Hollow Crown', 'Manga', 2023, 'Dark Fantasy',
      'A dethroned prince bargains with the spirits wearing his crown.', 'manga-hollow-crown'),
    C('mg4', 'animation', 'manga', 'Solaris Bloom', 'Manga', 2026, 'Romance · Sci-Fi',
      'Two botanists fall in love aboard a generation ship.', 'manga-solaris-bloom'),
    C('bw1', 'movies', 'bollywood', 'Monsoon Hearts', 'Film', 2025, 'Romance · Drama',
      'Two strangers keep meeting on the same rain-delayed train.', 'bollywood-monsoon-hearts'),
    C('bw2', 'movies', 'bollywood', 'City of Lanterns', 'Film', 2024, 'Drama',
      'A festival of lights reunites a family after twenty years apart.', 'bollywood-city-of-lanterns'),
    C('bw3', 'movies', 'bollywood', 'The Last Train', 'Film', 2026, 'Thriller',
      'Seven passengers. One night. No way off.', 'bollywood-the-last-train'),
    C('bw4', 'movies', 'bollywood', 'Echoes of Tomorrow', 'Film', 2025, 'Sci-Fi',
      'A radio host starts receiving broadcasts from next week.', 'bollywood-echoes-of-tomorrow'),
    C('hw1', 'movies', 'hollywood', 'Midnight Protocol', 'Film', 2026, 'Action',
      'An analyst goes off-book to stop a midnight exchange.', 'hollywood-midnight-protocol'),
    C('hw2', 'movies', 'hollywood', 'The Iron Voyage', 'Film', 2024, 'Adventure',
      'The first crewed crossing of the Atlantic in a steel airship.', 'hollywood-the-iron-voyage'),
    C('hw3', 'movies', 'hollywood', 'Crimson Horizon', 'Film', 2025, 'War · Drama',
      'A medic holds a ridge line through the longest night of the war.', 'hollywood-crimson-horizon'),
    C('hw4', 'movies', 'hollywood', 'Quantum Divide', 'Film', 2026, 'Sci-Fi',
      'Twins separated across parallel timelines try to merge them.', 'hollywood-quantum-divide'),
    C('hw5', 'movies', 'hollywood', 'Ashes of Valor', 'Film', 2023, 'Western',
      'A retired gunslinger escorts the family he once wronged.', 'hollywood-ashes-of-valor'),
    C('hw6', 'movies', 'hollywood', 'Silent Orbit', 'Film', 2025, 'Sci-Fi · Mystery',
      'A station crew wakes to find Earth has gone quiet.', 'hollywood-silent-orbit'),
    C('ws1', 'movies', 'webseries', 'The Glass District', 'Series', 2026, 'Crime',
      'A fixer navigates the transparent towers of the financial elite.', 'webseries-the-glass-district'),
    C('ws2', 'movies', 'webseries', 'Harbor of Thieves', 'Series', 2025, 'Heist',
      'Five crews. One port. The score of a lifetime.', 'webseries-harbor-of-thieves'),
    C('ws3', 'movies', 'webseries', 'Static', 'Series', 2024, 'Horror',
      'A late-night radio signal starts answering its listeners.', 'webseries-static'),
    C('ws4', 'movies', 'webseries', 'The Ninth Floor', 'Series', 2026, 'Mystery',
      'Every office building has a floor that should not exist.', 'webseries-the-ninth-floor')
  ];
  /* ---------------------------------------------------------------------------
   * STEP 5: rich detail metadata — rating, watch order, reviews.
   * Merged onto each catalogue entry as { rating, genres[], kindLabel,
   * watch[] ({name,type,year,episodes}), reviews[] }.
   * ------------------------------------------------------------------------- */
  function W(name, type, year, episodes) { return { name: name, type: type, year: year, episodes: episodes }; }
  function R(author, rating, text) { return { author: author, rating: rating, text: text }; }
  var DETAILS = {
    an1: { rating: 8.6, watch: [W('Season 1', 'Season', 2026, 12), W('OVA: Steel Petals', 'OVA', 2026, 2), W('Season 2', 'Season', 2027, 12)],
      reviews: [R('Kaito', 9, 'The duel choreography is unreal. Episode 9 alone is worth the watch.'),
                R('Meera', 8, 'Slow start, but the finale sticks the landing beautifully.')] },
    an2: { rating: 8.2, watch: [W('Season 1', 'Season', 2025, 13), W('Movie: First Light', 'Movie', 2026, 1), W('Season 2', 'Season', 2027, 13)],
      reviews: [R('Arjun', 8, 'Cozy school anime with genuinely high stakes in the second half.'),
                R('Sofia', 9, 'The movie made me cry. Watch it between the seasons!')] },
    an3: { rating: 8.9, watch: [W('Season 1', 'Season', 2024, 12), W('Season 2', 'Season', 2025, 12), W('OVA: Folded Memories', 'OVA', 2025, 3)],
      reviews: [R('Ravi', 9, 'A modern classic. The origami combat never gets old.'),
                R('Lena', 9, 'Beautiful story about grief and craft. Highest recommendation.')] },
    an4: { rating: 8.4, watch: [W('Season 1', 'Season', 2026, 10), W('Season 2', 'Season', 2027, 10)],
      reviews: [R('Dev', 8, 'Neon-noir done right. The city feels like a character.'),
                R('Aisha', 9, 'That soundtrack. That ending. Instant favorite.')] },
    an5: { rating: 9.1, watch: [W('Season 1', 'Season', 2023, 12), W('Movie: Forge of Dawn', 'Movie', 2024, 1), W('Season 2', 'Season', 2025, 12)],
      reviews: [R('Kenji', 10, 'Perfection. The forge sequences are pure cinema.'),
                R('Priya', 9, 'Warm, mythic, quietly devastating. Watch order matters here.')] },
    an6: { rating: 7.9, watch: [W('Season 1', 'Season', 2025, 12), W('OVA: Night Run', 'OVA', 2025, 2)],
      reviews: [R('Omar', 8, 'Engine sounds mixed like music. Gearheads will love it.'),
                R('Tara', 8, 'Simple story, executed with total confidence.')] },
    mg1: { rating: 8.3, watch: [W('Volume 1', 'Manga', 2024, 8)],
      reviews: [R('Ishaan', 8, 'Gorgeous ink work. The airship designs are frame-worthy.'),
                R('Nina', 9, 'Read it in one sitting. The twist in chapter 6 got me.')] },
    mg2: { rating: 8.7, watch: [W('Volume 1', 'Manga', 2025, 8)],
      reviews: [R('Farah', 9, 'Such a clever premise, and the maps are real puzzles.'),
                R('Leo', 8, 'Quiet and strange in the best way.')] },
    mg3: { rating: 8.8, watch: [W('Volume 1', 'Manga', 2023, 8), W('Volume 2', 'Manga', 2024, 8)],
      reviews: [R('Zara', 9, 'Dark fantasy with actual teeth. Not for the faint of heart.'),
                R('Vik', 9, 'Volume 2 elevates everything. The bargain scene is chilling.')] },
    mg4: { rating: 8.1, watch: [W('Volume 1', 'Manga', 2026, 8)],
      reviews: [R('Hana', 8, 'Tender and luminous. The greenhouse chapters are lovely.'),
                R('Kabir', 8, 'A gentle slow burn among the stars.')] },
    bw1: { rating: 7.8, watch: [W('Monsoon Hearts', 'Movie', 2025, 1)],
      reviews: [R('Ananya', 8, 'The train platform scene will live in my head rent-free.'),
                R('Rohan', 8, 'Old-school romance, shot like a dream.')] },
    bw2: { rating: 8.0, watch: [W('City of Lanterns', 'Movie', 2024, 1)],
      reviews: [R('Simran', 8, 'The festival sequence is pure joy on screen.'),
                R('Aditya', 8, 'Family drama without a single false note.')] },
    bw3: { rating: 7.6, watch: [W('The Last Train', 'Movie', 2026, 1)],
      reviews: [R('Nikhil', 8, 'Taut as a wire. Did not check my phone once.'),
                R('Divya', 7, 'Great setup; the ending divides people, I liked it.')] },
    bw4: { rating: 8.2, watch: [W('Echoes of Tomorrow', 'Movie', 2025, 1)],
      reviews: [R('Sahil', 9, 'The smartest sci-fi premise in years.'),
                R('Ira', 8, 'Listened for the broadcasts detail on rewatch — it all lines up.')] },
    hw1: { rating: 7.9, watch: [W('Midnight Protocol', 'Movie', 2026, 1)],
      reviews: [R('Marcus', 8, 'Lean, mean, and the nightclub sequence rules.'),
                R('Elena', 8, 'Finally an action film that trusts its audience.')] },
    hw2: { rating: 8.1, watch: [W('The Iron Voyage', 'Movie', 2024, 1)],
      reviews: [R('Tom', 8, 'Swashbuckling adventure with real heart.'),
                R('Anya', 9, 'The storm crossing had my whole theater holding its breath.')] },
    hw3: { rating: 8.7, watch: [W('Crimson Horizon', 'Movie', 2025, 1)],
      reviews: [R('James', 9, 'Devastating and humane. The ridge sequence is masterful.'),
                R('Noor', 9, 'A war film about medics — and it earns every tear.')] },
    hw4: { rating: 8.4, watch: [W('Quantum Divide', 'Movie', 2026, 1)],
      reviews: [R('Chris', 9, 'Mind-bending without being smug about it.'),
                R('Dana', 8, 'The twin performances are awards-worthy.')] },
    hw5: { rating: 7.7, watch: [W('Ashes of Valor', 'Movie', 2023, 1)],
      reviews: [R('Hank', 8, 'A western that understands regret.'),
                R('Lucia', 7, 'Slow, dusty, and quietly powerful.')] },
    hw6: { rating: 8.5, watch: [W('Silent Orbit', 'Movie', 2025, 1)],
      reviews: [R('Yuki', 9, 'The silence is the scariest thing in any film this year.'),
                R('Sam', 8, 'Cold, precise, unforgettable.')] },
    ws1: { rating: 8.3, watch: [W('Season 1', 'Season', 2026, 8), W('Season 2', 'Season', 2027, 8)],
      reviews: [R('Rehan', 8, 'Glass towers, dirty money. Binge-worthy.'),
                R('Mia', 9, 'The fixer is the best new TV character in ages.')] },
    ws2: { rating: 8.6, watch: [W('Season 1', 'Season', 2025, 10), W('Season 2', 'Season', 2026, 10)],
      reviews: [R('Diego', 9, 'Every heist tops the last. The port finale is insane.'),
                R('Ava', 8, 'Five crews, zero boring episodes.')] },
    ws3: { rating: 7.8, watch: [W('Season 1', 'Season', 2024, 6), W('Season 2', 'Season', 2025, 6)],
      reviews: [R('Ruth', 8, 'Listened with the lights on. The signal concept is genius.'),
                R('Jay', 7, 'Creepy and original; season 2 goes bigger.')] },
    ws4: { rating: 8.9, watch: [W('Season 1', 'Season', 2026, 8), W('Special: Basement Tapes', 'OVA', 2026, 2), W('Season 2', 'Season', 2027, 8)],
      reviews: [R('Nadia', 10, 'The mystery unfolds perfectly. Do not get spoiled.'),
                R('Finn', 9, 'That ninth floor reveal broke my brain. Incredible.')] }
  };
  /* ---------------------------------------------------------------------------
   * Running times for the film catalogue (minutes). Design-phase placeholder
   * data, shown on movie detail pages before the rating.
   * ------------------------------------------------------------------------- */
  var RUNTIMES = {
    bw1: 142, bw2: 156, bw3: 118, bw4: 134,
    hw1: 127, hw2: 149, hw3: 163, hw4: 131, hw5: 145, hw6: 122
  };
  window.MPV2.CATALOG.forEach(function (t) {
    var d = DETAILS[t.id] || {};
    t.rating = d.rating || 7.5;
    t.genres = t.genre.split('·').map(function (g) { return g.trim(); });
    t.kindLabel = t.kind === 'Film' ? 'Movie' : (t.kind === 'Manga' ? 'Manga' : 'Series');
    t.watch = d.watch || null;
    t.reviews = d.reviews || [];
    t.runtime = RUNTIMES[t.id] || null;
  });
  // Running time in minutes → "2h 18m". Shown on movie detail pages
  // before the rating.
  window.MPV2.formatRuntime = function (min) {
    if (!min) return '';
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + 'h ' : '') + m + 'm';
  };
  window.MPV2.findTitle = function (sectionId, id) {
    return window.MPV2.CATALOG.filter(function (t) { return t.section === sectionId && t.id === id; })[0] || null;
  };
  window.MPV2.titlesFor = function (sectionId, tabId) {
    return window.MPV2.CATALOG.filter(function (t) { return t.section === sectionId && t.tab === tabId; });
  };
  /* ---------------------------------------------------------------------------
   * STEP 6: demo cast pool — placeholder portraits, names and bios for the
   * Cast & Characters design. Clearly demo data: replaced by a real metadata
   * API in a later phase. Each entry carries both an actor name and a
   * character name so the animation section can present "character · voice"
   * cards and the movies section "actor as character" cards from one pool.
   * ------------------------------------------------------------------------- */
  function P(id, actor, character, photo, bio, facts) {
    return { id: id, actor: actor, character: character, photo: 'img/cast/' + photo + '.png',
             bio: bio, facts: facts };
  }
  window.MPV2.CAST_POOL = [
    P('c1', 'Ren Aoki', 'Kai Arata', 'cast-01',
      'Demo voice actor known for steely, soft-spoken leads.',
      ['Debut: 2017', 'Titles: 31', 'Demo award: Seiyu Prize 2024']),
    P('c2', 'Mira Chen', 'Yuki Morrow', 'cast-02',
      'Demo performer with a bright, quick-witted screen presence.',
      ['Debut: 2019', 'Titles: 18', 'Demo award: Rising Star 2023']),
    P('c3', 'Dario Venn', 'Jax Kuro', 'cast-03',
      'Demo actor specializing in charming rogues and heist crews.',
      ['Debut: 2015', 'Titles: 42', 'Demo note: stunt-trained']),
    P('c4', 'Sofia Marchetti', 'Luna Reyes', 'cast-04',
      'Demo lead with a classical theatre background.',
      ['Debut: 2016', 'Titles: 27', 'Demo award: Best Ensemble 2022']),
    P('c5', 'Kenji Sato', 'Ryo Tanaka', 'cast-05',
      'Demo veteran of mentor roles and quiet authority figures.',
      ['Debut: 2009', 'Titles: 63', 'Demo note: also directs']),
    P('c6', 'Amara Okafor', 'Zara Nyx', 'cast-06',
      'Demo breakout star of neon-noir and cyberpunk stories.',
      ['Debut: 2020', 'Titles: 14', 'Demo award: Newcomer 2024']),
    P('c7', 'Leo Fischer', 'Finn Adler', 'cast-07',
      'Demo character actor, equally at home in comedy and drama.',
      ['Debut: 2013', 'Titles: 38', 'Demo note: fluent in 3 languages']),
    P('c8', 'Hana Kim', 'Mei Lin', 'cast-08',
      'Demo performer celebrated for warm, grounded portrayals.',
      ['Debut: 2018', 'Titles: 22', 'Demo award: Critics Choice 2023']),
    P('c9', 'Omar Haddad', 'Cyrus Vane', 'cast-09',
      'Demo actor known for intense, magnetic antagonists.',
      ['Debut: 2014', 'Titles: 35', 'Demo note: stage combat trained']),
    P('c10', 'Tara Novak', 'Ivy Sol', 'cast-10',
      'Demo indie darling with a cult following.',
      ['Debut: 2021', 'Titles: 11', 'Demo award: Festival Jury 2024']),
    P('c11', 'Diego Ramos', 'Marco Reyes', 'cast-11',
      'Demo leading man of sweeping adventures and romances.',
      ['Debut: 2012', 'Titles: 29', 'Demo note: produces his own films']),
    P('c12', 'Nina Petrova', 'Vera Kaine', 'cast-12',
      'Demo chameleon famous for disappearing into every role.',
      ['Debut: 2010', 'Titles: 47', 'Demo award: Lifetime nod 2025'])
  ];
  // Deterministic per-title cast: 4 main + 2 supporting, rotated by title id.
  window.MPV2.castFor = function (item) {
    var pool = window.MPV2.CAST_POOL, n = pool.length, seed = 0, i;
    for (i = 0; i < item.id.length; i++) seed += item.id.charCodeAt(i);
    var anime = item.section === 'animation';
    function resolve(p, main) {
      return {
        id: p.id,
        name: anime ? p.character : p.actor,
        credit: anime ? p.actor + ' · voice' : 'as ' + p.character,
        kind: anime ? (main ? 'Main character' : 'Supporting character') : (main ? 'Lead' : 'Supporting'),
        photo: p.photo, bio: p.bio, facts: p.facts
      };
    }
    var picked = [];
    for (i = 0; i < 6; i++) picked.push(pool[(seed + i) % n]);
    return {
      main: picked.slice(0, 4).map(function (p) { return resolve(p, true); }),
      support: picked.slice(4).map(function (p) { return resolve(p, false); })
    };
  };

  /* ---------------------------------------------------------------------------
   * CHUNK 2: demo "MORE" full-details metadata (design phase placeholders).
   * Deterministic per title id so the modal is stable; every value is a
   * placeholder the real metadata API will replace later.
   * ------------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------------
   * CHUNK 3: bundled demo videos for the cinematic demo player.
   * The four clips are extracted from the design preview; the clip is picked
   * deterministically per title id so each title keeps its own demo footage.
   * ------------------------------------------------------------------------- */
  window.MPV2.DEMO_VIDEOS = ['media/demo-1.mp4', 'media/demo-2.mp4', 'media/demo-3.mp4', 'media/demo-4.mp4'];
  window.MPV2.demoVideoFor = function (item, offset) {
    var seed = 0, id = String((item && item.id) || 'preview'), i;
    for (i = 0; i < id.length; i++) seed += id.charCodeAt(i);
    var files = window.MPV2.DEMO_VIDEOS;
    return files[(seed + (offset || 0)) % files.length];
  };

  window.MPV2.moreFor = function (item) {
    var seed = 0, i;
    for (i = 0; i < item.id.length; i++) seed += item.id.charCodeAt(i);
    var days = [7, 12, 18, 24],
        months = ['March', 'June', 'September', 'November'],
        release = days[seed % days.length] + ' ' + months[seed % months.length] + ' ' + item.year,
        studios = item.section === 'animation'
          ? ['Studio Hibana', 'Northlight Animation', 'Paper Crane Works', 'Neon Koi Studio']
          : ['Meridian Pictures', 'Crescent Reel Films', 'Monsoon Talkies', 'Harborline Studios'],
        studio = studios[seed % studios.length],
        genre = String(item.genre || 'drama').toLowerCase(),
        synopses = [
          item.blurb + ' As the stakes rise, ' + item.title +
            ' unfolds into a sweeping ' + genre + ' saga about loyalty, loss, and the price of starting over.',
          item.title + ' is a ' + genre + ' story where ' + item.blurb.charAt(0).toLowerCase() + item.blurb.slice(1) +
            ' Told with patience and craft, it builds toward a finale that reframes everything that came before it.',
          'In ' + item.title + ', ' + item.blurb.charAt(0).toLowerCase() + item.blurb.slice(1) +
            ' Part ' + genre + ' fable and part character study, it lingers on the quiet moments between the big ones.',
          item.blurb + ' ' + item.title + ' keeps its ' + genre +
            ' heart beating through every twist, landing on an ending that feels both surprising and inevitable.'
        ];
    return {
      seed: seed,
      release: release,
      studio: studio,
      synopsis: synopses[seed % synopses.length]
    };
  };
})();
