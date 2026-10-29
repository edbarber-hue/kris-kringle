/*
 * Mystery Kris Kringle — game core.
 *
 * This one file is the "brain" of the game. It runs in two places:
 *   1. Inside Google Apps Script (copied into apps-script/Code.gs by tools/build.js)
 *   2. In the browser, for Demo Mode (no Google Sheet needed)
 *
 * It never touches storage directly: it gets a `db` adapter and a `hash` function.
 *   db.getPlayers()        -> [{id, name, email, pinHash, wishes:[{item, link}], mystery, alias, shopsFor, joinedAt}]
 *   db.savePlayers(list)
 *   db.getSettings()       -> {phase, budget, eventName, deadline (ISO date-time), partyDate, adminPassword, salt}
 *   db.saveSettings(obj)
 *   db.getGame()           -> game object (see newGame) or null
 *   db.saveGame(game)
 *   db.getTrivia()         -> [{q, a}]
 *   hash(text)             -> string
 */
var KKCore = (function () {
  var PHASES = ['signup', 'drawn', 'revealed'];
  var MAX_WISHES = 5;
  var MIN_WISHES = 3;

  function fail(msg) { var e = new Error(msg); e.userFacing = true; throw e; }

  function clean(s, max) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 200);
  }
  function key(name) { return clean(name, 60).toLowerCase(); }

  function cleanLink(s) {
    s = clean(s, 500);
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
  }

  function cleanWishes(wishes) {
    if (!Array.isArray(wishes)) fail('Please add your wishlist.');
    var out = [];
    for (var i = 0; i < wishes.length && out.length < MAX_WISHES; i++) {
      var w = wishes[i] || {};
      var item = clean(w.item, 140);
      if (item) out.push({ item: item, link: cleanLink(w.link) });
    }
    if (out.length < MIN_WISHES) fail('Please list at least ' + MIN_WISHES + ' gift ideas.');
    return out;
  }

  // Email is required for new sign-ups; people who joined before it existed can add it when they edit.
  function cleanEmail(e, required) {
    e = clean(e, 120).toLowerCase();
    if (!e) { if (required) fail('Please enter your email.'); return ''; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail('That email doesn\'t look right. Check it and try again.');
    return e;
  }

  function checkPin(pin) {
    // Accept full-width digits (some phone keyboards) and ignore spaces or dashes.
    pin = String(pin == null ? '' : pin).replace(/[\uFF10-\uFF19]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48); })
      .replace(/[\s\-.]/g, '');
    if (!/^\d{4}$/.test(pin)) fail('Your PIN must be exactly 4 numbers.');
    return pin;
  }

  function pinHash(hash, settings, name, pin) {
    return hash((settings.salt || '') + '|' + key(name) + '|' + pin);
  }

  // A name-independent fingerprint of a PIN, so no two people can share one.
  function pinKey(hash, settings, pin) { return hash((settings.salt || '') + '|pin|' + pin); }
  function pinTaken(players, keyVal, exceptId) {
    for (var i = 0; i < players.length; i++) if (players[i].pinKey === keyVal && players[i].id !== exceptId) return true;
    return false;
  }
  var PIN_TAKEN = 'This PIN is already taken. Choose a new one.';

  // Unique player id, checked against everyone already signed up.
  function newId(players) {
    var taken = {};
    players.forEach(function (p) { taken[p.id] = 1; });
    var id;
    do {
      id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36) + Math.floor(Math.random() * 1e9).toString(36);
    } while (taken[id]);
    return id;
  }

  function findPlayer(players, name) {
    var k = key(name);
    for (var i = 0; i < players.length; i++) if (key(players[i].name) === k) return players[i];
    return null;
  }

  function login(db, hash, p) {
    var name = clean(p.name, 60);
    if (!name) fail('Please enter your name.');
    var pin = checkPin(p.pin);
    var players = db.getPlayers();
    var me = findPlayer(players, name);
    if (!me || me.pinHash !== pinHash(hash, db.getSettings(), name, pin)) {
      fail("That name and PIN don't match anyone. Check the spelling, or sign up first.");
    }
    return { me: me, players: players };
  }

  function byMystery(players, no) {
    for (var i = 0; i < players.length; i++) if (players[i].mystery === no) return players[i];
    return null;
  }

  function shuffle(arr, rand) {
    rand = rand || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function newGame(players) {
    var bags = players.map(function (p) { return { no: p.mystery, alias: p.alias || '', holder: '', steals: 0 }; })
      .sort(function (a, b) { return a.no - b.no; });
    return {
      bags: bags,
      scores: {},          // name -> correct answers this round
      target: 3,           // correct answers needed to pick a bag
      maxSteals: 2,        // a bag is locked after being stolen this many times
      holdersSitOut: true, // people holding a bag stop answering trivia
      resetEachRound: true,// everyone's score resets after a bag is picked
      qIndex: 0,
      showAnswer: false,
      log: [],
      updatedAt: 0
    };
  }

  function deadlineMs(s) {
    var t = s.deadline ? Date.parse(s.deadline) : NaN;
    return isNaN(t) ? 0 : t;
  }
  function editsClosed(s) { var t = deadlineMs(s); return !!t && Date.now() > t; }
  function notOpenYet(s) { var t = s.opensAt ? Date.parse(s.opensAt) : NaN; return !isNaN(t) && Date.now() < t; }
  function isAdmin(s, p) { return !!s.adminPassword && String(p.password || '') === String(s.adminPassword); }

  function publicSettings(s, count) {
    return {
      phase: s.phase || 'signup',
      budget: s.budget || 500,
      eventName: s.eventName || 'Favor Christmas Party 2027',
      deadline: s.deadline || '',
      timerEnds: s.timerEnds || '',
      editsClosed: editsClosed(s),
      opensAt: s.opensAt || '',
      notOpen: notOpenYet(s),
      partyDate: s.partyDate || '',
      count: count
    };
  }

  function requireAdmin(db, p) {
    var s = db.getSettings();
    if (!s.adminPassword) fail('No organizer password is set yet. Add one in the Settings tab of the Google Sheet.');
    if (String(p.password || '') !== String(s.adminPassword)) fail('Wrong organizer password.');
    return s;
  }

  function meView(db, me, players, testMode) {
    var s = db.getSettings();
    var out = { name: me.name, email: me.email || '', wishes: me.wishes, settings: publicSettings(s, players.length), shoppingFor: null, testMode: !!testMode };
    if (s.phase !== 'signup' && me.shopsFor) {
      var target = byMystery(players, me.shopsFor);
      if (target) out.shoppingFor = { no: target.mystery, name: target.name, wishes: target.wishes };
    }
    if (s.phase === 'revealed' || testMode) { out.myMystery = me.mystery; out.myAlias = me.alias || ''; }
    return out;
  }

  function drawNames(db, rand) {
    var s = db.getSettings();
    var players = db.getPlayers();
    if (players.length < 3) fail('You need at least 3 people to draw names.');
    // Random Mystery numbers 1..N
    var nums = shuffle(players.map(function (_, i) { return i + 1; }), rand);
    players.forEach(function (pl, i) { pl.mystery = nums[i]; });
    // Funny animal alias for every Mystery Person
    var pool = shuffle((typeof KK_ANIMALS !== 'undefined' ? KK_ANIMALS : []).slice(), rand);
    players.forEach(function (pl) { pl.alias = pool[pl.mystery - 1] || ('Mystery Critter #' + pl.mystery); });
    // One big random circle: each person shops for the next one, never themselves
    var circle = shuffle(players.slice(), rand);
    for (var i = 0; i < circle.length; i++) circle[i].shopsFor = circle[(i + 1) % circle.length].mystery;
    db.savePlayers(players);
    s.phase = 'drawn';
    db.saveSettings(s);
    var g = newGame(players);
    g.updatedAt = Date.now();
    db.saveGame(g);
    return { ok: true, count: players.length };
  }

  // Names are drawn automatically the first time anyone visits after the deadline.
  function maybeAutoDraw(db) {
    var s = db.getSettings();
    if (s.phase !== 'signup' || !editsClosed(s)) return;
    if (db.getPlayers().length < 3) return;
    drawNames(db);
  }

  var ops = {
    // ---------- Public ----------
    info: function (db) {
      return publicSettings(db.getSettings(), db.getPlayers().length);
    },

    join: function (db, hash, p) {
      var s = db.getSettings();
      var name = clean(p.name, 60);
      if (name.length < 2) fail('Please enter your full name.');
      var pin = checkPin(p.pin);
      if (notOpenYet(s) && !isAdmin(s, p)) fail('Sign-ups aren\'t open yet. Come back when the countdown ends.');
      var wishes = cleanWishes(p.wishes);
      var email = cleanEmail(p.email, false);
      var players = db.getPlayers();
      // Renaming: the person is logged in under their old name and changed it.
      if (p.oldName && key(p.oldName) !== key(name)) {
        var old = findPlayer(players, p.oldName);
        if (!old || old.pinHash !== pinHash(hash, s, p.oldName, pin)) fail('To change your name, use the same PIN you joined with.');
        if (s.phase === 'revealed' || editsClosed(s)) fail('The deadline has passed, so names and wishlists are locked.');
        if (!/\S+\s+\S+/.test(name)) fail('Please enter your full name, first and last. You\'ll log in with it.');
        if (findPlayer(players, name)) fail('Someone already signed up as "' + name + '". Add a middle initial to tell you apart.');
        old.name = name;
        old.pinHash = pinHash(hash, s, name, pin);
        old.pinKey = pinKey(hash, s, pin);
        old.wishes = wishes;
        if (email) old.email = email;
        db.savePlayers(players);
        return { ok: true, updated: true, renamed: true, name: name };
      }
      var existing = findPlayer(players, name);
      if (existing) {
        if (existing.pinHash !== pinHash(hash, s, name, pin)) {
          fail('Someone already signed up as "' + existing.name + '". If that\'s you, use the PIN you chose. Otherwise add your last name or initial.');
        }
        if (s.phase === 'revealed') fail('The party is over — wishlists are locked.');
        if (editsClosed(s)) fail('The deadline has passed, so wishlists are locked. Ask the organizer if you need a change.');
        existing.wishes = wishes;
        if (email) existing.email = email;
        if (!existing.pinKey) existing.pinKey = pinKey(hash, s, pin);
        db.savePlayers(players);
        return { ok: true, updated: true, name: existing.name };
      }
      if (s.phase !== 'signup') fail('Sign-ups are closed — the names have already been drawn. Ask the organizer to reopen sign-ups.');
      if (!/\S+\s+\S+/.test(name)) fail('Please enter your full name, first and last. You\'ll log in with it.');
      if (editsClosed(s)) fail('Sign-ups closed when the deadline passed. Ask the organizer if you still want in.');
      email = cleanEmail(p.email, true);
      var pk = pinKey(hash, s, pin);
      if (pinTaken(players, pk)) fail(PIN_TAKEN);
      players.push({
        id: newId(players),
        name: name,
        email: email,
        pinHash: pinHash(hash, s, name, pin),
        pinKey: pk,
        wishes: wishes,
        mystery: 0,
        shopsFor: 0,
        joinedAt: new Date().toISOString()
      });
      db.savePlayers(players);
      return { ok: true, updated: false, name: name };
    },

    // Live check while someone types a PIN on the sign-up form. A PIN that already
    // belongs to this same name (someone editing their own list) counts as free.
    pinCheck: function (db, hash, p) {
      var s = db.getSettings();
      var pin = checkPin(p.pin);
      var players = db.getPlayers();
      var mine = p.name ? findPlayer(players, p.name) : null;
      var own = mine && mine.pinHash === pinHash(hash, s, p.name, pin);
      var taken = pinTaken(players, pinKey(hash, s, pin), own ? mine.id : null);
      return { available: !taken, message: taken ? PIN_TAKEN : '' };
    },

    me: function (db, hash, p) {
      var r = login(db, hash, p);
      return meView(db, r.me, r.players, false);
    },

    // Organizer test mode: see anyone's page without their PIN
    viewAs: function (db, hash, p) {
      requireAdmin(db, p);
      var players = db.getPlayers(), me = null;
      players.forEach(function (x) { if (x.id === p.id) me = x; });
      if (!me) fail('Player not found.');
      return meView(db, me, players, true);
    },

    // Read-only party board for anyone's phone
    board: function (db) {
      var s = db.getSettings();
      var g = db.getGame();
      if (!g) return { phase: s.phase || 'signup', game: null };
      var trivia = db.getTrivia();
      var q = trivia[g.qIndex] || null;
      return {
        phase: s.phase,
        game: {
          bags: g.bags, scores: g.scores, target: g.target, maxSteals: g.maxSteals,
          log: (g.log || []).slice(-8), updatedAt: g.updatedAt,
          question: q ? { n: g.qIndex + 1, total: trivia.length, q: q.q, a: g.showAnswer ? q.a : '' } : null
        }
      };
    },

    reveal: function (db) {
      var s = db.getSettings();
      if (s.phase !== 'revealed') fail('No peeking! The reveal hasn\'t started yet.');
      var players = db.getPlayers();
      var list = [];
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        if (!p.mystery) continue;
        var giver = null;
        for (var j = 0; j < players.length; j++) if (players[j].shopsFor === p.mystery) giver = players[j].name;
        list.push({ no: p.mystery, alias: p.alias || '', name: p.name, giver: giver || '', wishes: p.wishes });
      }
      list.sort(function (a, b) { return a.no - b.no; });
      var g = db.getGame();
      if (g) list.forEach(function (r) { r.holder = (g.bags[r.no - 1] || {}).holder || ''; });
      return { eventName: s.eventName || 'Favor Christmas Party 2027', list: list };
    },

    // ---------- Organizer ----------
    adminCheck: function (db, hash, p) { requireAdmin(db, p); return { ok: true }; },

    adminList: function (db, hash, p) {
      var s = requireAdmin(db, p);
      var players = db.getPlayers();
      return {
        settings: publicSettings(s, players.length),
        players: players.map(function (x) {
          var target = x.shopsFor ? byMystery(players, x.shopsFor) : null;
          return {
            id: x.id, name: x.name, email: x.email || '', wishes: x.wishes, mystery: x.mystery, alias: x.alias || '',
            shopsFor: x.shopsFor, shopsForName: target ? target.name : '', joinedAt: x.joinedAt
          };
        })
      };
    },

    draw: function (db, hash, p, rand) {
      requireAdmin(db, p);
      return drawNames(db, rand);
    },

    reopen: function (db, hash, p) {
      var s = requireAdmin(db, p);
      if (editsClosed(s)) fail('Set a later wishlist deadline first (Event settings), otherwise names get drawn again right away.');
      var players = db.getPlayers();
      players.forEach(function (pl) { pl.mystery = 0; pl.shopsFor = 0; pl.alias = ''; });
      db.savePlayers(players);
      s.phase = 'signup';
      db.saveSettings(s);
      db.saveGame(null);
      return { ok: true };
    },

    setPhase: function (db, hash, p) {
      var s = requireAdmin(db, p);
      if (PHASES.indexOf(p.phase) < 0) fail('Unknown phase.');
      if (p.phase !== 'signup' && !db.getPlayers().some(function (x) { return x.mystery; })) fail('Draw names first.');
      s.phase = p.phase;
      db.saveSettings(s);
      return { ok: true };
    },

    saveSettings: function (db, hash, p) {
      var s = requireAdmin(db, p);
      var v = p.values || {};
      if (v.eventName != null) s.eventName = clean(v.eventName, 80);
      if (v.budget != null) s.budget = Math.max(0, parseInt(v.budget, 10) || 0);
      if (v.opensAt != null) {
        var o = clean(v.opensAt, 40);
        if (o && isNaN(Date.parse(o))) fail('That opening time isn\'t a valid date and time.');
        s.opensAt = o;
      }
      if (v.deadline != null) {
        var d = clean(v.deadline, 40);
        if (d && isNaN(Date.parse(d))) fail('That deadline isn\'t a valid date and time.');
        s.deadline = d;
      }
      if (v.partyDate != null) s.partyDate = clean(v.partyDate, 40);
      // Countdown shown on the site for fun. It never draws names: the organizer does.
      if (v.timerEnds != null) {
        var te = clean(v.timerEnds, 40);
        if (te && isNaN(Date.parse(te))) fail('That countdown time isn\'t a valid date and time.');
        s.timerEnds = te;
      }
      db.saveSettings(s);
      return { ok: true };
    },

    removePlayer: function (db, hash, p) {
      var s = requireAdmin(db, p);
      if (s.phase !== 'signup') fail('Reopen sign-ups before removing someone (this clears the draw).');
      var players = db.getPlayers().filter(function (x) { return x.id !== p.id; });
      db.savePlayers(players);
      return { ok: true };
    },

    resetPin: function (db, hash, p) {
      var s = requireAdmin(db, p);
      var pin = checkPin(p.pin);
      var players = db.getPlayers();
      var me = null;
      players.forEach(function (x) { if (x.id === p.id) me = x; });
      if (!me) fail('Player not found.');
      var rk = pinKey(hash, s, pin);
      if (pinTaken(players, rk, me.id)) fail(PIN_TAKEN);
      me.pinHash = pinHash(hash, s, me.name, pin);
      me.pinKey = rk;
      db.savePlayers(players);
      return { ok: true };
    },

    gameLoad: function (db, hash, p) {
      requireAdmin(db, p);
      var players = db.getPlayers();
      return {
        game: db.getGame(),
        trivia: db.getTrivia(),
        names: players.map(function (x) { return x.name; }).sort(),
        wishesByBag: players.filter(function (x) { return x.mystery; })
          .map(function (x) { return { no: x.mystery, alias: x.alias || '', wishes: x.wishes }; })
          .sort(function (a, b) { return a.no - b.no; })
      };
    },

    gameSave: function (db, hash, p) {
      requireAdmin(db, p);
      var g = p.game;
      if (!g || !Array.isArray(g.bags)) fail('Bad game data.');
      g.updatedAt = Date.now();
      if (g.log && g.log.length > 200) g.log = g.log.slice(-200);
      db.saveGame(g);
      return { ok: true, updatedAt: g.updatedAt };
    }
  };

  var PUBLIC = { info: 1, join: 1, me: 1, board: 1, reveal: 1, pinCheck: 1 };

  function handle(db, hash, op, payload, rand) {
    try {
      if (!ops[op]) fail('Unknown request.');
      maybeAutoDraw(db);
      return { ok: true, data: ops[op](db, hash, payload || {}, rand) };
    } catch (e) {
      return { ok: false, error: e.userFacing ? e.message : ('Something went wrong: ' + e.message) };
    }
  }

  // "Hey Ana, you chose Ben Santos. This is what they asked for: ..."
  function buildMessages(players, settings) {
    var byNo = {};
    players.forEach(function (p) { if (p.mystery) byNo[p.mystery] = p; });
    var budget = (settings && settings.budget) || 500;
    return players.filter(function (p) { return p.shopsFor && byNo[p.shopsFor]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (p) {
        var t = byNo[p.shopsFor];
        var text = 'Hey ' + p.name.split(' ')[0] + '! 🎁 For our Kris Kringle, you chose ' + t.name + '.\n\n' +
          'This is what they asked for:\n' +
          t.wishes.map(function (w) { return '• ' + w.item + (w.link ? ' (' + w.link + ')' : ''); }).join('\n') +
          '\n\nBudget is ₱' + budget + (settings && settings.partyDate ? ', and bring it on ' + settings.partyDate : '') + '. Keep it a secret! 🤫\n\n' +
          'Final instruction: please make sure it\'s wrapped well! 🎀';
        return { name: p.name, email: p.email || '', chose: t.name, text: text };
      });
  }

  return { handle: handle, newGame: newGame, buildMessages: buildMessages, PUBLIC: PUBLIC, MAX_WISHES: MAX_WISHES, MIN_WISHES: MIN_WISHES };
})();

if (typeof module !== 'undefined') module.exports = KKCore;
