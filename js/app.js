(function () {
  'use strict';
  var API = window.KKAPI;
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var timers = [];

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(k, v) {
    try {
      if (v === undefined) { var r = sessionStorage.getItem('kk-' + k); return r ? JSON.parse(r) : null; }
      if (v === null) sessionStorage.removeItem('kk-' + k); else sessionStorage.setItem('kk-' + k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function render(html) { app.innerHTML = html; app.focus({ preventScroll: true }); if (typeof tickCountdowns === 'function') tickCountdowns(); }
  function loading() { render('<div class="spinner"></div>'); }
  function peso(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }
  function fmtDeadline(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    try { return new Date(t).toLocaleString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return new Date(t).toLocaleString(); }
  }
  // Live countdown: any element with data-deadline gets updated every second.
  function countdownHTML(iso, compact, label, doneText) {
    if (!iso || isNaN(Date.parse(iso))) return '';
    label = label || (compact ? 'Edits close in' : 'See who you\'re buying for in');
    return '<div class="countdown' + (compact ? ' compact' : '') + '" data-deadline="' + esc(iso) + '" data-label="' + esc(label) + '" data-done="' + esc(doneText || 'Drawing names…') + '"></div>';
  }
  function tickCountdowns() {
    $$('[data-deadline]').forEach(function (el) {
      var left = Date.parse(el.dataset.deadline) - Date.now();
      var compact = el.classList.contains('compact');
      if (left <= 0) {
        if (!el.dataset.fired) {
          el.dataset.fired = '1';
          el.innerHTML = '<span class="cd-closed">' + esc(el.dataset.done) + '</span>';
          setTimeout(function () { if (document.body.contains(el)) route(); }, 1200);
        }
        return;
      }
      var d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60, sec = Math.floor(left / 1e3) % 60;
      if (compact) { el.textContent = el.dataset.label + ' ' + (d ? d + 'd ' : '') + h + 'h ' + m + 'm ' + sec + 's'; return; }
      var u = function (n, l) { return '<span class="cd-unit">' + KNIT.text((n < 10 ? '0' : '') + n, { color: '#eca7c6' }) + '<i>' + l + '</i></span>'; };
      if (!el.firstChild) el.innerHTML = '<span class="cd-label">' + el.dataset.label + '</span><span class="cd-units"></span>';
      var key = d + ':' + h + ':' + m + ':' + sec;
      if (el.dataset.key !== key) { el.dataset.key = key; el.lastChild.innerHTML = u(d, 'days') + u(h, 'hrs') + u(m, 'min') + u(sec, 'sec'); }
    });
  }
  setInterval(tickCountdowns, 1000);
  function showError(where, err) {
    var box = typeof where === 'string' ? $(where) : where;
    if (box) { box.hidden = false; box.className = 'error'; box.textContent = err.message || String(err); }
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'One moment…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  function every(ms, fn) { timers.push(setInterval(fn, ms)); }
  function openModal(html, narrow) {
    modal.innerHTML = '<div class="modal-box' + (narrow ? ' narrow' : '') + '">' + html + '</div>';
    modal.hidden = false;
    return modal.firstChild;
  }
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; }
  // In-page replacements for confirm/prompt/alert, which some browsers (including in-app ones) block silently.
  function ask(msg, okLabel) {
    return new Promise(function (resolve) {
      var box = openModal('<h2>Are you sure?</h2><p>' + esc(msg) + '</p>' +
        '<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" id="askNo">Cancel</button>' +
        '<button class="btn" id="askYes">' + esc(okLabel || 'Yes, go ahead') + '</button></div>', true);
      $('#askYes', box).onclick = function () { closeModal(); resolve(true); };
      $('#askNo', box).onclick = function () { closeModal(); resolve(false); };
      $('#askYes', box).focus();
    });
  }
  function askPin(name) {
    return new Promise(function (resolve) {
      var box = openModal('<h2>New PIN</h2><p class="muted">Pick a new 4-digit PIN for ' + esc(name) + ', then tell them privately.</p>' +
        '<input id="askPinIn" class="pin-input" inputmode="numeric" maxlength="4" autocomplete="off">' +
        '<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" id="askNo">Cancel</button><button class="btn" id="askYes">Save PIN</button></div>', true);
      var inp = $('#askPinIn', box); inp.focus();
      $('#askYes', box).onclick = function () { var v = inp.value; closeModal(); resolve(v); };
      $('#askNo', box).onclick = function () { closeModal(); resolve(null); };
    });
  }
  function tell(msg) {
    var box = openModal('<p style="margin-top:0">' + esc(msg) + '</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>OK</button></div>', true);
    $('[data-close]', box).focus();
  }
  modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  function wishListHTML(wishes) {
    return '<ul class="wishlist">' + (wishes || []).map(function (w) {
      return '<li><span>' + esc(w.item) + '</span>' +
        (w.link ? '<a href="' + esc(w.link) + '" target="_blank" rel="noopener">link ↗</a>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  // ---------- confetti ----------
  var confetti = (function () {
    var cv = document.getElementById('confetti'), ctx = cv.getContext('2d'), parts = [], raf = 0;
    var colors = ['#f2e8d4', '#eca7c6', '#6f9e89', '#2d4833', '#ffffff'];
    function size() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
    addEventListener('resize', size); size();
    function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter(function (p) { return p.y < cv.height + 40 && p.life-- > 0; });
      parts.forEach(function (p) {
        p.vy += 0.25 * devicePixelRatio; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      raf = parts.length ? requestAnimationFrame(tick) : 0;
    }
    return function burst(n) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var d = devicePixelRatio;
      for (var i = 0; i < (n || 140); i++) {
        parts.push({ x: cv.width / 2 + (Math.random() - .5) * 200 * d, y: cv.height * .35,
          vx: (Math.random() - .5) * 18 * d, vy: (-Math.random() * 14 - 4) * d,
          w: (6 + Math.random() * 6) * d, h: (8 + Math.random() * 8) * d,
          r: Math.random() * 6, vr: (Math.random() - .5) * .3,
          c: colors[i % colors.length], life: 260 });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
  })();

  // ---------- shared info ----------
  var info = null;
  function loadInfo() {
    return API.call('info').then(function (d) {
      info = d;
      $('#brandName').textContent = d.eventName;
      document.title = d.eventName;
      return d;
    });
  }

  // =====================================================================
  // HOME — one poster, one button
  // =====================================================================
  var BURST = '<svg class="burst" viewBox="0 0 400 400" aria-hidden="true"><path fill="#6f9e89" d="M200 0 214 158 330 70 238 186 400 200 238 214 330 330 214 242 200 400 186 242 70 330 162 214 0 200 162 186 70 70 186 158Z"/></svg>';
  var SPARK = function (cls) { return '<svg class="sparkle ' + cls + '" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 0C21 13 27 19 40 20 27 21 21 27 20 40 19 27 13 21 0 20 13 19 19 13 20 0Z"/></svg>'; };
  var STAR6 = '<svg class="star6" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 24 13 36 11 28 20 36 29 24 27 20 38 16 27 4 29 12 20 4 11 16 13Z"/></svg>';

  function viewHome() {
    loading();
    loadInfo().then(function (d) {
      var facts = '<span>Your budget is ' + Number(d.budget || 0).toLocaleString('en-PH') + ' pesos</span>' +
        '<span>Christmas party is on ' + (d.partyDate ? esc(d.partyDate) : 'a date to be announced') + '</span>';
      var cta = d.notOpen
        ? '<p class="small" style="opacity:.85;margin:0">Sign-ups open ' + esc(fmtDeadline(d.opensAt)) + '</p>'
        : d.phase === 'signup' && !d.editsClosed
        ? '<a class="btn cream block" href="#/join">Add my wishlist</a><a class="textlink" href="#/me">Already joined? Log in</a>'
        : d.phase === 'signup'
        ? '<a class="btn cream block" href="#/me">Log in</a>'
        : '<a class="btn cream block" href="#/me">See who I\'m buying for</a>';
      render(
        '<section class="poster">' + BURST + SPARK('s1') + SPARK('s2') + SPARK('s3') +
          '<h1 class="poster-type"><span class="script">Favor</span><span class="big">Kris Kringle</span></h1>' +
          '<p class="poster-sub">' + esc(d.eventName) + '</p>' +
          '<div class="poster-facts">' + facts + '</div>' +
          (d.notOpen ? countdownHTML(d.opensAt, false, 'Sign-ups open in', 'Opening…') : d.phase === 'signup' ? countdownHTML(d.deadline) : '') +
          '<div class="poster-cta">' + cta + '</div>' +
        '</section>'
      );
    }).catch(function (e) { render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // =====================================================================
  // JOIN / EDIT WISHLIST
  // =====================================================================
  function wishRow(w, i) {
    w = w || {};
    return '<div class="wish-row">' +
      '<div class="line"><input name="item" maxlength="140" aria-label="Gift idea ' + (i + 1) + '" placeholder="' + ['e.g. Aquaflask 32oz, matte black', 'e.g. Oversized hoodie, size M, beige', 'e.g. Bath & Body Works mist, Into the Night'][i] + '" value="' + esc(w.item) + '">' +
      '<button type="button" class="link-toggle" aria-label="Add a link">' + (w.link ? 'Link ✓' : '+ Link') + '</button></div>' +
      '<input name="link" class="link-input" type="url" inputmode="url" placeholder="Paste a Shopee or Lazada link" value="' + esc(w.link) + '"' + (w.link ? '' : ' hidden') + '>' +
      '</div>';
  }

  function viewJoin() {
    var sess = store('me');
    var prefill = (sess && sess.wishes) || [];
    loading();
    loadInfo().then(function (d) {
      var editing = !!(sess && sess.wishes);
      if (d.notOpen) { render('<div class="card center pop come-back"><h2>Almost time</h2><p>Sign-ups open ' + esc(fmtDeadline(d.opensAt)) + '.</p>' + countdownHTML(d.opensAt, false, 'Sign-ups open in', 'Opening…') + '</div>'); return; }
      if (d.editsClosed && d.phase !== 'revealed') { render('<div class="card center"><h2>Wishlists are closed</h2><p class="muted">The deadline was ' + esc(fmtDeadline(d.deadline)) + '. Ask the organizer if you need a change.</p><a class="btn" href="#/me">My page</a></div>'); return; }
      if (d.phase === 'revealed') { render('<div class="card center"><h2>Wishlists are closed</h2><p class="muted">The party\'s done. Merry Christmas!</p><a class="btn" href="#/reveal">Watch the reveal</a></div>'); return; }
      if (d.phase === 'drawn' && !editing) {
        render('<div class="card"><h2>Sign-ups are closed</h2><p class="muted">Names have been drawn. If you missed it, message the organizer.</p><a class="btn" href="#/me">Log in</a></div>');
        return;
      }
      var n = Math.max(3, prefill.length), rows = '';
      for (var i = 0; i < n; i++) rows += wishRow(prefill[i], Math.min(i, 2));
      render(
        '<div class="card pop">' +
          '<h2>' + (editing ? 'Your wishlist' : 'Join the game') + '</h2>' + countdownHTML(d.deadline, true) +
          '<form id="joinForm" novalidate>' +
            '<label for="jName">Your full name <span class="hint">first and last, you\'ll log in with it</span></label>' +
            '<input id="jName" name="name" maxlength="60" autocomplete="name" value="' + esc(sess ? sess.name : '') + '">' +
            (editing ? '<p class="small muted" style="margin:6px 0 0">Not ' + esc(sess.name.split(' ')[0]) + '? <a href="#" id="notMe">Start fresh</a></p>' : '') +
            '<label for="jPin">Pick a 4-digit PIN <span class="hint">to log in later</span></label>' +
            '<input id="jPin" name="pin" class="pin-input" inputmode="numeric" maxlength="4" autocomplete="off" type="password" value="' + esc(sess ? sess.pin : '') + '">' +
            '<label>Gift ideas <span class="hint">3 to 5, around ' + peso(d.budget) + ' each</span></label>' +
            '<div class="brief"><b>Be ultra specific.</b> Include color, size, brand, scent or flavor. ' +
            '<span class="hint-red">Hint: overcommunicate. Your Kris Kringle can only get what you describe.</span></div>' +
            '<div id="wishes">' + rows + '</div>' +
            '<button type="button" class="add-wish" id="addWish"' + (n >= 5 ? ' hidden' : '') + '>+ Add another</button>' +
            '<div id="jErr" hidden></div>' +
            '<button class="btn block" style="margin-top:20px" type="submit">' + (editing ? 'Save wishlist' : 'Join') + '</button>' +
          '</form>' +
        '</div>'
      );
      if ($('#notMe')) $('#notMe').onclick = function (e) { e.preventDefault(); store('me', null); viewJoin(); };
      var wl = $('#wishes');
      wl.addEventListener('click', function (e) {
        var t = e.target.closest('.link-toggle'); if (!t) return;
        var inp = t.closest('.wish-row').querySelector('.link-input');
        inp.hidden = !inp.hidden; if (!inp.hidden) inp.focus();
      });
      $('#addWish').onclick = function () {
        wl.insertAdjacentHTML('beforeend', wishRow({}, 2));
        wl.lastElementChild.querySelector('input').focus();
        if (wl.children.length >= 5) this.hidden = true;
      };
      $('#joinForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = e.target.querySelector('button[type=submit]');
        var items = $$('.wish-row', e.target).map(function (r) {
          return { item: r.querySelector('[name=item]').value, link: r.querySelector('[name=link]').value };
        });
        var payload = { name: $('#jName').value, pin: $('#jPin').value, wishes: items };
        if (editing && sess && sess.name) payload.oldName = sess.name;
        busy(btn, true, 'Saving…');
        API.call('join', payload).then(function (r) {
          store('me', { name: r.name, pin: payload.pin, wishes: items.filter(function (x) { return x.item.trim(); }) });
          confetti(90);
          if (r.updated && info && info.phase === 'drawn') {
            render('<div class="card center pop"><h2>Saved</h2><p class="muted">' + (r.renamed ? 'From now on, log in as ' + esc(r.name) + '. ' : '') + 'Your Kris Kringle will see the new list.</p><a class="btn" href="#/me">My page</a></div>');
            return;
          }
          render(
            '<div class="card center pop come-back">' + KNIT.stockings(5) +
              '<h2>' + (r.updated ? 'Saved' : 'You\'re in, ' + esc(r.name.split(' ')[0])) + '</h2>' +
              (r.renamed ? '<p class="small muted">From now on, log in as ' + esc(r.name) + '.</p>' : '') +
              '<p>' + comeBackLine(info && info.deadline) + '</p>' +
              countdownHTML(info && info.deadline) +
              '<button class="btn" id="remindBtn">Remind me on my phone</button>' +
              '<p style="margin:14px 0 0"><a class="textlink" href="#/join">Edit my wishlist</a> &nbsp; <a class="textlink" href="#/me">Go to my page</a></p>' +
            '</div>'
          );
          $('#remindBtn').onclick = function () { openRemind(info); };
        }).catch(function (err) { busy(btn, false); showError('#jErr', err); });
      });
    }).catch(function (e) { render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // =====================================================================
  // MY PAGE (log in with name + PIN)
  // =====================================================================
  function viewMe() {
    var sess = store('me');
    if (!sess || !sess.pin) return meLogin();
    loading();
    API.call('me', { name: sess.name, pin: sess.pin }).then(meDashboard).catch(function () { store('me', null); meLogin(); });
  }

  function meLogin() {
    render(
      '<div class="card pop">' +
        '<h2>Log in</h2>' +
        '<form id="meForm" novalidate>' +
          '<label for="mName">Your full name</label><input id="mName" maxlength="60" autocomplete="name" placeholder="First and last name">' +
          '<label for="mPin">Your PIN</label><input id="mPin" class="pin-input" inputmode="numeric" maxlength="4" type="password" autocomplete="off">' +
          '<div id="mErr" hidden></div>' +
          '<button class="btn block" style="margin-top:20px" type="submit">Log in</button>' +
        '</form>' +
        '<p class="small muted center" style="margin:16px 0 0">New here? <a href="#/join">Add your wishlist</a>. Forgot your PIN? Ask the organizer.</p>' +
      '</div>'
    );
    $('#meForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button');
      var p = { name: $('#mName').value, pin: $('#mPin').value };
      busy(btn, true, 'Checking…');
      API.call('me', p).then(function (d) {
        store('me', { name: d.name, pin: p.pin, wishes: d.wishes });
        meDashboard(d);
      }).catch(function (err) { busy(btn, false); showError('#mErr', err); });
    });
  }

  function meDashboard(d) {
    var test = !!d.testMode;
    if (!test) { var sess = store('me') || {}; store('me', { name: d.name, pin: sess.pin, wishes: d.wishes }); }
    var s = d.settings, html = '';
    if (test) html += '<div class="test-bar">Viewing as <b>' + esc(d.name) + '</b>. This is exactly what they see. <a href="#/organizer">Back to the master list</a></div>';

    if (s.phase === 'signup') {
      html += '<div class="card center pop come-back"><h2>Hi, ' + esc(d.name.split(' ')[0]) + '</h2>' +
        '<p>' + comeBackLine(s.deadline) + '</p>' + countdownHTML(s.deadline) +
        (test ? '' : '<button class="btn" id="remindBtn">Remind me on my phone</button>') + '</div>';
    } else if (d.shoppingFor) {
      html += '<div class="ticket pop">' + KNIT.band({ fg: '#eca7c6', height: 34 }) +
        '<div class="label">You\'re buying for</div>' +
        '<div class="knit-name">' + knitLines(d.shoppingFor.name) + '</div>' +
        '<div class="sub">' + peso(s.budget) + ' budget' + (s.partyDate ? '. Bring it on ' + esc(s.partyDate) : '') + '. Keep it a secret!</div></div>' +
        '<div class="card"><h3>Their wishlist</h3>' + wishListHTML(d.shoppingFor.wishes) + '</div>';
    }
    html += '<div class="card mine' + (d.shoppingFor ? ' lower' : '') + '"><div class="row"><h3 style="margin:0">My wishlist</h3><span class="spacer"></span>' +
      (s.phase !== 'revealed' && !test && !s.editsClosed ? '<a class="btn secondary small" href="#/join">Edit my wishlist</a>' : '') + '</div>' +
      '<div style="margin-top:6px">' + wishListHTML(d.wishes) + '</div></div>' +
      (test ? '' : '<p class="center"><button class="btn ghost small" id="logout" style="color:var(--cream)">Log out</button></p>');
    render(html);
    if (!test && d.shoppingFor && !store('seen-' + d.shoppingFor.no)) { confetti(120); store('seen-' + d.shoppingFor.no, 1); }
    if ($('#logout')) $('#logout').onclick = function () { store('me', null); meLogin(); };
    if ($('#remindBtn')) $('#remindBtn').onclick = function () { openRemind(s); };
  }

  // What to do after you see your Mystery Person: one slide per step.
  function openNextSteps(t, s) {
    var label = '#' + t.no + (t.alias ? ' ' + t.alias : '');
    var steps = [
      { icon: 'Shop', title: 'Shop for their gift', body: 'Pick something from their list, around ' + peso(s.budget) + '.' },
      { icon: 'Wrap', title: 'Box it up and wrap it', body: 'Put it in a big box or container and wrap it in Christmas wrapping paper.',
        extra: '<div class="effort">Please don\'t just put it in a paper bag. Mag-effort naman kayo! 🎁</div>' },
      { icon: 'Hide', title: 'Make it a mystery', body: 'Fill the box with crumpled newspaper so nobody can guess what\'s inside from the shape, size or sound.',
        extra: '<div class="important">This is important for the game.</div>' },
      { icon: 'Tag', title: 'Label it', body: 'Write only this on the outside. No names, not yours and not theirs.',
        extra: '<div class="lbl-big">' + esc(label) + '</div>' },
      { icon: 'Go', title: 'Bring it' + (s.partyDate ? ' on ' + esc(s.partyDate) : ' to the party'), body: 'And keep your Mystery Person a secret until the reveal.' }
    ];
    var i = 0;
    var box = openModal('<div class="slides"></div>', true);
    function draw() {
      var st = steps[i], last = i === steps.length - 1;
      $('.slides', box).innerHTML =
        '<div class="slide pop">' +
          '<div class="slide-count">Step ' + (i + 1) + ' of ' + steps.length + '</div>' +
          KNIT.text(st.icon, { cls: 'slide-knit' }) +
          '<h2>' + st.title + '</h2><p>' + st.body + '</p>' + (st.extra || '') +
        '</div>' +
        '<div class="dots slide-dots">' + steps.map(function (_, k) { return '<i class="' + (k <= i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="row slide-nav"><button class="btn ghost" id="slPrev"' + (i ? '' : ' disabled') + '>Back</button><span class="spacer"></span>' +
          '<button class="btn" id="slNext">' + (last ? 'Got it' : 'Next') + '</button></div>';
      $('#slPrev', box).onclick = function () { if (i) { i--; draw(); } };
      $('#slNext', box).onclick = function () { if (last) closeModal(); else { i++; draw(); } };
      $('#slNext', box).focus({ preventScroll: true });
    }
    draw();
  }

  // Alias in knit letters, broken over a few lines so long names stay big.
  function knitLines(text) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      if (cur && (cur + ' ' + w).length > 11) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    });
    if (cur) lines.push(cur);
    return lines.map(function (l) { return KNIT.text(l); }).join('');
  }

  function comeBackLine(deadline) {
    var t = Date.parse(deadline);
    if (isNaN(t)) return 'Come back after names are drawn to see who you\'re buying for.';
    return 'Come back after ' + esc(fmtDeadline(deadline)) + ' to see who you\'re buying for and their wishlist.';
  }

  // Calendar reminder: the most reliable way to make a phone ping later.
  function openRemind(s) {
    s = s || info || {};
    var t = Date.parse(s.deadline);
    if (isNaN(t)) return;
    var start = new Date(t + 5 * 6e4), end = new Date(t + 20 * 6e4);
    var z = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var url = location.href.split('#')[0];
    var title = 'See who you\'re buying for! ' + (s.eventName || 'Kris Kringle');
    var details = 'Names have been drawn. Log in with your full name and PIN: ' + url;
    var g = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
      '&dates=' + z(start) + '/' + z(end) + '&details=' + encodeURIComponent(details);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Favor//Kris Kringle//EN', 'BEGIN:VEVENT',
      'UID:kk-' + t + '@favor', 'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(start), 'DTEND:' + z(end),
      'SUMMARY:' + title, 'DESCRIPTION:' + details, 'URL:' + url,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + title, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var box = openModal(
      '<div class="center">' + KNIT.text('Psst', { cls: 'modal-knit' }) +
      '<h2 style="margin-top:12px">Don\'t want to forget?</h2>' +
      '<p class="remind-sub">Let us remind you.</p>' +
      '<p class="muted">Your phone will ping you ' + esc(fmtDeadline(s.deadline)) + ', when it\'s time to see who you\'re buying for.</p>' +
      '<div style="display:grid;gap:10px">' +
        '<a class="btn" id="icsBtn" href="#">iPhone or other calendar</a>' +
        '<a class="btn secondary" href="' + esc(g) + '" target="_blank" rel="noopener">Google Calendar</a>' +
        '<button class="btn ghost" data-close>Not now</button>' +
      '</div></div>', true);
    $('#icsBtn', box).onclick = function (e) {
      e.preventDefault();
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      a.download = 'see-who-you-got.ics';
      document.body.appendChild(a); a.click(); a.remove();
    };
  }

  // =====================================================================
  // ORGANIZER
  // =====================================================================
  function adminPw() { return store('admin'); }

  function adminLogin(next) {
    render(
      '<div class="card" style="max-width:440px;margin:0 auto">' +
        '<h2>Organizer</h2>' +
        '<p class="muted">Enter the organizer password.</p>' +
        '<form id="aForm"><label for="aPw">Password</label><input id="aPw" type="password" autocomplete="current-password">' +
        '<div id="aErr" hidden></div><button class="btn block" style="margin-top:16px">Unlock</button></form>' +
      '</div>'
    );
    $('#aForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button'), pw = $('#aPw').value;
      busy(btn, true);
      API.call('adminCheck', { password: pw }).then(function () { store('admin', pw); next(); })
        .catch(function (err) { busy(btn, false); showError('#aErr', err); });
    });
  }

  // ISO -> "YYYY-MM-DDTHH:MM" in Manila time, for the datetime-local input
  function toLocalInput(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    return new Date(t + 8 * 36e5).toISOString().slice(0, 16);
  }
  var showSecrets = false;
  function viewOrganizer() {
    if (!adminPw()) return adminLogin(viewOrganizer);
    loading();
    API.call('adminList', { password: adminPw() }).then(renderOrganizer)
      .catch(function (e) { if (/password/i.test(e.message)) { store('admin', null); adminLogin(viewOrganizer); } else render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // Ready-to-send messages: "Hey Ana, you chose Ben. This is what they asked for..."
  function copyText(txt, b, done) {
    var ok = function () { if (b) { b.textContent = done || 'Copied ✓'; b.classList.add('copied'); } };
    if (navigator.clipboard) return navigator.clipboard.writeText(txt).then(ok).catch(function () { fallback(); });
    fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) { tell('Copy didn\'t work here. Press and hold the message to copy it.'); }
      t.remove();
    }
  }

  function messagesCard(ps, s) {
    var msgs = KKCore.buildMessages(ps, s);
    return '<div class="card no-print msgs"><div class="row"><h2 style="margin:0">Messages to send</h2><span class="spacer"></span>' +
        '<button class="btn secondary small" id="copyAllMsgs">Copy all</button>' +
        (API.demo ? '' : ' <button class="btn secondary small" id="emailMaster">Email me everything</button>') + '</div>' +
      '<p class="muted small" style="margin:6px 0 14px">Copy each one and send it to that person on Messenger or Viber.</p>' +
      msgs.map(function (m, i) {
        return '<div class="msg"><div class="row"><b>To ' + esc(m.name) + '</b><span class="spacer"></span>' +
          '<button class="btn small" data-msg="' + i + '">Copy</button></div>' +
          '<pre class="msg-text">' + esc(m.text) + '</pre></div>';
      }).join('') + '</div>';
  }

  function bindMessages(ps, s) {
    var msgs = KKCore.buildMessages(ps, s);
    $$('[data-msg]').forEach(function (b) { b.onclick = function () { copyText(msgs[Number(b.dataset.msg)].text, b); }; });
    var all = $('#copyAllMsgs');
    if (all) all.onclick = function () { copyText(msgs.map(function (m) { return 'To ' + m.name + ':\n' + m.text; }).join('\n\n----------\n\n'), all); };
    var em = $('#emailMaster');
    if (em) em.onclick = function () {
      busy(em, true, 'Sending…');
      API.call('emailMaster', { password: adminPw() }).then(function (r) { busy(em, false); em.textContent = 'Sent ✓'; tell('Sent to ' + r.sentTo + '. It\'s also in the Messages tab of your Google Sheet.'); })
        .catch(function (e) { busy(em, false); tell(e.message); });
    };
  }

  function renderOrganizer(d) {
    var s = d.settings, ps = d.players;
    $('#brandName').textContent = s.eventName;
    var siteUrl = location.href.split('#')[0];
    var drawn = s.phase !== 'signup';
    var sorted = ps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

    var actions = !drawn
      ? '<p class="muted" style="margin-top:0">Names are drawn automatically at <b>' + (s.deadline ? esc(fmtDeadline(s.deadline)) : 'the deadline') + '</b>. Then everyone can log in and see who they\'re buying for.</p>' +
        '<button class="btn" id="draw"' + (ps.length < 3 ? ' disabled' : '') + '>Draw names now</button>' +
        (ps.length < 3 ? '<span class="small muted" style="margin-left:10px">Needs at least 3 people</span>' : '')
      : '<p class="muted" style="margin-top:0">Names are drawn. Everyone can log in to see who they\'re buying for.</p>' +
        '<button class="btn ghost small" id="reopen">Undo the draw and reopen sign-ups</button>';

    var rows = sorted.map(function (p, i) {
      return '<tr>' +
        '<td class="ml-n">' + (i + 1) + '</td>' +
        '<td class="ml-name"><b>' + esc(p.name) + '</b></td>' +
        '<td class="ml-wish"><ul>' + p.wishes.map(function (w) {
          return '<li>' + esc(w.item) + (w.link ? ' <a href="' + esc(w.link) + '" target="_blank" rel="noopener">link</a>' : '') + '</li>';
        }).join('') + '</ul></td>' +
        '<td class="ml-for">' + (p.shopsForName ? '<b>' + esc(p.shopsForName) + '</b>' : '<span class="muted">After the draw</span>') + '</td>' +
        '<td class="ml-act no-print"><a class="btn ghost small" href="#/test/as/' + encodeURIComponent(p.id) + '">View as</a>' +
          '<button class="btn ghost small" data-pin="' + esc(p.id) + '" data-name="' + esc(p.name) + '">Reset PIN</button>' +
          (!drawn ? '<button class="btn ghost small" data-rm="' + esc(p.id) + '" data-name="' + esc(p.name) + '">Remove</button>' : '') + '</td>' +
      '</tr>';
    }).join('');

    render(
      '<div class="page-head no-print"><h1>Organizer</h1><span class="phase-pill">' + (drawn ? 'Names drawn' : 'Sign-ups open') + '</span><span class="spacer"></span>' +
        '<button class="btn ghost small" id="aOut">Lock</button></div>' +
      '<div class="stats no-print">' +
        '<div class="stat"><div class="n">' + ps.length + '</div><div class="l">signed up</div></div>' +
        '<div class="stat"><div class="n" style="font-size:1.3rem">' + (s.deadline ? esc(fmtDeadline(s.deadline)) : 'Not set') + '</div><div class="l">names drawn</div></div>' +
        '<div class="stat"><div class="n">' + peso(s.budget) + '</div><div class="l">budget</div></div>' +
      '</div>' +
      '<div class="card no-print">' + actions + '<div id="actErr" hidden></div></div>' +
      '<div class="card master">' +
        '<div class="row"><h2 style="margin:0">Master list</h2><span class="spacer"></span>' +
          '<span class="no-print"><button class="btn secondary small" id="copyMaster"' + (ps.length ? '' : ' disabled') + '>Copy</button> ' +
          '<button class="btn secondary small" id="printMaster"' + (ps.length ? '' : ' disabled') + '>Print</button></span></div>' +
        (ps.length
          ? '<div class="table-wrap"><table class="ml"><thead><tr><th></th><th>Name</th><th>Wishlist</th><th>Buying for</th><th class="no-print"></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<p class="muted">No one yet. Send the invite below.</p>') +
        (API.demo && !drawn ? '<button class="btn ghost small no-print" id="seed" style="margin-top:12px">Add 8 sample people (demo)</button>' : '') +
      '</div>' +
      (drawn ? messagesCard(ps, s) : '') +
      '<div class="card no-print"><h3>Invite message</h3>' +
        '<textarea id="invite" rows="4">' + esc(s.eventName) + ': Kris Kringle 🎁\n' +
        'Sign up and add 3–5 gift ideas' + (s.deadline ? ' by ' + esc(fmtDeadline(s.deadline)) : '') + '. ' + peso(s.budget) + ' budget. You\'ll see who you\'re buying for after that.\n' + esc(siteUrl) + '</textarea>' +
        '<button class="btn secondary small" id="copyInvite" style="margin-top:8px">Copy</button></div>' +
      '<details class="card no-print"><summary>Event settings</summary>' +
        '<form id="setForm"><input type="hidden" name="opensAt" value="' + esc(toLocalInput(s.opensAt)) + '"><div class="grid2">' +
          '<div><label>Event name</label><input name="eventName" value="' + esc(s.eventName) + '"></div>' +
          '<div><label>Budget (₱)</label><input name="budget" type="number" min="0" value="' + esc(s.budget) + '"></div>' +
          '<div><label>Draw names at <span class="hint">Manila time</span></label><input name="deadline" type="datetime-local" value="' + esc(toLocalInput(s.deadline)) + '"></div>' +
          '<div><label>Party date</label><input name="partyDate" placeholder="e.g. Dec 19" value="' + esc(s.partyDate) + '"></div>' +
        '</div><button class="btn small" style="margin-top:14px">Save settings</button><div id="setErr" hidden></div></form>' +
        (API.demo ? '<hr style="border:none;border-top:1px dashed #d4c4a4;margin:18px 0"><button class="btn ghost small" id="demoReset">Erase all demo data</button>' : '') +
      '</details>'
    );

    var on0 = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = function () { fn(el); }; };
    bindMessages(ps, s);
    on0('printMaster', function () { window.print(); });
    on0('copyMaster', function (b) {
      var txt = sorted.map(function (p, i) {
        return (i + 1) + '. ' + p.name + (p.shopsForName ? ' → buying for ' + p.shopsForName : '') + '\n   ' +
          p.wishes.map(function (w) { return w.item + (w.link ? ' (' + w.link + ')' : ''); }).join('\n   ');
      }).join('\n\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { b.textContent = 'Copied ✓'; })
        .catch(function () { tell('Copy didn\'t work in this browser. Use Print instead.'); });
    });

    function act(op, payload, confirmMsg, btn, okLabel) {
      return (confirmMsg ? ask(confirmMsg, okLabel) : Promise.resolve(true)).then(function (ok) {
        if (!ok) return null;
        busy(btn, true);
        payload = payload || {}; payload.password = adminPw();
        return API.call(op, payload).then(function (r) { viewOrganizer(); return r; })
          .catch(function (e) { busy(btn, false); showError('#actErr', e); return null; });
      });
    }
    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = function () { fn(el); }; };
    on('aOut', function () { store('admin', null); location.hash = '#/'; });
    on('draw', function (b) { act('draw', {}, 'Draw names now? Sign-ups close and everyone gets their person.', b, 'Draw names').then(function (r) { if (r) confetti(); }); });
    on('reopen', function (b) { act('reopen', {}, 'Undo the draw? Everyone loses the person they got, and names are drawn again at the deadline. Only do this if nobody has shopped yet.', b); });
    on('revealOn', function (b) { act('setPhase', { phase: 'revealed' }, 'Start the reveal? Everyone will be able to see who each Mystery Person was.', b); });
    on('revealOff', function (b) { act('setPhase', { phase: 'drawn' }, null, b); });
    on('seed', function () { API.demoSeed(); viewOrganizer(); });
    on('demoReset', function () { ask('Erase all demo data?', 'Erase it').then(function (ok) { if (ok) { API.demoReset(); store('me', null); viewOrganizer(); } }); });
    on('copyInvite', function (b) {
      var t = $('#invite'); t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(function () { document.execCommand('copy'); });
      b.textContent = 'Copied ✓';
    });
    $$('[data-rm]').forEach(function (b) { b.onclick = function () { act('removePlayer', { id: b.dataset.rm }, 'Remove ' + b.dataset.name + ' from the game?', b); }; });
    $$('[data-pin]').forEach(function (b) {
      b.onclick = function () {
        askPin(b.dataset.name).then(function (pin) {
          if (pin == null) return;
          act('resetPin', { id: b.dataset.pin, pin: pin }, null, b).then(function (r) { if (r) tell('Done. Tell ' + b.dataset.name + ' their new PIN privately.'); });
        });
      };
    });
    $('#setForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector('button');
      busy(btn, true);
      API.call('saveSettings', { password: adminPw(), values: { eventName: f.eventName.value, budget: f.budget.value, opensAt: f.opensAt.value ? f.opensAt.value + ':00+08:00' : '', deadline: f.deadline.value ? f.deadline.value + ':00+08:00' : '', partyDate: f.partyDate.value } })
        .then(viewOrganizer).catch(function (err) { busy(btn, false); showError('#setErr', err); });
    });
  }

  // =====================================================================
  // PARTY BOARD
  // =====================================================================
  // TV screen: everyone can see it, no scores.
  function viewBoard() {
    app.classList.add('wide');
    boardViewer();
  }
  // Score keeper: private, for the organizer's phone.
  function viewScores() {
    if (!adminPw()) return adminLogin(viewScores);
    boardController();
  }
  var TV_URL = function () { return location.pathname + '?tv#/board'; };

  function bagHTML(b, g, opts) {
    opts = opts || {};
    var locked = b.holder && b.steals >= g.maxSteals;
    var cls = 'bag' + (b.holder ? ' held' : '') + (locked ? ' locked' : '') + (opts.cls ? ' ' + opts.cls : '');
    var dots = '';
    for (var i = 0; i < g.maxSteals; i++) dots += '<i class="' + (i < b.steals ? 'on' : '') + '"></i>';
    return '<div class="' + cls + '" data-bag="' + b.no + '">' +
      (opts.badge ? '<span class="badge">' + opts.badge + '</span>' : '') +
      '<div class="ico">' + (b.holder ? '🎁' : '🛍️') + '</div>' +
      '<div class="no">#' + b.no + '</div>' +
      (b.alias ? '<div class="alias-sm">' + esc(b.alias.replace(/^The /, '')) + '</div>' : '') +
      (b.holder ? '<div class="who">with ' + esc(b.holder) + '</div>' : '') +
      (g.maxSteals ? '<div class="steals" title="Times stolen">' + dots + '</div>' : '') +
      '</div>';
  }

  // ---- read-only board for phones ----
  function boardViewer() {
    var last = 0;
    function load() {
      API.call('board').then(function (d) {
        if (!d.game) {
          render('<div class="card center"><h2>The party board isn\'t ready yet</h2><p class="muted">It appears here once names are drawn.</p></div>');
          return;
        }
        var g = d.game;
        if (g.updatedAt === last && app.querySelector('.bags')) return;
        last = g.updatedAt;
        var free = g.bags.filter(function (b) { return !b.holder; }).length;
        var ranked = Object.keys(g.scores).filter(function (n) { return g.scores[n] > 0; })
          .sort(function (a, b) { return g.scores[b] - g.scores[a]; });
        render(
          '<div class="board-head"><h1>Party board</h1><span class="phase-pill">' + free + ' bag' + (free === 1 ? '' : 's') + ' left</span></div>' +
          '<div class="board"><div><div class="bags">' + g.bags.map(function (b) { return bagHTML(b, g); }).join('') + '</div></div>' +
          '<div>' +
            (g.question ? '<div class="trivia-card"><div class="qn">Question ' + g.question.n + ' of ' + g.question.total + '</div>' +
              '<div class="q">' + esc(g.question.q) + '</div>' + (g.question.a ? '<div class="a">' + esc(g.question.a) + '</div>' : '') + '</div>' : '') +

            (g.log.length ? '<div class="card"><h3>What\'s happened</h3><ul class="log">' + g.log.slice().reverse().map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' : '') +
          '</div></div>'
        );
      }).catch(function (e) { render('<div class="error">' + esc(e.message) + '</div>'); });
    }
    loading(); load(); every(4000, load);
  }

  function pips(n, target) {
    var h = '';
    for (var i = 0; i < target; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    return h;
  }

  // ---- organizer's controller (big screen) ----
  function boardController() {
    loading();
    API.call('gameLoad', { password: adminPw() }).then(function (d) {
      if (!d.game) {
        render('<div class="card center"><h2>Draw names first</h2><p class="muted">The party board is set up automatically when you draw names.</p><a class="btn" href="#/organizer">Go to organizer</a></div>');
        return;
      }
      var G = d.game, trivia = d.trivia, names = d.names;
      var wishes = {}; d.wishesByBag.forEach(function (x) { wishes[x.no] = x.wishes; });
      var history = [];
      var saveTimer = 0, saveState = 'saved';

      function snapshot() { history.push(JSON.stringify(G)); if (history.length > 60) history.shift(); }
      function save() {
        saveState = 'saving'; updateSaveBadge();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          API.call('gameSave', { password: adminPw(), game: G })
            .then(function () { saveState = 'saved'; updateSaveBadge(); })
            .catch(function () { saveState = 'error'; updateSaveBadge(); });
        }, 500);
      }
      function updateSaveBadge() {
        var el = $('#saveBadge'); if (!el) return;
        el.textContent = { saved: '✓ Saved', saving: 'Saving…', error: '⚠ Not saved — check connection' }[saveState];
        el.style.color = saveState === 'error' ? 'var(--berry)' : '';
      }
      function change(fn) { snapshot(); fn(); save(); draw(); }
      function holderOf(name) { for (var i = 0; i < G.bags.length; i++) if (G.bags[i].holder === name) return G.bags[i]; return null; }
      function isLocked(b) { return b.holder && b.steals >= G.maxSteals; }
      function inPlay() { return names.filter(function (n) { return !(G.holdersSitOut && holderOf(n)); }); }
      function log(t) { G.log = G.log || []; G.log.push(t); }

      function pick(name, no) {
        change(function () {
          var bag = G.bags[no - 1], prev = bag.holder, mine = holderOf(name);
          if (prev) {
            bag.steals++;
            if (mine) { mine.holder = prev; log(name + ' swapped bag #' + mine.no + ' for #' + no + ' (stolen from ' + prev + ')'); }
            else log(name + ' stole bag #' + no + ' from ' + prev + (G.holdersSitOut ? ' — ' + prev + ' is back in the game!' : ''));
          } else {
            if (mine) { mine.holder = ''; log(name + ' traded bag #' + mine.no + ' back for #' + no); }
            else log(name + ' picked bag #' + no);
          }
          bag.holder = name;
          if (G.resetEachRound) G.scores = {}; else G.scores[name] = 0;
        });
        closeModal();
        confetti(prevWasSteal(no) ? 160 : 100);
      }
      function prevWasSteal(no) { return G.bags[no - 1].steals > 0; }

      function openPick(name) {
        var mine = holderOf(name);
        var options = G.bags.map(function (b) {
          if (b.holder === name) return bagHTML(b, G, { cls: 'disabled', badge: 'Yours' });
          if (!b.holder) return bagHTML(b, G, { cls: 'clickable pick-free', badge: 'Take' });
          if (isLocked(b)) return bagHTML(b, G, { cls: 'disabled', badge: 'Locked' });
          return bagHTML(b, G, { cls: 'clickable pick-steal', badge: 'Steal' });
        }).join('');
        var box = openModal(
          '<div class="center"><div style="font-size:2.6rem">🎉</div><h2>' + esc(name) + ' gets to pick!</h2>' +
          '<p class="muted">Take a bag from the table, or steal one from someone. A bag gets locked 🔒 after it\'s been stolen ' + G.maxSteals + ' time' + (G.maxSteals === 1 ? '' : 's') + '.' +
          (mine ? ' ' + esc(name) + ' already holds #' + mine.no + (G.holdersSitOut ? '' : ' — it goes back to the table (or to the person they steal from).') : '') + '</p></div>' +
          '<div class="bags" style="margin-top:14px">' + options + '</div>' +
          '<div class="row" style="margin-top:18px"><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button></div>'
        );
        $$('.bag.clickable', box).forEach(function (el) { el.onclick = function () { pick(name, Number(el.dataset.bag)); }; });
      }

      function openBag(no) {
        var b = G.bags[no - 1];
        var opts = '<option value="">— On the table —</option>' + names.map(function (n) {
          return '<option' + (n === b.holder ? ' selected' : '') + '>' + esc(n) + '</option>';
        }).join('');
        var box = openModal(
          '<h2>Bag #' + no + (b.alias ? ' · ' + esc(b.alias) : '') + '</h2>' +
          '<p class="muted">Wishlist of Mystery #' + no + ' (no names shown — safe for the big screen):</p>' +
          wishListHTML(wishes[no]) +
          '<details style="margin-top:18px"><summary>Fix who holds this bag</summary>' +
            '<label>Holder</label><select id="fixHolder">' + opts + '</select>' +
            '<label>Times stolen</label><input id="fixSteals" type="number" min="0" value="' + b.steals + '">' +
            '<button class="btn small" id="fixSave" style="margin-top:12px">Save</button></details>' +
          '<div class="row" style="margin-top:18px"><span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>', true);
        $('#fixSave', box).onclick = function () {
          var h = $('#fixHolder', box).value;
          change(function () {
            if (h) G.bags.forEach(function (x) { if (x.holder === h && G.holdersSitOut) x.holder = ''; });
            b.holder = h; b.steals = Math.max(0, parseInt($('#fixSteals', box).value, 10) || 0);
            log('Organizer set bag #' + no + ' → ' + (h || 'table'));
          });
          closeModal();
        };
      }

      function openSettings() {
        var box = openModal(
          '<h2>Game rules</h2>' +
          '<label>Correct answers needed to pick a bag</label><input id="rTarget" type="number" min="1" max="10" value="' + G.target + '">' +
          '<label>Max steals per bag <span class="hint">(then it\'s locked)</span></label><input id="rSteals" type="number" min="0" max="10" value="' + G.maxSteals + '">' +
          '<label style="font-weight:500"><input type="checkbox" id="rSit"' + (G.holdersSitOut ? ' checked' : '') + '> People holding a bag sit out of trivia (back in if robbed)</label>' +
          '<label style="font-weight:500"><input type="checkbox" id="rReset"' + (G.resetEachRound ? ' checked' : '') + '> Reset everyone\'s score after each pick</label>' +
          '<div class="row" style="margin-top:20px"><button class="btn ghost small" id="rClear">Clear all bags &amp; scores</button><span class="spacer"></span>' +
          '<button class="btn ghost" data-close>Cancel</button><button class="btn" id="rSave">Save</button></div>', true);
        $('#rSave', box).onclick = function () {
          change(function () {
            G.target = Math.max(1, parseInt($('#rTarget', box).value, 10) || 3);
            G.maxSteals = Math.max(0, parseInt($('#rSteals', box).value, 10) || 0);
            G.holdersSitOut = $('#rSit', box).checked;
            G.resetEachRound = $('#rReset', box).checked;
          });
          closeModal();
        };
        $('#rClear', box).onclick = function () {
          ask('Put every bag back on the table and clear all scores?', 'Clear everything').then(function (ok) {
            if (ok) change(function () { G.bags.forEach(function (b) { b.holder = ''; b.steals = 0; }); G.scores = {}; G.log = []; });
          });
        };
      }

      function draw() {
        var free = G.bags.filter(function (b) { return !b.holder; });
        var playing = inPlay();
        var waiting = names.filter(function (n) { return !holderOf(n); });
        var top = Math.max.apply(null, [0].concat(playing.map(function (n) { return G.scores[n] || 0; })));
        var q = trivia[G.qIndex];
        var lastBag = free.length === 1 && waiting.length === 1;

        render(
          '<div class="board-head"><h1>Score keeper</h1><span class="phase-pill">Private</span>' +
            '<span class="small muted" id="saveBadge"></span><span class="spacer"></span>' +
            '<button class="btn ghost small" id="undo"' + (history.length ? '' : ' disabled') + '>↶ Undo</button>' +
            '<button class="btn ghost small" id="rules">⚙ Rules</button>' +
            '<a class="btn secondary small" href="' + TV_URL() + '" target="_blank" rel="noopener">Open TV screen</a></div>' +
          '<p class="small" style="opacity:.8;margin:-6px 0 16px">Only you see this. The TV screen shows the bags and question, and updates by itself.</p>' +
          (lastBag ? '<div class="notice row"><span>Only one bag left and one person without a bag.</span><span class="spacer"></span><button class="btn small" id="lastBag">Give bag #' + free[0].no + ' to ' + esc(waiting[0]) + '</button></div>' : '') +
          (!free.length ? '<div class="notice">🎉 Every bag has a home! Time to open them all together — then start the reveal.</div>' : '') +
          '<div class="keeper">' +
            '<div>' +
              '<div class="trivia-card">' +
                (q ? '<div class="qn">Question ' + (G.qIndex + 1) + ' of ' + trivia.length + '</div><div class="q">' + esc(q.q) + '</div>' +
                  (G.showAnswer ? '<div class="a">' + esc(q.a) + '</div>' : '') : '<div class="q">Out of questions! Add more in the Trivia tab.</div>') +
                '<div class="row" style="margin-top:14px">' +
                  '<button class="btn secondary small" id="qPrev"' + (G.qIndex ? '' : ' disabled') + '>←</button>' +
                  (q ? '<button class="btn gold small" id="qAns">' + (G.showAnswer ? 'Hide answer' : 'Show answer') + '</button>' : '') +
                  '<span class="spacer"></span><button class="btn small" id="qNext"' + (G.qIndex < trivia.length - 1 ? '' : ' disabled') + '>Next question →</button>' +
                '</div></div>' +
              '<div class="card"><h3>Scores · first to ' + G.target + ' picks a bag</h3>' +
                '<div class="scores">' + (playing.length ? playing.map(function (n) {
                  var sc = G.scores[n] || 0;
                  return '<div class="score' + (sc && sc === top ? ' leading' : '') + '"><span class="nm">' + esc(n) + '</span>' +
                    '<span class="pips">' + pips(sc, G.target) + '</span>' +
                    '<span class="btns"><button class="iconbtn" data-minus="' + esc(n) + '" aria-label="Minus one for ' + esc(n) + '">−</button>' +
                    '<button class="iconbtn plus" data-plus="' + esc(n) + '" aria-label="Plus one for ' + esc(n) + '">+</button></span></div>';
                }).join('') : '<p class="muted">Everyone has a bag!</p>') + '</div>' +
                (G.holdersSitOut && names.length - playing.length ? '<p class="small muted" style="margin:14px 0 0">Holding a bag:</p><div class="holders">' +
                  names.filter(function (n) { return holderOf(n); }).map(function (n) { return '<span>' + esc(n) + ' · #' + holderOf(n).no + '</span>'; }).join('') + '</div>' : '') +
                '<button class="btn ghost small" id="manualPick" style="margin-top:12px">Let someone pick without trivia…</button>' +
              '</div>' +
              ((G.log || []).length ? '<div class="card"><h3>What\'s happened</h3><ul class="log">' + G.log.slice(-8).reverse().map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' : '') +
            '</div>' +
            '<div><h3 style="margin:0 0 10px">Bags</h3><div class="bags">' + G.bags.map(function (b) { return bagHTML(b, G, { cls: 'clickable' }); }).join('') + '</div>' +
              '<p class="small" style="opacity:.8;margin-top:10px">Tap a bag to see its wishlist or fix who holds it.</p></div>' +
          '</div>'
        );
        updateSaveBadge();

        $$('[data-plus]').forEach(function (b) {
          b.onclick = function () {
            var n = b.dataset.plus;
            change(function () { G.scores[n] = (G.scores[n] || 0) + 1; });
            if ((G.scores[n] || 0) >= G.target) setTimeout(function () { openPick(n); }, 250);
          };
        });
        $$('[data-minus]').forEach(function (b) {
          b.onclick = function () { var n = b.dataset.minus; if (G.scores[n]) change(function () { G.scores[n]--; }); };
        });
        $$('.keeper .bag').forEach(function (el) { el.onclick = function () { openBag(Number(el.dataset.bag)); }; });
        $('#qNext').onclick = function () { change(function () { G.qIndex++; G.showAnswer = false; }); };
        $('#qPrev').onclick = function () { change(function () { G.qIndex = Math.max(0, G.qIndex - 1); G.showAnswer = false; }); };
        if ($('#qAns')) $('#qAns').onclick = function () { change(function () { G.showAnswer = !G.showAnswer; }); };
        $('#undo').onclick = function () { if (history.length) { G = JSON.parse(history.pop()); save(); draw(); } };
        $('#rules').onclick = openSettings;
        if ($('#lastBag')) $('#lastBag').onclick = function () { pick(waiting[0], free[0].no); };
        $('#manualPick').onclick = function () {
          var box = openModal('<h2>Who gets to pick?</h2><select id="mp">' + names.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') + '</select>' +
            '<div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button><button class="btn" id="mpGo">Choose a bag</button></div>', true);
          $('#mpGo', box).onclick = function () { openPick($('#mp', box).value); };
        };
      }
      draw();
    }).catch(function (e) {
      if (/password/i.test(e.message)) { store('admin', null); boardViewer(); }
      else render('<div class="error">' + esc(e.message) + '</div>');
    });
  }

  // =====================================================================
  // REVEAL
  // =====================================================================
  function viewReveal() {
    app.classList.add('wide');
    loading();
    function waiting() {
      render('<div class="reveal-stage"><div style="font-size:4rem">🤫</div><h1>No peeking!</h1>' +
        '<p class="muted">The reveal starts after everyone opens their gifts. This page will update by itself.</p></div>');
    }
    function tryLoad() {
      return API.call('reveal').then(function (d) { timers.forEach(clearInterval); timers = []; revealAllScreen(d.list, {}); return true; })
        .catch(function (e) { if (/peek/i.test(e.message)) { if (!$('.reveal-stage')) waiting(); return false; } render('<div class="error">' + esc(e.message) + '</div>'); return true; });
    }
    tryLoad().then(function (done) { if (!done) every(5000, tryLoad); });
  }

  function stage(d) {
    var list = d.list, idx = -1, flipped = false;
    var banner = d.preview ? '<div class="test-bar">🧪 <b>Private preview</b> — only you can see this. The real reveal stays locked until you start it. <a href="#/test">Exit preview</a></div>' : '';
    var render = function (html) { app.innerHTML = banner + html; };
    function show() {
      if (idx < 0) {
        render('<div class="reveal-stage poster">' + BURST + SPARK('s1') + SPARK('s2') +
          '<h1 class="poster-type"><span class="script">Who was</span><span class="big">Who?</span></h1>' +
          '<p class="poster-sub">' + list.length + ' Mystery People</p>' +
          '<div class="poster-cta" style="margin-top:18px"><button class="btn cream block" id="go">Start the reveal</button><button class="btn ghost" id="all">Show everyone</button></div></div>');
        $('#go').onclick = next; $('#all').onclick = summary;
        return;
      }
      if (idx >= list.length) return summary();
      var r = list[idx];
      var dots = list.map(function (_, i) { return '<i class="' + (i <= idx ? 'on' : '') + '"></i>'; }).join('');
      render('<div class="reveal-stage">' +
        '<div class="dots">' + dots + '</div>' +
        '<div class="flip' + (flipped ? ' flipped' : '') + '" id="card"><div class="flip-inner">' +
          '<div class="face front">' + KNIT.band({ fg: '#eca7c6', height: 30 }) + '<div class="lbl">' + KNIT.text('#' + r.no) + '</div><div class="num">' + esc(r.alias || ('Mystery Person #' + r.no)) + '</div><div class="q-mark">?</div>' +
            '<div class="small" style="color:var(--cream);opacity:.7;margin-top:18px">Tap to reveal</div></div>' +
          '<div class="face back"><div class="was">#' + r.no + ' ' + esc(r.alias) + ' was…</div><div class="name">' + esc(r.name) + '</div>' +
            '<div class="meta">' + (r.giver ? '<span>🎅 Gift from <b>' + esc(r.giver) + '</b></span>' : '') +
            (r.holder ? '<span>🎁 Bag is with <b>' + esc(r.holder) + '</b></span>' : '') + '</div>' +
            wishListHTML(r.wishes) + '</div>' +
        '</div></div>' +
        '<div class="row" style="justify-content:center"><button class="btn ghost" id="prev">← Back</button>' +
          '<button class="btn cream" id="next">' + (flipped ? (idx === list.length - 1 ? 'See everyone' : 'Next') : 'Reveal') + '</button></div>' +
        '<p class="small muted">Space bar to continue</p></div>');
      $('#card').onclick = next; $('#next').onclick = next; $('#prev').onclick = prev;
    }
    function next() {
      if (idx >= 0 && idx < list.length && !flipped) {
        flipped = true; $('#card').classList.add('flipped');
        setTimeout(function () { confetti(150); }, 450);
        var b = $('#next'); b.textContent = idx === list.length - 1 ? 'See everyone' : 'Next'; b.classList.add('cream');
        return;
      }
      idx++; flipped = false; show();
    }
    function prev() { if (flipped) { flipped = false; show(); } else if (idx >= 0) { idx--; flipped = idx >= 0; show(); } }
    function summary() {
      idx = list.length;
      render('<div class="reveal-stage" style="justify-content:flex-start">' +
        '<h1 class="poster-type" style="margin-bottom:6px"><span class="script">Merry</span><span class="big">Christmas</span></h1><p class="muted" style="margin-bottom:24px">Now find your own wishlist and start trading.</p>' +
        '<div class="summary">' + list.map(function (r) {
          return '<div class="s"><div class="small muted">#' + r.no + ' ' + esc(r.alias) + '</div><div class="t">' + esc(r.name) + '</div>' +
            '<div class="small muted">' + (r.giver ? 'Gift from ' + esc(r.giver) : '') + (r.holder ? ' · Bag with ' + esc(r.holder) : '') + '</div>' +
            '<div class="small" style="margin-top:6px">' + r.wishes.map(function (w) { return esc(w.item); }).join(' · ') + '</div></div>';
        }).join('') + '</div>' +
        '<div class="row" style="margin-top:20px;justify-content:center"><button class="btn ghost" id="again">Start over</button></div></div>');
      confetti(220);
      $('#again').onclick = function () { idx = -1; flipped = false; show(); };
    }
    keyHandler = function (e) {
      if (!modal.hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (idx < list.length) next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    show();
  }
  var keyHandler = null;
  document.addEventListener('keydown', function (e) { if (keyHandler) keyHandler(e); });

  // =====================================================================
  // TEST MODE (organizer only): see everyone, open anyone's page
  // =====================================================================
  function GUIDE(s) {
    var b = peso(s.budget);
    return '<div class="guide-grid guide">' +
      '<div class="card"><h3>The game</h3><ol>' +
        '<li>Everyone adds 3–5 gift ideas around ' + b + ', using their full name and a 4-digit PIN.</li>' +
        '<li>When the countdown ends' + (s.deadline ? ' (' + esc(fmtDeadline(s.deadline)) + ')' : '') + ', wishlists lock and names are drawn automatically. Each person gets a number and a funny animal name, plus someone to shop for.</li>' +
        '<li>People log in, tap "Show me", and see the alias they got (like The Lodi Llama) and that person\'s wishlist. Real names stay hidden from everyone until the reveal.</li>' +
        '<li>Each gift goes in a bag labeled with the number and animal name only, never a real name.</li>' +
        '<li>At the party, every bag goes on one table and people win bags with trivia.</li>' +
        '<li>Everyone opens together, the reveal shows who each Mystery Person was, then people trade to get their own wishlist.</li>' +
      '</ol></div>' +
      '<div class="card"><h3>Party day rules</h3><ul>' +
        '<li>Put the trivia screen on the TV. Read the question, then press Reveal answer (or the space bar).</li>' +
        '<li>Keep score on the printed score sheet: tick a box for each right answer.</li>' +
        '<li>First to 3 correct picks a bag from the table, or steals someone else\'s.</li>' +
        '<li>A bag locks after it\'s been stolen twice.</li>' +
        '<li>Holding a bag means you sit out of trivia. If yours is stolen, you\'re back in.</li>' +
        '<li>Scores reset after every pick. Undo fixes any mis-tap.</li>' +
        '<li>Change any of this in the board\'s Rules button.</li>' +
      '</ul></div>' +
      '<div class="card"><h3>Your checklist</h3><ol>' +
        '<li>Send the invite from the Organizer page.</li>' +
        '<li>Names draw themselves at the deadline. Want it earlier? Press Draw names.</li>' +
        '<li>Remind everyone to log in and see who they\'re shopping for.</li>' +
        '<li>Before the party: print the score sheet (Organizer page).</li>' +
        '<li>Party day: open the trivia screen on the TV and press F for full screen.</li>' +
        '<li>When every bag is opened, put All aliases on the TV and press Reveal everyone. Or reveal one at a time with the space bar.</li>' +
      '</ol></div>' +
      '<div class="card"><h3>Good to know</h3><ul>' +
        '<li>Forgotten PIN: Organizer page, Reset PIN, then tell them privately.</li>' +
        '<li>Late joiner: set a later deadline, undo the draw, add them, then draw again. Only before anyone has shopped.</li>' +
        '<li>Reminders: after joining, people can add the draw time to their phone calendar.</li>' +
        '<li>Everything is saved in your Google Sheet. Don\'t share the Sheet; it shows who\'s who.</li>' +
        '<li>Edit trivia questions in the Sheet\'s Trivia tab.</li>' +
        '<li>Use Open as below to check what any person sees.</li>' +
      '</ul></div>' +
    '</div>';
  }

  // ---- Test mode: one button per phase of the game ----
  function phasesCard(s, drawn) {
    var tile = function (n, id, title, text) {
      return '<button class="phase-btn" id="' + id + '"><span class="pn">' + n + '</span><b>' + title + '</b><span>' + text + '</span></button>';
    };
    return '<div class="phase-grid big">' +
        tile(1, 'ph1', 'Sign up', 'Join with your name, PIN and wishlist') +
        tile(2, 'ph2', 'Name reveal &amp; wishlist', 'See the alias you got and what they\'re asking for') +
        tile(3, 'ph3', 'Trivia', 'Full-screen questions with the answer reveal') +
        tile(4, 'ph4', 'Complete reveal', 'Every Mystery Person revealed at once') +
      '</div><div id="phaseErr" hidden></div>';
  }

  // Puts the demo back into sign-up mode (dates moved if needed, draw undone).
  function ensureSignup(s) {
    var step = Promise.resolve();
    var save = function (vals) { return function () { return API.call('saveSettings', { password: adminPw(), values: vals }); }; };
    if (s.notOpen) {
      if (!store('realOpens') && s.opensAt) store('realOpens', s.opensAt);
      step = step.then(save({ opensAt: new Date(Date.now() - 1000).toISOString() }));
    }
    if (s.editsClosed || s.phase !== 'signup') {
      var real = store('realDeadline');
      var dl = real && Date.parse(real) > Date.now() ? real
        : Date.parse(s.deadline) > Date.now() ? s.deadline
        : new Date(Date.now() + 3 * 864e5).toISOString();
      if (dl !== s.deadline) { if (!real && s.deadline) store('realDeadline', s.deadline); step = step.then(save({ deadline: dl })); }
    }
    if (s.phase !== 'signup') step = step.then(function () { return API.call('reopen', { password: adminPw() }); });
    return step;
  }

  function bindPhases(s, ps) {
    [1, 2, 3, 4].forEach(function (n) { var b = $('#ph' + n); if (b) b.onclick = function () { walkTo(n); }; });
    return;
    var run = function (id, fn) {
      var b = $('#' + id); if (!b) return;
      b.onclick = function () {
        b.disabled = true;
        Promise.resolve(fn()).catch(function (e) { b.disabled = false; showError('#phaseErr', e); });
      };
    };
    var myself = function (players) {
      var me = store('me'), t = null;
      players.forEach(function (p) { if (me && me.name && p.name.toLowerCase() === me.name.toLowerCase()) t = p; });
      return t || players[0];
    };
    run('ph1', function () {
      var go = function () { store('me', null); location.hash = '#/join'; };
      if (s.phase !== 'signup' || s.notOpen || s.editsClosed) {
        return ask('Go back to sign-ups? This undoes the current draw so you can test joining.', 'Back to sign-ups')
          .then(function (ok) { if (ok) return ensureSignup(s).then(go); document.getElementById('ph1').disabled = false; });
      }
      go();
    });
    run('ph2', function () {
      return ensureDrawn(s, ps).then(function () { return API.call('adminList', { password: adminPw() }); })
        .then(function (d) { location.hash = '#/test/as/' + encodeURIComponent(myself(d.players).id); });
    });
    run('ph3', function () { location.hash = '#/trivia'; });
    run('ph4', function () { return ensureDrawn(s, ps).then(function () { location.hash = '#/summary'; }); });
  }

  // ---- Test mode: one-tap sample run ----
  function sampleCard(ps) {
    var me = store('me');
    var who = me && me.name ? me.name : (ps[0] ? ps[0].name : 'a sample person');
    return '<div class="ticket sample">' +
      '<div class="gate-q" style="margin-top:0">See it for yourself</div>' +
      '<p style="color:var(--cream);opacity:.85;max-width:440px;margin:0 auto 18px">One tap draws names and shows you exactly what ' + esc(who.split(' ')[0]) + ' will see' +
      (API.demo && ps.length < 3 ? ', adding sample people so there\'s someone to draw' : '') + '.</p>' +
      '<button class="btn pink" id="sampleRun">Draw a name and show me</button>' +
      '<div id="sampleErr" hidden></div></div>';
  }

  // Gets the demo to a drawn state: opens sign-ups, adds sample people if needed, draws.
  function ensureDrawn(s, ps, force) {
    var step = Promise.resolve();
    var drawn = ps.some(function (p) { return p.mystery; });
    if (drawn && !force) return step;
    if (s.notOpen) {
      if (!store('realOpens') && s.opensAt) store('realOpens', s.opensAt);
      step = step.then(function () { return API.call('saveSettings', { password: adminPw(), values: { opensAt: new Date(Date.now() - 1000).toISOString() } }); });
    }
    if (API.demo && ps.length < 3) step = step.then(function () { API.demoSeed(); });
    return step.then(function () { return API.call('draw', { password: adminPw() }); });
  }

  function partyCard(drawn, s) {
    return '<div class="card party">' +
      '<h2>Practice party day</h2>' +
      '<p class="muted">Run the trivia game and the big reveal exactly as they\'ll look on the TV.' + (drawn ? '' : ' Names get drawn first so there are bags to play for.') + '</p>' +
      '<div class="party-grid">' +
        '<button class="party-btn" id="tryBoard"><b>Trivia &amp; bags</b><span>Ask questions, tap + for the right answer, pick and steal bags</span></button>' +
        '<button class="party-btn" id="tryReveal"><b>The big reveal</b><span>Flip each card to show who every Mystery Person was</span></button>' +
      '</div><div id="partyErr" hidden></div></div>';
  }

  function bindParty(s, ps) {
    var go = function (btn, after) {
      btn.disabled = true;
      ensureDrawn(s, ps).then(function () { return API.call('adminList', { password: adminPw() }); })
        .then(after).catch(function (e) { btn.disabled = false; showError('#partyErr', e); });
    };
    if ($('#tryBoard')) $('#tryBoard').onclick = function () { go(this, function () { location.hash = '#/board'; }); };
    if ($('#tryReveal')) $('#tryReveal').onclick = function () {
      go(this, function (d) {
        var list = d.players.filter(function (p) { return p.mystery; }).map(function (p) {
          var giver = d.players.filter(function (x) { return x.shopsFor === p.mystery; })[0];
          return { no: p.mystery, alias: p.alias, name: p.name, giver: giver ? giver.name : '', wishes: p.wishes, holder: '' };
        }).sort(function (a, b) { return a.no - b.no; });
        revealAllScreen(list, { back: '#/test', backLabel: 'Test mode', banner: '<div class="test-bar">Private preview: only you can see this. The real reveal stays locked until you start it.</div>' });
      });
    };
  }

  function bindSample(s, ps) {
    var b = $('#sampleRun'); if (!b) return;
    b.onclick = function () {
      (API.demo ? Promise.resolve(true) : ask('This draws names for everyone on the real list. Only do this while testing.', 'Draw names')).then(function (ok) {
      if (!ok) return;
      busy(b, true, 'Drawing…');
      ensureDrawn(s, ps, true)
        .then(function () { return API.call('adminList', { password: adminPw() }); })
        .then(function (d) {
          var me = store('me'), target = null;
          d.players.forEach(function (p) { if (me && me.name && p.name.toLowerCase() === me.name.toLowerCase()) target = p; });
          target = target || d.players[0];
          location.hash = '#/test/as/' + encodeURIComponent(target.id);
        })
        .catch(function (e) { busy(b, false); showError('#sampleErr', e); });
      });
    };
  }

  // ---- Test mode: speed up the countdown ----
  function speedCard(s, drawn) {
    var saved = store('realDeadline');
    return '<div class="card speed">' +
      '<div class="row"><h3 style="margin:0">Speed up the timer</h3><span class="spacer"></span>' +
        (s.deadline ? '<span class="small muted">Deadline now: ' + esc(fmtDeadline(s.deadline)) + '</span>' : '') + '</div>' +
      (s.notOpen
        ? countdownHTML(s.opensAt, true, 'Sign-ups open in', 'Opening…') +
          '<p class="small muted" style="margin:8px 0 12px">Sign-ups are still closed. Open them now to test joining, then speed up the deadline.</p>' +
          '<button class="btn small" id="openNow">Open sign-ups now</button>'
        : s.phase === 'signup'
        ? countdownHTML(s.deadline, true) +
          '<p class="small muted" style="margin:8px 0 12px">Move the deadline closer to watch the countdown end, sign-ups lock and names draw themselves. Open the home page or someone\'s page to watch it happen.</p>' +
          '<div class="row"><button class="btn small" data-speed="10">10 seconds</button><button class="btn small" data-speed="60">1 minute</button><button class="btn small" data-speed="300">5 minutes</button></div>'
        : '<p class="small muted" style="margin:8px 0 12px">Names are already drawn. To watch the countdown again, undo the draw: the deadline moves 1 minute ahead and sign-ups reopen.</p>' +
          '<button class="btn small" id="speedAgain">Undo the draw and run a 1-minute timer</button>') +
      (saved ? '<p style="margin:14px 0 0"><button class="btn ghost small" id="restoreDeadline">Put the real deadline back (' + esc(fmtDeadline(saved)) + ')</button></p>' : '') +
      (store('realOpens') ? '<p style="margin:6px 0 0"><button class="btn ghost small" id="restoreOpens">Put the real opening back (' + esc(fmtDeadline(store('realOpens'))) + ')</button></p>' : '') +
      '<div id="speedErr" hidden></div></div>';
  }

  function setDeadline(iso) {
    return API.call('saveSettings', { password: adminPw(), values: { deadline: iso } });
  }

  function bindSpeed(s) {
    var fail = function (e) { showError('#speedErr', e); };
    var remember = function () { if (!store('realDeadline') && s.deadline) store('realDeadline', s.deadline); };
    $$('[data-speed]').forEach(function (b) {
      b.onclick = function () {
        remember();
        busy(b, true, 'Setting…');
        setDeadline(new Date(Date.now() + Number(b.dataset.speed) * 1000).toISOString()).then(viewTest).catch(fail);
      };
    });
    if ($('#speedAgain')) $('#speedAgain').onclick = function () {
      ask('Undo the draw? Everyone loses their current person, and names are drawn again when the 1-minute timer ends.', 'Undo the draw').then(function (ok) {
        if (!ok) return;
        remember();
        setDeadline(new Date(Date.now() + 60000).toISOString())
          .then(function () { return API.call('reopen', { password: adminPw() }); })
          .then(viewTest).catch(fail);
      });
    };
    if ($('#openNow')) $('#openNow').onclick = function () {
      if (!store('realOpens') && s.opensAt) store('realOpens', s.opensAt);
      API.call('saveSettings', { password: adminPw(), values: { opensAt: new Date(Date.now() - 1000).toISOString() } }).then(viewTest).catch(fail);
    };
    if ($('#restoreOpens')) $('#restoreOpens').onclick = function () {
      API.call('saveSettings', { password: adminPw(), values: { opensAt: store('realOpens') } }).then(function () { store('realOpens', null); viewTest(); }).catch(fail);
    };
    if ($('#restoreDeadline')) $('#restoreDeadline').onclick = function () {
      var real = store('realDeadline');
      (Date.parse(real) < Date.now() ? ask('That deadline has already passed, so wishlists will lock and names will be drawn.', 'Continue') : Promise.resolve(true)).then(function (ok) {
        if (ok) setDeadline(real).then(function () { store('realDeadline', null); viewTest(); }).catch(fail);
      });
    };
  }

  function viewTest() {
    app.classList.add('wide');
    if (!adminPw()) return adminLogin(viewTest);
    var parts = location.hash.split('/');
    if (!(parts[2] === 'as' && parts[3])) return viewOrganizer();
    if (parts[2] === 'as' && parts[3]) {
      loading();
      return API.call('viewAs', { password: adminPw(), id: decodeURIComponent(parts[3]) }).then(function (d) {
        app.classList.remove('wide'); meDashboard(d);
      }).catch(function (e) { render('<div class="error">' + esc(e.message) + '</div>'); });
    }
    loading();
    API.call('adminList', { password: adminPw() }).then(function (d) {
      var ps = d.players, s = d.settings;
      var byNo = {}; ps.forEach(function (p) { if (p.mystery) byNo[p.mystery] = p; });
      var drawn = ps.some(function (p) { return p.mystery; });
      var cards = ps.slice().sort(function (a, b) { return (a.mystery || 999) - (b.mystery || 999) || a.name.localeCompare(b.name); }).map(function (p) {
        var t = p.shopsFor ? byNo[p.shopsFor] : null;
        return '<div class="tcard">' +
          '<div class="row"><div><div class="t-name">' + esc(p.name) + '</div>' +
            (p.mystery ? '<div class="t-alias">#' + p.mystery + ' · ' + esc(p.alias) + '</div>' : '<div class="t-alias muted">Not drawn yet</div>') + '</div>' +
            '<span class="spacer"></span><a class="btn small" href="#/test/as/' + encodeURIComponent(p.id) + '">' + (p.mystery ? 'See who ' + esc(p.name.split(' ')[0]) + ' got' : 'Open as ' + esc(p.name.split(' ')[0])) + '</a></div>' +
          (t ? '<div class="t-shop">🎅 Shopping for <b>#' + t.mystery + ' ' + esc(t.alias) + '</b> (' + esc(t.name) + ')</div>' : '') +
          '<div class="wish-mini" style="margin-top:8px">' + p.wishes.map(function (w) { return esc(w.item); }).join(' · ') + '</div>' +
        '</div>';
      }).join('');
      render(
        '<div class="page-head"><h1>Test mode</h1><span class="spacer"></span>' +
          '<button class="btn ghost small" id="howTo">Instructions</button>' +
          '<a class="btn ghost small" href="#/questions">Questions list</a>' +
          '<a class="btn ghost small" href="#/organizer">Organizer</a></div>' +
        phasesCard(s, drawn) +
        '<details class="more"><summary>Everyone (shows every secret)</summary>' +
          (drawn && s.phase === 'drawn' ? '<p style="margin:12px 0"><button class="btn small" id="redraw">Draw again</button></p>' : '') +
          (!drawn && ps.length >= 3 ? '<p style="margin:12px 0"><button class="btn small" id="testDraw">Draw names now</button></p>' : '') +
          (!ps.length ? '<p class="muted" style="margin-top:12px">No one yet. Phase 1 adds you, and phases 2–4 add sample people.</p>' : '') +
          '<div class="tgrid" style="margin-top:12px">' + cards + '</div></details>' +
        '<details class="more"><summary>Timer tools</summary>' + speedCard(s, drawn) + '</details>'
      );
      var doDraw = function (msg) {
        ask(msg, 'Draw names').then(function (ok) {
          if (!ok) return;
          API.call('draw', { password: adminPw() }).then(function () { confetti(120); viewTest(); })
            .catch(function (e) { tell(e.message); });
        });
      };
      if ($('#redraw')) $('#redraw').onclick = function () { doDraw('Draw again? Everyone gets a new person, number and animal name. Only do this while testing, before anyone has shopped.'); };
      if ($('#testDraw')) $('#testDraw').onclick = function () { doDraw('Draw names now? Sign-ups close and everyone gets their person.'); };
      bindSpeed(s);
      bindPhases(s, ps);
      $('#howTo').onclick = function () { openModal('<h2>How it all works</h2>' + GUIDE(s) + '<div class="row" style="justify-content:flex-end"><button class="btn" data-close>Close</button></div>').scrollTop = 0; };
      if ($('#preview')) $('#preview').onclick = function () {
        var list = ps.filter(function (p) { return p.mystery; }).map(function (p) {
          var giver = ps.filter(function (x) { return x.shopsFor === p.mystery; })[0];
          return { no: p.mystery, alias: p.alias, name: p.name, giver: giver ? giver.name : '', wishes: p.wishes, holder: '' };
        }).sort(function (a, b) { return a.no - b.no; });
        location.hash = '#/summary';
      };
    }).catch(function (e) { if (/password/i.test(e.message)) { store('admin', null); adminLogin(viewTest); } else render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // =====================================================================
  // SUMMARY: every alias on one screen, then reveal everyone at once
  // =====================================================================
  // One grid for the final reveal: number + alias on the front, number + real name on the back.
  // All tiles flip at the same moment.
  function revealGridHTML(list, revealed) {
    return '<div class="sum-grid' + (revealed ? ' revealed' : '') + '" id="sumGrid">' + list.map(function (r) {
      return '<div class="sum-tile">' +
        '<div class="sum-front"><div class="sum-no">#' + r.no + '</div><div class="sum-alias">' + esc(r.alias) + '</div></div>' +
        '<div class="sum-back"><div class="sum-no red">#' + r.no + '</div><div class="sum-name">' + esc(r.name) + '</div></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function revealAllScreen(list, opts) {
    opts = opts || {};
    render(
      (opts.banner || '') +
      '<div class="page-head"><h1>The Mystery People</h1><span class="spacer"></span>' +
        (opts.back ? '<a class="btn ghost small" href="' + opts.back + '">' + esc(opts.backLabel || 'Back') + '</a>' : '') +
        '<button class="btn cream" id="revealAll">' + (opts.revealed ? 'Hide names' : 'Reveal everyone') + '</button></div>' +
      revealGridHTML(list, opts.revealed)
    );
    $('#revealAll').onclick = function () {
      var g = $('#sumGrid'), on = !g.classList.contains('revealed');
      g.classList.toggle('revealed', on);
      this.textContent = on ? 'Hide names' : 'Reveal everyone';
      if (on) { setTimeout(function () { confetti(240); }, 350); setTimeout(function () { confetti(180); }, 1100); }
    };
  }

  // =====================================================================
  // SUMMARY (organizer): every alias on one screen, reveal all at once
  // =====================================================================
  function viewSummary() {
    if (!adminPw()) return adminLogin(viewSummary);
    loading();
    API.call('adminList', { password: adminPw() }).then(function (d) {
      var list = d.players.filter(function (p) { return p.mystery; })
        .map(function (p) { return { no: p.mystery, alias: p.alias, name: p.name }; })
        .sort(function (a, b) { return a.no - b.no; });
      if (!list.length) { render('<div class="card center"><h2>No aliases yet</h2><p class="muted">Aliases are handed out when names are drawn.</p><a class="btn" href="#/test">Go to test mode</a></div>'); return; }
      revealAllScreen(list, { back: '#/test', backLabel: 'Test mode' });
    }).catch(function (e) { if (/password/i.test(e.message)) { store('admin', null); adminLogin(viewSummary); } else render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // =====================================================================
  // TRIVIA: full-screen questions for the TV, answer revealed on cue
  // =====================================================================
  function viewTrivia() {
    if (!adminPw()) return adminLogin(viewTrivia);
    loading();
    API.call('gameLoad', { password: adminPw() }).then(function (d) {
      var qs = d.trivia || [];
      var i = Math.min(Number(store('triviaIndex')) || 0, Math.max(0, qs.length - 1));
      var shown = false, started = !!store('triviaSkipIntro');
      store('triviaSkipIntro', null);
      document.body.classList.add('stage-mode');
      function intro() {
        render(
          '<div class="trivia-stage ts-intro">' +
            '<div class="ts-top"><a class="ts-exit" href="#/organizer">Exit</a><span class="ts-count"></span><button class="ts-full" id="tsFull">Full screen</button></div>' +
            KNIT.band({ fg: '#eca7c6', alt: '#f2e8d4', height: 52 }) +
            '<div class="ts-body">' +
              '<img src="assets/favor-logo.png" alt="Favor Church" class="ti-logo">' +
              '<div class="ti-event">' + esc((info && info.eventName) || 'Favor Christmas Party') + '</div>' +
              KNIT.text('Trivia', { cls: 'ti-knit' }) +
              '<p class="ti-rules">First to ' + 3 + ' right answers picks a gift from the table, or steals one.</p>' +
            '</div>' +
            KNIT.band({ fg: '#eca7c6', alt: '#f2e8d4', height: 52 }) +
            '<div class="ts-controls" style="margin-top:22px"><button class="ts-btn big" id="tsBegin">Let\'s begin</button></div>' +
          '</div>'
        );
        $('#tsBegin').onclick = begin; $('#tsFull').onclick = full;
      }
      function begin() { started = true; draw(); }
      function draw() {
        if (!started) return intro();
        var q = qs[i];
        render(
          '<div class="trivia-stage">' +
            '<div class="ts-top"><a class="ts-exit" href="#/organizer">Exit</a><span class="ts-count">Question ' + (i + 1) + ' of ' + qs.length + '</span>' +
              '<button class="ts-full" id="tsFull">Full screen</button></div>' +
            '<div class="ts-body">' +
              (q ? '<div class="ts-q">' + esc(q.q) + '</div>' +
                '<div class="ts-a' + (shown ? ' on' : '') + '"><span>' + esc(q.a) + '</span></div>'
                : '<div class="ts-q">No questions yet. Add them in the Trivia tab of the Google Sheet.</div>') +
            '</div>' +
            '<div class="ts-controls">' +
              '<button class="ts-btn ghost" id="tsPrev"' + (i ? '' : ' disabled') + '>Back</button>' +
              '<button class="ts-btn big" id="tsReveal">' + (shown ? 'Hide answer' : 'Reveal answer') + '</button>' +
              '<button class="ts-btn ghost" id="tsNext"' + (i < qs.length - 1 ? '' : ' disabled') + '>Next</button>' +
            '</div>' +
            '<div class="ts-keys">Space: reveal answer · Arrow keys: next / back · F: full screen</div>' +
          '</div>'
        );
        $('#tsPrev').onclick = prev; $('#tsNext').onclick = next; $('#tsReveal').onclick = toggle;
        $('#tsFull').onclick = full;
      }
      function go(n) { i = n; shown = false; store('triviaIndex', i); draw(); }
      function next() { if (i < qs.length - 1) go(i + 1); }
      function prev() { if (i > 0) go(i - 1); }
      function toggle() {
        shown = !shown;
        var a = $('.ts-a'); if (a) a.classList.toggle('on', shown);
        $('#tsReveal').textContent = shown ? 'Hide answer' : 'Reveal answer';
        if (shown) confetti(80);
      }
      function full() {
        var el = document.documentElement;
        if (!document.fullscreenElement) { (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el); }
        else { (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document); }
      }
      keyHandler = function (e) {
        if (!modal.hidden) return;
        if (!started) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); begin(); } else if (e.key === 'f' || e.key === 'F') full(); return; }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        else if (e.key === 'f' || e.key === 'F') full();
      };
      draw();
    }).catch(function (e) { if (/password/i.test(e.message)) { store('admin', null); adminLogin(viewTrivia); } else render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // =====================================================================
  // PRINTABLE SCORE SHEET
  // =====================================================================
  function viewSheet() {
    if (!adminPw()) return adminLogin(viewSheet);
    loading();
    API.call('adminList', { password: adminPw() }).then(function (d) {
      var s = d.settings, names = d.players.map(function (p) { return p.name; }).sort(function (a, b) { return a.localeCompare(b); });
      var boxes = ''; for (var k = 0; k < 10; k++) boxes += '<i></i>';
      var rows = names.map(function (n, idx) {
        return '<tr><td class="sh-n">' + (idx + 1) + '</td><td class="sh-name">' + esc(n) + '</td><td class="sh-tally">' + boxes + '</td><td class="sh-bag"></td><td class="sh-bag"></td></tr>';
      }).join('');
      for (var e = 0; e < 3; e++) rows += '<tr class="sh-blank"><td class="sh-n"></td><td class="sh-name"></td><td class="sh-tally">' + boxes + '</td><td class="sh-bag"></td><td class="sh-bag"></td></tr>';
      render(
        '<div class="page-head no-print"><h1>Score sheet</h1><span class="spacer"></span>' +
          '<a class="btn ghost small" href="#/organizer">Organizer</a><button class="btn cream" id="printSheet">Print</button></div>' +
        '<div class="sheet">' +
          '<div class="sh-head"><img src="assets/favor-logo.png" alt="" class="sh-logo"><div><div class="sh-title">' + esc(s.eventName) + '</div>' +
            '<div class="sh-sub">Mystery Kris Kringle trivia. First to 3 correct picks a gift or steals one.</div></div></div>' +
          '<table class="sh-table"><thead><tr><th></th><th>Name</th><th>Correct answers (tick one per right answer)</th><th>Gift #</th><th>Stolen to #</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>' +
          '<p class="sh-foot">' + names.length + ' players. Blank rows at the bottom for late arrivals.</p>' +
        '</div>'
      );
      $('#printSheet').onclick = function () { window.print(); };
    }).catch(function (e) { if (/password/i.test(e.message)) { store('admin', null); adminLogin(viewSheet); } else render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // =====================================================================
  // QUESTIONS LIST
  // =====================================================================
  function viewQuestions() {
    if (!adminPw()) return adminLogin(viewQuestions);
    loading();
    API.call('gameLoad', { password: adminPw() }).then(function (d) {
      var qs = d.trivia || [];
      render(
        '<div class="page-head no-print"><h1>Questions</h1><span class="spacer"></span>' +
          '<a class="btn ghost small" href="#/test">Test mode</a><button class="btn ghost small" id="printQs">Print</button>' +
          '<a class="btn cream" href="#/trivia">Start trivia</a></div>' +
        '<div class="card qlist">' +
          '<p class="muted no-print" style="margin-top:0">' + qs.length + ' questions. Tap one to start the trivia screen there.' + (API.demo ? '' : ' Edit them in the Trivia tab of the Google Sheet.') + '</p>' +
          '<ol>' + qs.map(function (q, i) {
            return '<li><a href="#" data-q="' + i + '"><span class="q">' + esc(q.q) + '</span><span class="a">' + esc(q.a) + '</span></a></li>';
          }).join('') + '</ol></div>'
      );
      $$('[data-q]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); store('triviaIndex', Number(a.dataset.q)); store('triviaSkipIntro', 1); location.hash = '#/trivia'; }; });
      $('#printQs').onclick = function () { window.print(); };
    }).catch(function (e) { if (/password/i.test(e.message)) { store('admin', null); adminLogin(viewQuestions); } else render('<div class="error">' + esc(e.message) + '</div>'); });
  }

  // =====================================================================
  // TEST WALKTHROUGH: go through the guest experience phase by phase
  // =====================================================================
  var PHASES = ['Sign up', 'Name reveal & wishlist', 'Trivia', 'Complete reveal'];
  function walkState() { return store('walk'); }

  function renderWalkBar() {
    var bar = document.getElementById('walkBar');
    var w = null;
    document.body.classList.toggle('walking', !!(w && adminPw()));
    if (!w || !adminPw()) { bar.hidden = true; bar.innerHTML = ''; return; }
    var n = w.phase;
    var next = n === 1 ? 'Skip the timer and draw names' : n === 2 ? 'Next: Trivia' : n === 3 ? 'Next: Complete reveal' : 'Start over';
    bar.hidden = false;
    bar.innerHTML = '<div class="wb-inner"><span class="wb-title">Test walkthrough</span>' +
      '<ol class="wb-steps">' + PHASES.map(function (p, i) {
        return '<li class="' + (i + 1 === n ? 'on' : i + 1 < n ? 'done' : '') + '"><button data-walk="' + (i + 1) + '"><b>' + (i + 1) + '</b>' + esc(p) + '</button></li>';
      }).join('') + '</ol>' +
      '<button class="btn pink small" id="wbNext">' + next + '</button>' +
      '<button class="wb-exit" id="wbExit">Exit</button></div>';
    $$('[data-walk]', bar).forEach(function (b) { b.onclick = function () { walkTo(Number(b.dataset.walk)); }; });
    $('#wbNext', bar).onclick = function () { walkTo(n === 4 ? 1 : n + 1); };
    $('#wbExit', bar).onclick = function () { store('walk', null); location.hash = '#/test'; };
  }

  function goHash(h) { if (location.hash === h) route(); else location.hash = h; }

  function clearGuestFlags() {
    try { Object.keys(sessionStorage).forEach(function (k) { if (/^kk-(opened-|seen-)/.test(k)) sessionStorage.removeItem(k); }); } catch (e) {}
  }

  function walkTo(n) {
    var bar = document.getElementById('walkBar'); $$('button', bar).forEach(function (b) { b.disabled = true; });
    var fail = function (e) { store('walk', { phase: (walkState() || {}).phase || 1 }); renderWalkBar(); tell(e.message || String(e)); };
    API.call('adminList', { password: adminPw() }).then(function (d) {
      var s = d.settings, ps = d.players;
      if (n === 1) {
        // Fresh start: you type your own name, PIN and wishlist like a guest.
        var prep = API.demo
          ? Promise.resolve().then(function () { API.demoReset(); })
          : ensureSignup(s);
        return prep.then(function () {
          store('me', null); clearGuestFlags();
          store('walk', { phase: 1 }); goHash('#/join');
        });
      }
      if (n === 2) {
        var me = store('me');
        if (!me || !me.name) { tell('Sign up first (Phase 1), then skip the timer.'); store('walk', { phase: 1 }); return goHash('#/join'); }
        return ensureDrawn(s, ps).then(function () {
          clearGuestFlags();
          store('walk', { phase: 2 }); goHash('#/me');
        });
      }
      return ensureDrawn(s, ps).then(function () {
        store('walk', { phase: n });
        goHash(n === 3 ? '#/trivia' : '#/summary');
      });
    }).catch(fail);
  }

  // =====================================================================
  // ROUTER
  // =====================================================================
  var routes = { '': viewHome, join: viewJoin, me: viewMe, organizer: viewOrganizer, board: viewBoard, reveal: viewReveal, test: viewTest, summary: viewSummary, scores: viewScores, trivia: viewTrivia, sheet: viewSheet, questions: viewQuestions };
  function route() {
    timers.forEach(clearInterval); timers = [];
    keyHandler = null; closeModal();
    document.body.classList.remove('stage-mode');
    var name = (location.hash.replace(/^#\/?/, '').split('/')[0] || '');
    var fn = routes[name] || viewHome;
    app.classList.remove('wide');
    if (name === 'organizer' || name === 'summary' || name === 'sheet') app.classList.add('wide');
    $$('.nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#/' + name); });
    window.scrollTo(0, 0);
    fn();
    renderWalkBar();
  }
  addEventListener('hashchange', route);

  // Every fresh visit starts on the front page, whatever link or old tab it came from.
  if (location.hash && location.hash !== '#/' && location.hash !== '#' && !/[?&]tv\b/.test(location.search)) {
    try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) { location.hash = '#/'; }
  }
  var fb = document.getElementById('footBand');
  if (fb) fb.innerHTML = KNIT.band({ fg: '#f2e8d4', alt: '#eca7c6', height: 44 });
  route();
})();
