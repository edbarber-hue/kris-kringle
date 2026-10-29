/* ===================== Google Sheet storage + web endpoint ===================== */

var SHEET_PLAYERS = 'Players';
var SHEET_SETTINGS = 'Settings';
var SHEET_TRIVIA = 'Trivia';
// Columns: who they are, who they're giving to, their email, their wishlist, then technical columns (don't edit).
var PLAYER_HEADERS = ['WHO THEY ARE', 'WHO THEY\'RE GIVING TO', 'Email',
  'Wish 1', 'Wish 2', 'Wish 3', 'Wish 4', 'Wish 5', 'Signed up',
  'Draw # (do not edit)', 'Alias (unused)', 'Gives to draw # (do not edit)', 'ID (do not edit)', 'PIN hash (do not edit)', 'PIN key (do not edit)'];

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing "' + name + '" tab. Run the setup function first.');
  return sh;
}

function wishToCell_(w) { return w ? (w.link ? w.item + '  |  ' + w.link : w.item) : ''; }
function cellToWish_(c) {
  c = String(c || '').trim();
  if (!c) return null;
  var i = c.lastIndexOf('|');
  if (i > 0 && /https?:\/\//.test(c.slice(i))) return { item: c.slice(0, i).trim(), link: c.slice(i + 1).trim() };
  return { item: c, link: '' };
}

// Keeps the Players tab readable: bold headers, the two key columns highlighted.
function formatPlayers_(sh) {
  sh.getRange(1, 1, 1, PLAYER_HEADERS.length).setValues([PLAYER_HEADERS]).setFontWeight('bold')
    .setBackground('#0f3d2e').setFontColor('#ffffff');
  sh.getRange(1, 1, 1, 2).setBackground('#b3342a');
  sh.getRange(1, 10, 1, 6).setBackground('#9e9e9e');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
}

var SheetDB = {
  getPlayers: function () {
    var sh = sheet_(SHEET_PLAYERS);
    var n = sh.getLastRow() - 1;
    if (n < 1) return [];
    // Sheets saved before the Email column existed have 'Wish 1' in column C: read them shifted by one.
    var o = String(sh.getRange(1, 3).getValue()).trim() === 'Email' ? 1 : 0;
    return sh.getRange(2, 1, n, PLAYER_HEADERS.length).getValues()
      .filter(function (r) { return String(r[0]).trim() && r[11 + o]; })
      .map(function (r) {
        var wishes = [];
        for (var i = 2 + o; i <= 6 + o; i++) { var w = cellToWish_(r[i]); if (w) wishes.push(w); }
        return {
          name: String(r[0]).trim(), email: o ? String(r[2] || '').trim() : '',
          mystery: Number(r[8 + o]) || 0, alias: String(r[9 + o] || ''), shopsFor: Number(r[10 + o]) || 0,
          wishes: wishes, joinedAt: r[7 + o] instanceof Date ? r[7 + o].toISOString() : String(r[7 + o]),
          id: String(r[11 + o]), pinHash: String(r[12 + o]), pinKey: String(r[13 + o] || '')
        };
      });
  },
  savePlayers: function (list) {
    var sh = sheet_(SHEET_PLAYERS);
    var byNo = {};
    list.forEach(function (p) { if (p.mystery) byNo[p.mystery] = p.name; });
    var rows = list.map(function (p) {
      var w = p.wishes || [];
      return [p.name, p.shopsFor ? (byNo[p.shopsFor] || '') : '', p.email || '',
        wishToCell_(w[0]), wishToCell_(w[1]), wishToCell_(w[2]), wishToCell_(w[3]), wishToCell_(w[4]),
        p.joinedAt, p.mystery || '', p.alias || '', p.shopsFor || '', p.id, p.pinHash, p.pinKey || ''];
    });
    formatPlayers_(sh);
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, PLAYER_HEADERS.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, PLAYER_HEADERS.length).setValues(rows);
  },
  getSettings: function () {
    var vals = sheet_(SHEET_SETTINGS).getDataRange().getValues();
    var s = {};
    vals.forEach(function (r) { if (r[0]) s[String(r[0]).trim()] = r[1]; });
    return {
      phase: String(s.phase || 'signup'), budget: Number(s.budget) || 500,
      eventName: String(s.eventName || 'Favor Christmas Party 2027'),
      deadline: s.deadline instanceof Date ? s.deadline.toISOString() : String(s.deadline || ''),
      timerEnds: s.timerEnds instanceof Date ? s.timerEnds.toISOString() : String(s.timerEnds || ''),
      opensAt: s.opensAt instanceof Date ? s.opensAt.toISOString() : String(s.opensAt || ''),
      partyDate: s.partyDate instanceof Date ? Utilities.formatDate(s.partyDate, Session.getScriptTimeZone(), 'MMM d, yyyy') : String(s.partyDate || ''),
      adminPassword: String(s.adminPassword || ''), salt: String(s.salt || '')
    };
  },
  saveSettings: function (s) {
    var sh = sheet_(SHEET_SETTINGS);
    var vals = sh.getDataRange().getValues();
    var DATES = { deadline: 1, opensAt: 1, timerEnds: 1 };
    ['phase', 'budget', 'eventName', 'opensAt', 'deadline', 'partyDate', 'timerEnds'].forEach(function (k) {
      if (s[k] === undefined) return;
      var row = -1;
      for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === k) row = i + 1;
      var v = DATES[k] && s[k] ? "'" + s[k] : s[k];
      if (row < 0) { sh.appendRow([k, v]); vals.push([k, s[k]]); }
      else sh.getRange(row, 2).setValue(v);
    });
  },
  getGame: function () {
    var raw = PropertiesService.getScriptProperties().getProperty('GAME');
    return raw ? JSON.parse(raw) : null;
  },
  saveGame: function (g) {
    var props = PropertiesService.getScriptProperties();
    if (g) props.setProperty('GAME', JSON.stringify(g)); else props.deleteProperty('GAME');
  },
  getTrivia: function () {
    var sh = ss_().getSheetByName(SHEET_TRIVIA);
    if (!sh || sh.getLastRow() < 2) return KK_TRIVIA_SEED;
    return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
      .filter(function (r) { return String(r[0]).trim(); })
      .map(function (r) { return { q: String(r[0]).trim(), a: String(r[1]).trim() }; });
  }
};

function sha256_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function run_(op, payload) {
  // Every request can write (names are drawn automatically at the deadline), so all take the lock.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'The site is busy — please try again in a few seconds.' };
  var out;
  try {
    if (op === 'emailMaster') {
      var st = SheetDB.getSettings();
      if (!st.adminPassword || String(payload.password || '') !== String(st.adminPassword)) return { ok: false, error: 'Wrong organizer password.' };
      out = { ok: true, data: { sentTo: emailMasterList_() } };
    } else if (op === 'emailEveryone') {
      var st2 = SheetDB.getSettings();
      if (!st2.adminPassword || String(payload.password || '') !== String(st2.adminPassword)) return { ok: false, error: 'Wrong organizer password.' };
      if (st2.phase === 'signup') return { ok: false, error: 'Draw names first.' };
      out = { ok: true, data: emailEveryone_() };
    } else {
      out = KKCore.handle(SheetDB, sha256_, op, payload);
    }
  } finally { lock.releaseLock(); }
  try { afterDraw_(); } catch (e) {}
  return out;
}

/* ---------- Master list + messages, emailed to you once names are drawn ---------- */

function drawKey_(players) {
  return sha256_(players.map(function (p) { return p.id + '>' + p.shopsFor; }).sort().join('|'));
}

// Runs after every request and every 10 minutes: once a draw exists, write the
// Messages tab and email the organizer, exactly once per draw.
function afterDraw_() {
  var s = SheetDB.getSettings();
  var props = PropertiesService.getScriptProperties();
  if (s.phase === 'signup') { props.deleteProperty('EMAILED_DRAW'); return; }
  var players = SheetDB.getPlayers();
  var key = drawKey_(players);
  if (props.getProperty('EMAILED_DRAW') === key) return;
  emailMasterList_();
  props.setProperty('EMAILED_DRAW', key);
}

function writeMessagesTab_(msgs) {
  var ss = ss_();
  var sh = ss.getSheetByName('Messages') || ss.insertSheet('Messages');
  sh.clear();
  sh.getRange(1, 1, 1, 3).setValues([['Send to', 'They chose', 'Message (copy and send)']]).setFontWeight('bold');
  if (msgs.length) sh.getRange(2, 1, msgs.length, 3).setValues(msgs.map(function (m) { return [m.name, m.chose, m.text]; }));
  sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 170); sh.setColumnWidth(3, 520);
  sh.getRange('C:C').setWrap(true);
  sh.setFrozenRows(1);
}

function emailMasterList_() {
  var s = SheetDB.getSettings();
  var players = SheetDB.getPlayers().sort(function (a, b) { return a.name.localeCompare(b.name); });
  var msgs = KKCore.buildMessages(players, s);
  writeMessagesTab_(msgs);
  var byNo = {};
  players.forEach(function (p) { if (p.mystery) byNo[p.mystery] = p; });
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var html = '<h2>' + esc(s.eventName) + ': Kris Kringle master list</h2>' +
    '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    '<tr style="background:#b3342a;color:#fff"><th align="left">Name</th><th align="left">Their wishlist</th><th align="left">Buying for</th></tr>' +
    players.map(function (p) {
      var t = byNo[p.shopsFor];
      return '<tr style="border-bottom:1px solid #ddd"><td valign="top"><b>' + esc(p.name) + '</b></td><td valign="top">' +
        p.wishes.map(function (w) { return esc(w.item) + (w.link ? ' (<a href="' + esc(w.link) + '">link</a>)' : ''); }).join('<br>') +
        '</td><td valign="top"><b>' + (t ? esc(t.name) : '') + '</b></td></tr>';
    }).join('') + '</table>' +
    '<h2 style="margin-top:28px">Messages to send</h2>' +
    msgs.map(function (m) {
      return '<p style="margin:18px 0 4px"><b>To ' + esc(m.name) + ':</b></p>' +
        '<div style="white-space:pre-wrap;background:#f6efe0;padding:12px;border-radius:6px;font-family:Arial,sans-serif">' + esc(m.text) + '</div>';
    }).join('') +
    '<p style="color:#777;margin-top:24px">These are also in the Messages tab of your Google Sheet.</p>';
  var text = 'MASTER LIST\n\n' + players.map(function (p) {
    var t = byNo[p.shopsFor];
    return p.name + (t ? ' -> buying for ' + t.name : '') + '\n  ' + p.wishes.map(function (w) { return w.item; }).join('\n  ');
  }).join('\n\n') + '\n\nMESSAGES\n\n' + msgs.map(function (m) { return 'To ' + m.name + ':\n' + m.text; }).join('\n\n----\n\n');
  var to = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: to, subject: s.eventName + ': Kris Kringle master list + messages', body: text, htmlBody: html });
  return to;
}

// Sends each person their own "you chose ___" message, from your Gmail.
function emailEveryone_() {
  var s = SheetDB.getSettings();
  var msgs = KKCore.buildMessages(SheetDB.getPlayers(), s);
  var sent = 0, missing = [], failed = [];
  msgs.forEach(function (m) {
    if (!m.email) { missing.push(m.name); return; }
    try {
      MailApp.sendEmail({ to: m.email, subject: s.eventName + ': your Kris Kringle 🎁', body: m.text, name: s.eventName });
      sent++;
    } catch (e) { failed.push(m.name); }
  });
  return { sent: sent, missing: missing, failed: failed, quotaLeft: MailApp.getRemainingDailyQuota() };
}

// Every 10 minutes: draws names once the deadline passes (even if nobody visits the site), then emails you.
function checkDeadline() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try { KKCore.handle(SheetDB, sha256_, 'info', {}); } finally { lock.releaseLock(); }
  afterDraw_();
}

// Run this by hand any time to get the master list emailed to you again.
function sendMasterListNow() { emailMasterList_(); }

function doGet(e) {
  var p = (e && e.parameter) || {};
  return respond_(run_(p.op || 'info', p));
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return respond_({ ok: false, error: 'Bad request.' }); }
  return respond_(run_(body.op, body.payload || {}));
}

/**
 * RUN THIS ONCE (select "setup" in the toolbar, then click Run).
 * It creates the Players, Settings and Trivia tabs.
 */
function setup() {
  var ss = ss_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkDeadline') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkDeadline').timeBased().everyMinutes(10).create();
  var players = ss.getSheetByName(SHEET_PLAYERS) || ss.insertSheet(SHEET_PLAYERS);
  formatPlayers_(players);
  players.setColumnWidths(1, 3, 200);
  players.setColumnWidths(4, 5, 220);

  var settings = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (settings.getLastRow() < 1) {
    settings.getRange(1, 1, 9, 3).setValues([
      ['Setting', 'Value', 'Notes'],
      ['adminPassword', 'change-me', 'Organizer password for the website. CHANGE THIS.'],
      ['eventName', 'Favor Christmas Party 2027', 'Shown at the top of the site'],
      ['budget', 500, 'Gift budget in pesos'],
      ['opensAt', '', 'When sign-ups open (Manila time). Change it from the website\'s Organizer page.'],
      ['deadline', "'2026-10-27T23:59:00+08:00", 'Wishlist deadline (Manila time). Change it from the website\'s Organizer page.'],
      ['partyDate', '', 'Party date, e.g. Dec 19'],
      ['phase', 'signup', 'Managed by the website: signup / drawn / revealed'],
      ['salt', Utilities.getUuid(), 'Used to scramble PINs. Do not change after people sign up.']
    ]);
    settings.getRange(1, 1, 1, 3).setFontWeight('bold');
    settings.setColumnWidth(1, 140); settings.setColumnWidth(2, 260); settings.setColumnWidth(3, 380);
  }


  var first = ss.getSheets()[0];
  if (first.getName() === 'Sheet1' && first.getLastRow() === 0) ss.deleteSheet(first);
  SpreadsheetApp.getUi && SpreadsheetApp.getActive().toast('All set! Now change adminPassword in the Settings tab, then Deploy → New deployment.');
}
