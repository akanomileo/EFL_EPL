
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const STORAGE = {
  settings: 'league_settings',
  teams: 'league_teams',
  matches: 'league_matches'
};

function read(k, d) {
  try {
    const value = JSON.parse(localStorage.getItem(k));
    return value ?? d;
  } catch {
    return d;
  }
}

function save(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
  if (window.leagueSync && window.leagueSync.saveKey) {
    window.leagueSync.saveKey(k, v);
  } else if (window.firebaseEFL && window.firebaseEFL.saveKey) {
    window.firebaseEFL.saveKey(k, v);
  }
}

const defaults = {
  settings: {
    tournamentName: 'EFL League',
    teamLimit: 48,
    leagueSize: 20,
    fixtureFormat: 'single',
    resultDeadlineDate: '',
    resultDeadlineTime: '',
    adminPin: ''
  },
  teams: [],
  matches: []
};

function data() {
  return {
    settings: { ...defaults.settings, ...read(STORAGE.settings, defaults.settings) },
    teams: read(STORAGE.teams, defaults.teams),
    matches: read(STORAGE.matches, defaults.matches)
  };
}

window.data = data;

function setData(o) {
  if (o.settings) save(STORAGE.settings, o.settings);
  if (o.teams) save(STORAGE.teams, o.teams);
  if (o.matches) save(STORAGE.matches, o.matches);
}

function tournamentName(settings) {
  const s = settings || data().settings;
  return String(s.tournamentName || defaults.settings.tournamentName).trim() || defaults.settings.tournamentName;
}

function resultDeadlineDateTime(settings) {
  const s = settings || data().settings;
  const date = String(s.resultDeadlineDate || '').trim();
  const time = String(s.resultDeadlineTime || '').trim();
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function resultDeadlineText(settings) {
  const s = settings || data().settings;
  if (!s.resultDeadlineDate || !s.resultDeadlineTime) return 'No result deadline set';
  return `${s.resultDeadlineDate} ${s.resultDeadlineTime}`;
}

function isResultDeadlinePassed(settings) {
  const dt = resultDeadlineDateTime(settings);
  return Boolean(dt && Date.now() > dt.getTime());
}

function applyResultDeadlineDefaults() {
  const d = data();
  if (!isResultDeadlinePassed(d.settings)) return 0;

  let changed = 0;
  d.matches = d.matches.map((m) => {
    const missingHome = m.homeScore === '' || m.homeScore === null || m.homeScore === undefined;
    const missingAway = m.awayScore === '' || m.awayScore === null || m.awayScore === undefined;
    if (missingHome && missingAway) {
      changed += 1;
      return { ...m, homeScore: '0', awayScore: '0', autoDrawApplied: true, autoDrawAppliedAt: new Date().toISOString() };
    }
    return m;
  });

  if (changed > 0) setData({ matches: d.matches });
  return changed;
}

function rerenderCurrentPage() {
  const p = location.pathname.split('/').pop() || 'index.html';
  if (p === 'index.html') renderHome();
  else if (p === 'fixtures.html') renderFixtures();
  else if (p === 'results.html') renderResults();
  else if (p === 'standings.html') renderStandings();
  else if (p === 'teams.html') renderTeams();
  else if (p === 'admin.html') renderAdmin();
}

window.rerenderCurrentPage = rerenderCurrentPage;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function layout(active) {
  const name = escapeHtml(tournamentName());
  return `<header class="top"><div class="wrap nav"><a class="brand" href="index.html"><img src="logo.png"><span>${name}</span></a><nav class="links"><a class="${active === 'home' ? 'active' : ''}" href="index.html">Home</a><a class="${active === 'fixtures' ? 'active' : ''}" href="fixtures.html">Fixtures</a><a class="${active === 'results' ? 'active' : ''}" href="results.html">Results</a><a class="${active === 'standings' ? 'active' : ''}" href="standings.html">Standings</a><a class="${active === 'teams' ? 'active' : ''}" href="teams.html">Teams</a><a class="admin-dot" title="Admin" href="admin.html">⚙</a></nav></div></header>`;
}

function init(active) {
  const name = escapeHtml(tournamentName());
  document.title = tournamentName();
  document.querySelectorAll('.top,.footer').forEach((el) => el.remove());
  document.body.insertAdjacentHTML('afterbegin', layout(active));
  document.body.insertAdjacentHTML('beforeend', `<footer class="footer"><div class="wrap">© ${new Date().getFullYear()} ${name}</div></footer>`);
}

function fixtureScheduleText(m) {
  const date = String(m.date || '').trim();
  const time = String(m.time || '').trim();
  const dateText = date && date !== 'TBA' ? date : 'TBA';
  const timeText = time && time !== 'TBA' ? time : '';
  return timeText ? `${dateText} • ${timeText}` : dateText;
}

function matchCard(m, editable = false) {
  const isPending = m.homeScore === '' || m.awayScore === '';
  const score = isPending ? 'vs' : `${m.homeScore} - ${m.awayScore}`;
  const scoreClass = isPending ? 'score vs-pill' : 'score score-result';
  return `<div class="match fixture-match"><div class="team-name team-home">${escapeHtml(m.home)}</div><div class="match-center"><div class="${scoreClass}">${escapeHtml(score)}</div><div class="match-date">${escapeHtml(fixtureScheduleText(m))}</div></div><div class="team-name team-away">${escapeHtml(m.away)}</div>${editable ? `<div class="match-edit"><button class="btn" onclick="editResult(${m.id})">Edit</button></div>` : ''}</div>`;
}

function standings() {
  const { teams, matches } = data();
  const map = {};
  teams.forEach((t) => {
    map[t.name] = { team: t.name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
  });

  matches
    .filter((m) => m.homeScore !== '' && m.awayScore !== '')
    .forEach((m) => {
      const h = map[m.home];
      const a = map[m.away];
      if (!h || !a) return;

      const hs = Number(m.homeScore);
      const as = Number(m.awayScore);
      if (!Number.isFinite(hs) || !Number.isFinite(as)) return;

      h.P += 1;
      a.P += 1;
      h.GF += hs;
      h.GA += as;
      a.GF += as;
      a.GA += hs;
      h.GD = h.GF - h.GA;
      a.GD = a.GF - a.GA;

      if (hs > as) {
        h.W += 1;
        a.L += 1;
        h.Pts += 3;
      } else if (hs < as) {
        a.W += 1;
        h.L += 1;
        a.Pts += 3;
      } else {
        h.D += 1;
        a.D += 1;
        h.Pts += 1;
        a.Pts += 1;
      }
    });

  return Object.values(map).sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF || a.team.localeCompare(b.team));
}

function groupByRound(matches) {
  const rounds = [...new Set(matches.map((m) => m.round || 'Matchweek'))]
    .sort((a, b) => {
      const na = Number(String(a).match(/\d+/)?.[0] || 0);
      const nb = Number(String(b).match(/\d+/)?.[0] || 0);
      return na - nb;
    });

  return rounds.map((round) => ({
    round,
    matches: matches.filter((m) => (m.round || 'Matchweek') === round)
  }));
}

function renderHome() {
  applyResultDeadlineDefaults();
  init('home');
  const { teams, matches, settings } = data();
  const pending = matches.filter((m) => m.homeScore === '' || m.awayScore === '').slice(0, 4);
  const completed = matches.filter((m) => m.homeScore !== '' && m.awayScore !== '').slice(0, 4);
  const name = escapeHtml(tournamentName(settings));

  $('#app').innerHTML = `<section class="hero"><div class="wrap hero-grid"><div class="panel"><h1>${name}</h1><a class="btn" href="fixtures.html">View Fixtures</a> <a class="btn alt" href="standings.html">View League Table</a><div class="stats"><div class="stat"><b>${teams.length}</b><br><span>Teams</span></div><div class="stat"><b>${settings.leagueSize}</b><br><span>League Size</span></div><div class="stat"><b>${matches.length}</b><br><span>Fixtures</span></div></div></div><div class="panel"><h2>Upcoming Fixtures</h2>${pending.map((m) => matchCard(m)).join('') || '<p class="small">No upcoming fixtures yet.</p>'}</div></div></section><section class="section"><div class="wrap"><div class="title"><h2>Latest Results</h2><a href="results.html">View all</a></div><div class="card">${completed.map((m) => matchCard(m)).join('') || '<p class="small">No results yet.</p>'}</div></div></section>`;
}

function renderFixtures() {
  applyResultDeadlineDefaults();
  init('fixtures');
  const ms = data().matches.filter((m) => m.homeScore === '' || m.awayScore === '');
  const groupedHtml = groupByRound(ms).map(({ round, matches }) => `<h3 class="round-title">${escapeHtml(round)}</h3><div class="card">${matches.map((m) => matchCard(m)).join('')}</div>`).join('');
  $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Fixtures</h2></div>${groupedHtml || '<div class="card">No upcoming fixtures.</div>'}</div></section>`;
}

function renderResults() {
  applyResultDeadlineDefaults();
  init('results');
  const d = data();
  const ms = d.matches.filter((m) => m.homeScore !== '' && m.awayScore !== '');
  const deadlineStatus = isResultDeadlinePassed(d.settings)
    ? `Result deadline passed: ${escapeHtml(resultDeadlineText(d.settings))}. Blank results are auto-recorded as 0-0 draws.`
    : `Result deadline: ${escapeHtml(resultDeadlineText(d.settings))}`;
  const groupedHtml = groupByRound(ms).map(({ round, matches }) => `<h3 class="round-title">${escapeHtml(round)}</h3><div class="card">${matches.map((m) => matchCard(m)).join('')}</div>`).join('');
  $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Results</h2></div><p class="small">${deadlineStatus}</p>${groupedHtml || '<div class="card">No results yet.</div>'}</div></section>`;
}

function renderTeams() {
  init('teams');
  const { teams, settings } = data();
  $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Teams</h2><span class="tag">${teams.length}/${settings.leagueSize} teams</span></div><div class="grid">${teams.map((t, i) => `<div class="card"><h3>${escapeHtml(t.name)}</h3><span class="tag">#${i + 1}</span></div>`).join('') || '<p>No teams yet.</p>'}</div></div></section>`;
}

function renderStandings() {
  applyResultDeadlineDefaults();
  init('standings');
  const rows = standings();
  $('#app').innerHTML = `<section class="section"><div class="wrap"><h2>League Table</h2><div class="table-scroll"><table class="table standings-table"><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>${rows.map((r) => `<tr><td><b>${escapeHtml(r.team)}</b></td><td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td><td>${r.GF}</td><td>${r.GA}</td><td>${r.GD}</td><td><b>${r.Pts}</b></td></tr>`).join('')}</table></div>${rows.length ? '' : '<p>No standings yet.</p>'}</div></section>`;
}

function renderAdmin() {
  applyResultDeadlineDefaults();
  init('');
  const logged = sessionStorage.getItem('league_admin') === 'yes';
  $('#app').innerHTML = logged ? adminDash() : loginBox();
  bindAdmin();
}

function loginBox() {
  const settings = data().settings;
  if (!settings.adminPin) {
    return `<section class="section"><div class="wrap"><div class="panel" style="max-width:420px;margin:auto"><h2>Create Admin PIN</h2><p class="small">No default PIN is shown or used. Create your private admin PIN before managing the league.</p><div class="form"><input id="newPin" type="password" placeholder="New admin PIN"><input id="confirmPin" type="password" placeholder="Confirm admin PIN"><button class="btn" id="createPinBtn">Create PIN</button></div></div></div></section>`;
  }
  return `<section class="section"><div class="wrap"><div class="panel" style="max-width:420px;margin:auto"><h2>Admin Login</h2><div class="form"><input id="pin" type="password" placeholder="Admin PIN"><button class="btn" id="loginBtn">Login</button></div></div></div></section>`;
}

function adminDash() {
  return `<section class="section"><div class="wrap admin-layout"><div class="side panel"><button data-tab="settings" class="active">League Settings</button><button data-tab="teams">Bulk Teams</button><button data-tab="fixtures">Fixtures + Schedule</button><button data-tab="results">Fast Result Entry</button><button onclick="sessionStorage.removeItem('league_admin');location.reload()">Logout</button></div><div class="panel"><div id="adminContent"></div></div></div></section>`;
}

function bindAdmin() {
  const createPinBtn = $('#createPinBtn');
  if (createPinBtn) {
    createPinBtn.onclick = () => {
      const newPin = ($('#newPin')?.value || '').trim();
      const confirmPin = ($('#confirmPin')?.value || '').trim();
      if (newPin.length < 4) return alert('PIN must be at least 4 characters.');
      if (newPin !== confirmPin) return alert('PINs do not match.');
      const s = data().settings;
      s.adminPin = newPin;
      setData({ settings: s });
      sessionStorage.setItem('league_admin', 'yes');
      location.reload();
    };
  }

  const lb = $('#loginBtn');
  if (lb) {
    lb.onclick = () => {
      if ($('#pin').value === data().settings.adminPin) {
        sessionStorage.setItem('league_admin', 'yes');
        location.reload();
      } else {
        alert('Wrong PIN');
      }
    };
  }

  if ($('#adminContent')) {
    showAdminTab('settings');
    $$('.side button[data-tab]').forEach((b) => {
      b.onclick = () => {
        $$('.side button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        showAdminTab(b.dataset.tab);
      };
    });
  }
}

function adminMessage(text, type = 'ok') {
  const box = $('#adminMessage');
  if (box) box.innerHTML = `<div class="notice ${type}">${escapeHtml(text)}</div>`;
}

function showAdminTab(tab) {
  const { settings, teams, matches } = data();
  const c = $('#adminContent');

  if (tab === 'settings') {
    c.innerHTML = `<h2>League Settings</h2><div id="adminMessage"></div><div class="form"><label>League name <input id="tournamentName" value="${escapeHtml(tournamentName(settings))}" placeholder="Example: EFL League"></label><label>League size <input id="leagueSize" type="number" min="2" max="48" value="${settings.leagueSize}"></label><label>Fixture format <select id="fixtureFormat"><option value="single" ${settings.fixtureFormat === 'single' ? 'selected' : ''}>Single round-robin</option><option value="double" ${settings.fixtureFormat === 'double' ? 'selected' : ''}>Home & away</option></select></label><label>Admin PIN <input id="adminPin" type="password" value="${escapeHtml(settings.adminPin)}" placeholder="Set admin PIN"></label><button class="btn" onclick="saveSettings()">Save Settings</button></div><p class="small">Default league size is 20 teams. Maximum is 48 teams.</p>`;
  }

  if (tab === 'teams') {
    c.innerHTML = `<h2>Bulk Teams</h2><div id="adminMessage"></div><div class="admin-tools"><div class="tool-card"><h3>Paste teams at once</h3><p class="small">Paste one team per line. Commas also work. Maximum ${settings.teamLimit} teams.</p><textarea id="bulkTeams" rows="12" placeholder="Team 1\nTeam 2\nTeam 3\nTeam 4"></textarea><div class="check-row"><label><input id="replaceTeams" type="checkbox" checked> Replace current teams</label><label><input id="shuffleTeams" type="checkbox" checked> Shuffle before fixture generation</label><label><input id="autoFixtures" type="checkbox" checked> Generate league fixtures after saving teams</label></div><button class="btn" onclick="bulkCreateTeams()">Save Teams</button></div><div class="tool-card"><h3>Single team add</h3><div class="form compact"><input id="teamName" placeholder="Team name"><button class="btn" onclick="addTeam()">Add Team</button></div><hr><p class="small"><b>Current:</b> ${teams.length}/${settings.leagueSize} teams</p><p class="small"><b>Maximum:</b> ${settings.teamLimit} teams</p><button class="btn danger" onclick="clearTeamsAndMatches()">Clear Teams + Fixtures</button></div></div><br><h3>Team List</h3><div class="table-scroll"><table class="table"><tr><th>#</th><th>Team</th><th>Action</th></tr>${teams.map((t, i) => `<tr><td>${i + 1}</td><td><input value="${escapeHtml(t.name)}" onchange="updateTeam(${t.id}, this.value)"></td><td><button onclick="deleteTeam(${t.id})">Delete</button></td></tr>`).join('') || '<tr><td colspan="3">No teams yet.</td></tr>'}</table></div>`;
  }

  if (tab === 'fixtures') {
    const roundTables = groupByRound(matches).map(({ round, matches }) => {
      const rows = matches.map((m) => `<tr><td><b>${escapeHtml(m.home)}</b><br><span class="small">vs ${escapeHtml(m.away)}</span></td><td><input id="date_${m.id}" type="date" value="${escapeHtml((m.date && m.date !== 'TBA') ? m.date : '')}"></td><td><input id="time_${m.id}" type="time" value="${escapeHtml((m.time && m.time !== 'TBA') ? m.time : '')}"></td></tr>`).join('');
      return `<h3 class="round-title">${escapeHtml(round)}</h3><div class="table-scroll"><table class="table"><tr><th>Match</th><th>Date</th><th>Time</th></tr>${rows}</table></div>`;
    }).join('');

    c.innerHTML = `<h2>Fixtures + Optional Schedule</h2><div id="adminMessage"></div><div class="admin-actions"><button class="btn" onclick="generateFixtures()">Generate League Fixtures</button><button class="btn alt" onclick="clearFixtureSchedule()">Clear Date/Time Only</button><button class="btn danger" onclick="clearFixtures()">Clear Fixtures</button></div><p class="small">Date and time are optional. Leave them blank if the schedule is not confirmed.</p><div class="tool-card"><h3>Quick schedule apply</h3><p class="small">Apply the same date/time to all fixtures, then adjust individual matches below.</p><div class="form compact"><input id="bulkFixtureDate" type="date"><input id="bulkFixtureTime" type="time"><button class="btn" onclick="applyBulkFixtureSchedule()">Apply to All Fixtures</button></div></div><br>${roundTables || '<div class="card">No fixtures yet. Generate fixtures first.</div>'}<div class="admin-actions"><button class="btn" onclick="saveFixtureSchedule()">Save Fixture Date/Time</button></div>`;
  }

  if (tab === 'results') {
    const deadlinePassed = isResultDeadlinePassed(settings);
    const deadlineStatus = deadlinePassed
      ? `Deadline passed: ${escapeHtml(resultDeadlineText(settings))}. Blank results will become 0-0.`
      : `Deadline: ${escapeHtml(resultDeadlineText(settings))}`;

    c.innerHTML = `<h2>Fast Result Entry</h2><div id="adminMessage"></div><div class="tool-card"><h3>Result filling deadline</h3><p class="small">Optional. After this date and time, any match without a result automatically becomes a 0-0 draw. Admin can still edit later.</p><div class="form compact"><input id="resultDeadlineDate" type="date" value="${escapeHtml(settings.resultDeadlineDate || '')}"><input id="resultDeadlineTime" type="time" value="${escapeHtml(settings.resultDeadlineTime || '')}"><button class="btn" onclick="saveResultDeadline()">Save Deadline</button><button class="btn alt" onclick="applyDeadlineDrawsNow()">Apply 0-0 Now</button></div><p class="small">${deadlineStatus}</p></div><br><p class="small">Enter all scores on one screen, then click Save All Results.</p><div class="table-scroll"><table class="table result-table"><tr><th>Round</th><th>Match</th><th>Home</th><th>Away</th><th>Status</th></tr>${matches.map((m) => `<tr><td>${escapeHtml(m.round)}</td><td><b>${escapeHtml(m.home)}</b><br><span class="small">vs ${escapeHtml(m.away)}</span></td><td><input class="score-input" id="hs_${m.id}" type="number" min="0" inputmode="numeric" value="${escapeHtml(m.homeScore)}"></td><td><input class="score-input" id="as_${m.id}" type="number" min="0" inputmode="numeric" value="${escapeHtml(m.awayScore)}"></td><td>${m.autoDrawApplied ? '<span class="tag">Auto 0-0</span>' : '<span class="small">Manual / pending</span>'}</td></tr>`).join('') || '<tr><td colspan="5">No matches yet. Generate fixtures first.</td></tr>'}</table></div><div class="admin-actions"><button class="btn" onclick="saveAllResults()">Save All Results</button><button class="btn alt" onclick="clearAllScores()">Clear All Scores</button></div>`;
  }
}

function parseTeamNames(raw) {
  const names = String(raw || '')
    .split(/\n|,|;/)
    .map((name) => name.trim())
    .filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffleArray(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createTeamsFromNames(names, preserveIds = false, existingTeams = []) {
  const currentByName = new Map(existingTeams.map((t) => [t.name.toLowerCase(), t.id]));
  return names.map((name, index) => ({
    id: preserveIds && currentByName.has(name.toLowerCase()) ? currentByName.get(name.toLowerCase()) : Date.now() + index,
    name
  }));
}

window.saveSettings = () => {
  const s = data().settings;
  s.tournamentName = ($('#tournamentName')?.value || '').trim() || defaults.settings.tournamentName;
  s.leagueSize = Math.max(2, Math.min(48, Number($('#leagueSize').value) || 20));
  s.teamLimit = 48;
  s.fixtureFormat = $('#fixtureFormat')?.value || 'single';
  const newAdminPin = ($('#adminPin')?.value || '').trim();
  if (newAdminPin.length < 4) return adminMessage('Admin PIN must be at least 4 characters.', 'bad');
  s.adminPin = newAdminPin;
  setData({ settings: s });
  adminMessage('League settings saved.', 'ok');
};

window.addTeam = () => {
  const d = data();
  if (d.teams.length >= d.settings.teamLimit) return alert('Maximum 48 teams');
  const name = $('#teamName').value.trim();
  if (!name) return;
  if (d.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) return alert('This team already exists.');
  d.teams.push({ id: Date.now(), name });
  setData({ teams: d.teams });
  showAdminTab('teams');
};

window.updateTeam = (id, value) => {
  const d = data();
  const name = String(value || '').trim();
  if (!name) return;
  d.teams = d.teams.map((t) => (t.id === id ? { ...t, name } : t));
  d.matches = d.matches.map((m) => ({
    ...m,
    home: m.home === d.teams.find((t) => t.id === id)?.name ? name : m.home,
    away: m.away === d.teams.find((t) => t.id === id)?.name ? name : m.away
  }));
  setData({ teams: d.teams, matches: d.matches });
};

window.deleteTeam = (id) => {
  const d = data();
  const team = d.teams.find((t) => t.id === id);
  d.teams = d.teams.filter((t) => t.id !== id);
  d.matches = d.matches.filter((m) => m.home !== team?.name && m.away !== team?.name);
  setData({ teams: d.teams, matches: d.matches });
  showAdminTab('teams');
};

window.bulkCreateTeams = () => {
  const d = data();
  const pasted = parseTeamNames($('#bulkTeams').value);
  const replace = $('#replaceTeams').checked;
  const autoFixtures = $('#autoFixtures').checked;
  const shuffle = $('#shuffleTeams').checked;

  if (pasted.length === 0) return adminMessage('Paste team names first.', 'bad');
  const names = replace ? pasted : parseTeamNames([...d.teams.map((t) => t.name), ...pasted].join('\n'));
  if (names.length > d.settings.teamLimit) return adminMessage(`You have ${names.length} teams. Maximum is ${d.settings.teamLimit}.`, 'bad');

  const finalNames = shuffle ? shuffleArray(names) : names;
  const teams = createTeamsFromNames(finalNames, false, d.teams);
  const newData = { teams };

  if (autoFixtures) newData.matches = buildLeagueFixtures(teams, d.settings);
  else if (replace) newData.matches = [];

  setData(newData);
  showAdminTab('teams');
  adminMessage(`${teams.length} teams saved${autoFixtures ? ' and league fixtures generated' : ''}.`, 'ok');
};

window.clearTeamsAndMatches = () => {
  if (!confirm('Clear all teams, fixtures, and results?')) return;
  setData({ teams: [], matches: [] });
  showAdminTab('teams');
};

function buildLeagueFixtures(teams, settings) {
  const names = teams.map((t) => t.name);
  if (names.length < 2) return [];

  const arr = [...names];
  if (arr.length % 2 === 1) arr.push('BYE');

  const n = arr.length;
  const rounds = n - 1;
  const half = n / 2;
  const generated = [];
  let current = [...arr];

  for (let r = 0; r < rounds; r++) {
    const roundMatches = [];

    for (let i = 0; i < half; i++) {
      let home = current[i];
      let away = current[n - 1 - i];
      if (home === 'BYE' || away === 'BYE') continue;

      // Better home/away distribution.
      if ((r + i) % 2 === 1) {
        [home, away] = [away, home];
      }

      roundMatches.push({ home, away });
    }

    roundMatches.forEach((m) => {
      generated.push({
        id: Date.now() + generated.length,
        round: `Matchweek ${r + 1}`,
        home: m.home,
        away: m.away,
        homeScore: '',
        awayScore: '',
        date: '',
        time: ''
      });
    });

    current = [current[0], current[n - 1], ...current.slice(1, n - 1)];
  }

  if (settings.fixtureFormat === 'double') {
    const firstLegCount = generated.length;
    for (let i = 0; i < firstLegCount; i++) {
      const m = generated[i];
      const matchweekNumber = Number(String(m.round).match(/\d+/)?.[0] || 0) + rounds;
      generated.push({
        id: Date.now() + generated.length,
        round: `Matchweek ${matchweekNumber}`,
        home: m.away,
        away: m.home,
        homeScore: '',
        awayScore: '',
        date: '',
        time: ''
      });
    }
  }

  return generated;
}

window.generateFixtures = () => {
  const d = data();
  if (d.teams.length < 2) return adminMessage('Add at least 2 teams first.', 'bad');
  const matchCount = d.settings.fixtureFormat === 'double'
    ? d.teams.length * (d.teams.length - 1)
    : (d.teams.length * (d.teams.length - 1)) / 2;

  if (matchCount > 1500 && !confirm(`This will create ${matchCount} matches. Continue?`)) return;

  d.matches = buildLeagueFixtures(d.teams, d.settings);
  setData({ matches: d.matches });
  showAdminTab('fixtures');
  adminMessage(`${d.matches.length} league fixtures generated.`, 'ok');
};

window.clearFixtures = () => {
  if (!confirm('Clear all fixtures and results?')) return;
  setData({ matches: [] });
  showAdminTab('fixtures');
  adminMessage('Fixtures cleared.', 'ok');
};

window.saveFixtureSchedule = () => {
  const d = data();
  d.matches = d.matches.map((m) => ({
    ...m,
    date: $(`#date_${m.id}`)?.value || '',
    time: $(`#time_${m.id}`)?.value || ''
  }));
  setData({ matches: d.matches });
  showAdminTab('fixtures');
  adminMessage('Fixture date/time saved.', 'ok');
};

window.applyBulkFixtureSchedule = () => {
  const date = $('#bulkFixtureDate')?.value || '';
  const time = $('#bulkFixtureTime')?.value || '';
  if (!date && !time) return adminMessage('Choose a date, time, or both first.', 'bad');
  const d = data();
  d.matches = d.matches.map((m) => ({ ...m, date: date || m.date || '', time: time || m.time || '' }));
  setData({ matches: d.matches });
  showAdminTab('fixtures');
  adminMessage('Date/time applied to all fixtures.', 'ok');
};

window.clearFixtureSchedule = () => {
  if (!confirm('Clear date and time from all fixtures? Scores and matches will stay.')) return;
  const d = data();
  d.matches = d.matches.map((m) => ({ ...m, date: '', time: '' }));
  setData({ matches: d.matches });
  showAdminTab('fixtures');
  adminMessage('Fixture date/time cleared.', 'ok');
};

window.saveResultDeadline = () => {
  const d = data();
  const date = ($('#resultDeadlineDate')?.value || '').trim();
  const time = ($('#resultDeadlineTime')?.value || '').trim();

  if ((date && !time) || (!date && time)) {
    return adminMessage('Please set both deadline date and deadline time, or leave both blank.', 'bad');
  }

  d.settings.resultDeadlineDate = date;
  d.settings.resultDeadlineTime = time;
  setData({ settings: d.settings });

  const changed = applyResultDeadlineDefaults();
  showAdminTab('results');

  if (changed > 0) adminMessage(`Deadline saved. ${changed} blank result(s) auto-recorded as 0-0.`, 'ok');
  else adminMessage('Result deadline saved.', 'ok');
};

window.applyDeadlineDrawsNow = () => {
  const d = data();
  if (!resultDeadlineDateTime(d.settings)) return adminMessage('Set the result deadline first.', 'bad');
  if (!isResultDeadlinePassed(d.settings)) return adminMessage('Deadline has not passed yet.', 'bad');

  const changed = applyResultDeadlineDefaults();
  showAdminTab('results');

  if (changed > 0) adminMessage(`${changed} blank result(s) auto-recorded as 0-0.`, 'ok');
  else adminMessage('No blank results needed auto-draw.', 'ok');
};

window.saveAllResults = () => {
  const d = data();
  d.matches = d.matches.map((m) => {
    const hs = $(`#hs_${m.id}`)?.value ?? m.homeScore;
    const as = $(`#as_${m.id}`)?.value ?? m.awayScore;
    return { ...m, homeScore: hs, awayScore: as, autoDrawApplied: false, autoDrawAppliedAt: '' };
  });
  setData({ matches: d.matches });
  showAdminTab('results');
  adminMessage('All results saved.', 'ok');
};

window.clearAllScores = () => {
  if (!confirm('Clear all scores? Fixtures will stay.')) return;
  const d = data();
  d.matches = d.matches.map((m) => ({ ...m, homeScore: '', awayScore: '', autoDrawApplied: false, autoDrawAppliedAt: '' }));
  setData({ matches: d.matches });
  showAdminTab('results');
  adminMessage('Scores cleared.', 'ok');
};
