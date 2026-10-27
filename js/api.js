/* Talks to the Google Apps Script backend — or, in Demo Mode, runs the same game
   core right here in the browser and saves to localStorage. */
(function () {
  var cfg = window.KK_CONFIG || {};
  var url = (cfg.apiUrl || '').trim();
  var DEMO_KEY = 'kk-demo-v4';

  // Small synchronous string hash — fine for demo data that never leaves the browser.
  function demoHash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }

  function demoLoad() {
    var raw = null;
    try { raw = localStorage.getItem(DEMO_KEY); } catch (e) {}
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    return {
      players: [], game: null,
      settings: { phase: 'signup', budget: 500, eventName: 'Favor Christmas Party 2027', opensAt: '', deadline: '2026-10-27T23:59:00+08:00', partyDate: 'Dec 19', adminPassword: 'demo', salt: 'demo-salt' }
    };
  }
  var mem = demoLoad();
  // Sign-ups are open now: clear the old Oct 27 opening from earlier demo data.
  if (mem.settings && mem.settings.opensAt === '2026-10-27T00:00:00+08:00') mem.settings.opensAt = '';
  function persist() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(mem)); } catch (e) {} }
  function copy(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

  var demoDB = {
    getPlayers: function () { return copy(mem.players); },
    savePlayers: function (l) { mem.players = copy(l); persist(); },
    getSettings: function () { return copy(mem.settings); },
    saveSettings: function (s) { mem.settings = copy(s); persist(); },
    getGame: function () { return copy(mem.game); },
    saveGame: function (g) { mem.game = copy(g); persist(); },
    getTrivia: function () { return KK_TRIVIA_SEED; }
  };

  function call(op, payload) {
    if (!url) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          var r = KKCore.handle(demoDB, demoHash, op, copy(payload));
          r.ok ? resolve(r.data) : reject(new Error(r.error));
        }, 180);
      });
    }
    return fetch(url, { method: 'POST', body: JSON.stringify({ op: op, payload: payload || {} }), redirect: 'follow' })
      .then(function (res) { return res.json(); })
      .catch(function () { throw new Error("Couldn't reach the server. Check your internet and try again."); })
      .then(function (r) { if (!r.ok) throw new Error(r.error || 'Something went wrong.'); return r.data; });
  }

  var SAMPLE = [
    ['Ana Reyes', ['Tumbler (Aquaflask)', 'Cute mug', 'Scented candle', 'Notebook', 'Fuzzy socks']],
    ['Ben Santos', ['Bluetooth earbuds', 'Coffee beans', 'Phone stand']],
    ['Carla Mendoza', ['Skincare set', 'Hair clips', 'Mini plant', 'Book: any devotional']],
    ['Dennis Tan', ['Board game', 'Snacks from Japan', 'Desk organizer']],
    ['Ella Garcia', ['Journal', 'Gel pens', 'Tote bag', 'Washi tape']],
    ['Franco Villanueva', ['Gym towel', 'Water bottle', 'Protein bar box']],
    ['Gabby Lim', ['Lip tint', 'Phone case', 'Keychain', 'Polaroid film']],
    ['Hans Cruz', ['Card game (UNO)', 'Bucket hat', 'Hot sauce set']]
  ];

  function demoSeed() {
    SAMPLE.forEach(function (s, i) {
      KKCore.handle(demoDB, demoHash, 'join', {
        name: s[0], pin: String(1000 + i), password: mem.settings.adminPassword,
        wishes: s[1].map(function (w) { return { item: w, link: '' }; })
      });
    });
  }
  function demoReset() { try { localStorage.removeItem(DEMO_KEY); } catch (e) {} mem = demoLoad(); }

  window.KKAPI = { call: call, demo: !url, demoSeed: demoSeed, demoReset: demoReset, SAMPLE: SAMPLE };
})();
