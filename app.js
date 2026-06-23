
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
    matchweekDeadlines: {},
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

function getRoundDeadline(settings, round = '') {
  const s = settings || data().settings;
  const deadlines = s.matchweekDeadlines || {};
  const roundKey = String(round || '').trim();
  const specific = roundKey ? deadlines[roundKey] : null;

  if (specific && specific.date && specific.time) {
    return { date: specific.date, time: specific.time, source: roundKey };
  }

  // Fallback for older saved data that still used one global deadline.
  if (s.resultDeadlineDate && s.resultDeadlineTime) {
    return { date: s.resultDeadlineDate, time: s.resultDeadlineTime, source: 'global' };
  }

  return null;
}

function resultDeadlineDateTime(settings, round = '') {
  const deadline = getRoundDeadline(settings, round);
  if (!deadline) return null;

  const dt = new Date(`${deadline.date}T${deadline.time}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function resultDeadlineText(settings, round = '') {
  const deadline = getRoundDeadline(settings, round);
  if (!deadline) return 'No deadline set';
  return `${deadline.date} ${deadline.time}`;
}

function isResultDeadlinePassed(settings, round = '') {
  const dt = resultDeadlineDateTime(settings, round);
  return Boolean(dt && Date.now() > dt.getTime());
}

function sortedRounds(matches) {
  return [...new Set((matches || []).map((m) => m.round || 'Matchweek'))]
    .sort((a, b) => {
      const na = Number(String(a).match(/\d+/)?.[0] || 0);
      const nb = Number(String(b).match(/\d+/)?.[0] || 0);
      return na - nb || String(a).localeCompare(String(b));
    });
}

function hasMatchweekDeadline(settings, round) {
  const d = (settings.matchweekDeadlines || {})[round] || {};
  return Boolean(d.date && d.time);
}

function visibleFixtureMatchweeks(settings, matches) {
  return sortedRounds(matches).filter((round) => hasMatchweekDeadline(settings, round));
}

function roundDeadlineStatus(settings, round) {
  const text = resultDeadlineText(settings, round);
  if (text === 'No deadline set') return 'No deadline set';
  return isResultDeadlinePassed(settings, round) ? `Passed: ${text}` : `Deadline: ${text}`;
}

function applyResultDeadlineDefaults() {
  const d = data();
  let changed = 0;

  d.matches = d.matches.map((m) => {
    if (!isResultDeadlinePassed(d.settings, m.round)) return m;

    const missingHome = m.homeScore === '' || m.homeScore === null || m.homeScore === undefined;
    const missingAway = m.awayScore === '' || m.awayScore === null || m.awayScore === undefined;

    if (missingHome && missingAway) {
      changed += 1;
      return {
        ...m,
        homeScore: '0',
        awayScore: '0',
        autoDrawApplied: true,
        autoDrawAppliedAt: new Date().toISOString(),
        autoDrawDeadlineRound: m.round || ''
      };
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
  else if (p === 'topscorers.html') renderTopScorers();
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


function teamInitials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return initials || '?';
}

function getTeamByName(teamName) {
  return data().teams.find((t) => String(t.name).toLowerCase() === String(teamName).toLowerCase());
}

function teamLogoHtml(teamName, className = 'team-logo') {
  const team = getTeamByName(teamName);
  const logo = team?.logo || '';
  if (logo) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(logo)}" alt="${escapeHtml(teamName)} logo">`;
  }
  return `<div class="${escapeHtml(className)} logo-placeholder">${escapeHtml(teamInitials(teamName))}</div>`;
}

function topLogoWall(rows = []) {
  const items = rows.slice(0, 5).map((row, index) => `
    <div class="leader-logo-tile ${index === 0 ? 'leader-logo-tile-main' : ''}">
      ${teamLogoHtml(row.team, 'leader-wall-logo')}
      <span class="leader-logo-tile-rank">#${row.rank}</span>
    </div>`).join('');
  return `<div class="leader-logo-wall">${items}</div>`;
}

function layout(active) {
  const name = escapeHtml(tournamentName());
  return `<header class="top"><div class="wrap nav"><a class="brand" href="index.html"><img src="logo.png"><span>${name}</span></a><nav class="links"><a class="${active === 'home' ? 'active' : ''}" href="index.html">Home</a><a class="${active === 'fixtures' ? 'active' : ''}" href="fixtures.html">Fixtures</a><a class="${active === 'results' ? 'active' : ''}" href="results.html">Results</a><a class="${active === 'standings' ? 'active' : ''}" href="standings.html">Standings</a><a class="${active === 'topscorers' ? 'active' : ''}" href="topscorers.html">Top Scorers</a><a class="${active === 'teams' ? 'active' : ''}" href="teams.html">Teams</a><a class="admin-dot" title="Admin" href="admin.html">⚙</a></nav></div></header>`;
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

function topScoringTeams() {
  const rows = standings().map((r, index) => ({ ...r, standingRank: index + 1 }));
  return rows
    .sort((a, b) => b.GF - a.GF || b.Pts - a.Pts || b.GD - a.GD || a.team.localeCompare(b.team))
    .map((r, index) => ({ ...r, rank: index + 1 }));
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
  const scoring = topScoringTeams().slice(0, 5);
  const leader = scoring[0];
  const scoringHtml = leader
    ? `<div class="topscorer-showcase"><div class="leader-card">${topLogoWall(scoring)}<div class="leader-label">Leading team</div><div class="leader-rank">#${leader.rank}</div><h3>${escapeHtml(leader.team)}</h3><div class="leader-goals">${leader.GF}</div><p class="small">Goals scored</p><div class="leader-meta"><span class="tag">Table position: ${leader.standingRank}</span><span class="tag">Goal difference: ${leader.GD}</span></div></div><div class="card topscorer-side-list"><div class="small-list-heading">Top 5 scoring teams</div>${scoring.map((row) => `<div class="topscorer-item ${row.rank === 1 ? 'is-leading' : ''}"><div class="topscorer-rank">#${row.rank}</div>${teamLogoHtml(row.team, 'topscorer-list-logo')}<div class="topscorer-team"><b>${escapeHtml(row.team)}</b><span class="small">Table #${row.standingRank}</span></div><div class="topscorer-goals">${row.GF}<span>goals</span></div></div>`).join('')}</div></div>`
    : '<div class="card"><p class="small">No teams available yet.</p></div>';

  $('#app').innerHTML = `<section class="hero"><div class="wrap hero-grid"><div class="panel"><h1>${name}</h1><a class="btn" href="fixtures.html">View Fixtures</a> <a class="btn alt" href="standings.html">View League Table</a><div class="stats"><div class="stat"><b>${teams.length}</b><br><span>Teams</span></div><div class="stat"><b>${settings.leagueSize}</b><br><span>League Size</span></div><div class="stat"><b>${matches.length}</b><br><span>Fixtures</span></div></div></div><div class="panel"><h2>Upcoming Fixtures</h2>${pending.map((m) => matchCard(m)).join('') || '<p class="small">No upcoming fixtures yet.</p>'}</div></div></section><section class="section"><div class="wrap"><div class="title"><h2>Latest Results</h2><a href="results.html">View all</a></div><div class="card">${completed.map((m) => matchCard(m)).join('') || '<p class="small">No results yet.</p>'}</div></div></section><section class="section"><div class="wrap"><div class="title"><h2>Top Scoring Teams</h2><a href="topscorers.html">View full ranking</a></div>${scoringHtml}</div></section>`;
}

function renderFixtures() {
  applyResultDeadlineDefaults();
  init('fixtures');
  const d = data();
  const visibleRounds = visibleFixtureMatchweeks(d.settings, d.matches);

  const ms = d.matches.filter((m) =>
    (m.homeScore === '' || m.awayScore === '') &&
    visibleRounds.includes(m.round || 'Matchweek')
  );

  const groupedHtml = groupByRound(ms)
    .map(({ round, matches }) => {
      const deadlineText = resultDeadlineText(d.settings, round);
      return `<h3 class="round-title">${escapeHtml(round)}</h3><p class="small">Result deadline: ${escapeHtml(deadlineText)}</p><div class="card">${matches.map((m) => matchCard(m)).join('')}</div>`;
    })
    .join('');

  $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Fixtures</h2></div>${groupedHtml || '<div class="card"><p class="small">No fixtures are available yet. Matchweek fixtures will appear here after admin sets the deadline for that matchweek.</p></div>'}</div></section>`;
}

function renderResults() {
  applyResultDeadlineDefaults();
  init('results');
  const d = data();
  const ms = d.matches.filter((m) => m.homeScore !== '' && m.awayScore !== '');
  const rounds = sortedRounds(d.matches);
  const configuredRounds = rounds.filter((round) => hasMatchweekDeadline(d.settings, round));
  const passedCount = configuredRounds.filter((round) => isResultDeadlinePassed(d.settings, round)).length;
  const upcomingCount = configuredRounds.length - passedCount;

  const overviewHtml = configuredRounds.length
    ? `<div class="card results-overview"><div class="results-overview-head"><div><h3>Deadline Overview</h3><p class="small">Only matchweeks with a saved deadline are listed here.</p></div><div class="results-overview-stats"><div class="stat-mini"><b>${configuredRounds.length}</b><span>Configured</span></div><div class="stat-mini"><b>${passedCount}</b><span>Passed</span></div><div class="stat-mini"><b>${upcomingCount}</b><span>Upcoming</span></div></div></div><div class="results-chip-grid">${configuredRounds.map((round) => `<div class="results-chip ${isResultDeadlinePassed(d.settings, round) ? 'passed' : 'upcoming'}"><b>${escapeHtml(round)}</b><span>${escapeHtml(roundDeadlineStatus(d.settings, round))}</span></div>`).join('')}</div></div>`
    : `<div class="card results-overview"><p class="small">No matchweek deadlines have been set yet.</p></div>`;

  const groupedHtml = groupByRound(ms)
    .map(({ round, matches }) => `<div class="results-round-block"><div class="results-round-head"><h3 class="round-title">${escapeHtml(round)}</h3><span class="results-round-status ${isResultDeadlinePassed(d.settings, round) ? 'passed' : hasMatchweekDeadline(d.settings, round) ? 'upcoming' : 'unset'}">${escapeHtml(roundDeadlineStatus(d.settings, round))}</span></div><div class="card">${matches.map((m) => matchCard(m)).join('')}</div></div>`)
    .join('');

  $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Results</h2></div>${overviewHtml}${groupedHtml || '<div class="card">No results yet.</div>'}</div></section>`;
}

function renderTeams() {
  init('teams');
  const { teams, settings } = data();
  $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Teams</h2><span class="tag">${teams.length}/${settings.leagueSize} teams</span></div><div class="grid">${teams.map((t, i) => `<div class="card team-card-public"><div class="team-card-logo">${teamLogoHtml(t.name, 'public-team-logo')}</div><h3>${escapeHtml(t.name)}</h3><span class="tag">#${i + 1}</span></div>`).join('') || '<p>No teams yet.</p>'}</div></div></section>`;
}

function renderTopScorers() {
  applyResultDeadlineDefaults();
  init('topscorers');
  const rows = topScoringTeams();
  const leader = rows[0];
  const sideRows = rows.slice(0, 5);

  if (!leader) {
    $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Top Scoring Teams</h2></div><div class="card"><p class="small">No teams yet.</p></div></div></section>`;
    return;
  }

  $('#app').innerHTML = `<section class="section"><div class="wrap"><div class="title"><h2>Top Scoring Teams</h2><span class="tag">Highest scoring team award view</span></div><div class="topscorer-showcase"><div class="leader-card">${topLogoWall(sideRows)}<div class="leader-label">Leading team</div><div class="leader-rank">#${leader.rank}</div><h3>${escapeHtml(leader.team)}</h3><div class="leader-goals">${leader.GF}</div><p class="small">Goals scored</p><div class="leader-meta"><span class="tag">Table position: ${leader.standingRank}</span><span class="tag">Points: ${leader.Pts}</span><span class="tag">Goal difference: ${leader.GD}</span></div></div><div class="card topscorer-side-list"><div class="small-list-heading">Top 5 scoring teams</div>${sideRows.map((row) => `<div class="topscorer-item ${row.rank === 1 ? 'is-leading' : ''}"><div class="topscorer-rank">#${row.rank}</div>${teamLogoHtml(row.team, 'topscorer-list-logo')}<div class="topscorer-team"><b>${escapeHtml(row.team)}</b><span class="small">P ${row.P} • W ${row.W} • D ${row.D} • L ${row.L}</span></div><div class="topscorer-goals">${row.GF}<span>goals</span></div></div>`).join('')}</div></div><div class="table-scroll" style="margin-top:22px"><table class="table"><tr><th>Rank</th><th>Team</th><th>Goals Scored</th><th>Matches</th><th>Points</th><th>GD</th></tr>${rows.map((row) => `<tr><td><b>#${row.rank}</b></td><td><div class="table-team-cell">${teamLogoHtml(row.team, 'table-team-logo')}<b>${escapeHtml(row.team)}</b></div></td><td>${row.GF}</td><td>${row.P}</td><td>${row.Pts}</td><td>${row.GD}</td></tr>`).join('')}</table></div></div></section>`;
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
  return `<section class="section"><div class="wrap admin-layout"><div class="side panel"><button data-tab="settings" class="active">League Settings</button><button data-tab="teams">Bulk Teams</button><button data-tab="fixtures">Fixtures + Schedule</button><button data-tab="results">Fast Result Entry</button><button data-tab="photo">Photo Result Upload</button><button onclick="sessionStorage.removeItem('league_admin');location.reload()">Logout</button></div><div class="panel"><div id="adminContent"></div></div></div></section>`;
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
    c.innerHTML = `<h2>Bulk Teams</h2><div id="adminMessage"></div><div class="admin-tools"><div class="tool-card"><h3>Paste teams at once</h3><p class="small">Paste one team per line. Commas also work. Maximum ${settings.teamLimit} teams.</p><textarea id="bulkTeams" rows="12" placeholder="Team 1
Team 2
Team 3
Team 4"></textarea><div class="check-row"><label><input id="replaceTeams" type="checkbox" checked> Replace current teams</label><label><input id="shuffleTeams" type="checkbox" checked> Shuffle before fixture generation</label><label><input id="autoFixtures" type="checkbox" checked> Generate league fixtures after saving teams</label></div><button class="btn" onclick="bulkCreateTeams()">Save Teams</button></div><div class="tool-card"><h3>Single team add</h3><div class="form compact"><input id="teamName" placeholder="Team name"><button class="btn" onclick="addTeam()">Add Team</button></div><hr><p class="small"><b>Current:</b> ${teams.length}/${settings.leagueSize} teams</p><p class="small"><b>Maximum:</b> ${settings.teamLimit} teams</p><p class="small">After adding teams, upload each team logo below. Logos will appear on the Top Scoring Teams page.</p><button class="btn danger" onclick="clearTeamsAndMatches()">Clear Teams + Fixtures</button></div></div><br><h3>Team List + Logos</h3><div class="table-scroll"><table class="table"><tr><th>#</th><th>Logo</th><th>Team</th><th>Action</th></tr>${teams.map((t, i) => `<tr><td>${i + 1}</td><td><div class="admin-logo-cell">${teamLogoHtml(t.name, 'admin-logo-preview')}<input id="logo_${t.id}" class="hidden-file-input" type="file" accept="image/*" onchange="uploadTeamLogo(${t.id}, this)"><label class="btn alt file-picker-btn logo-upload-btn" for="logo_${t.id}">Upload</label>${t.logo ? `<button class="btn danger logo-remove-btn" onclick="removeTeamLogo(${t.id})">Remove</button>` : ''}</div></td><td><input value="${escapeHtml(t.name)}" onchange="updateTeam(${t.id}, this.value)"></td><td><button onclick="deleteTeam(${t.id})">Delete</button></td></tr>`).join('') || '<tr><td colspan="4">No teams yet.</td></tr>'}</table></div>`;
  }

  if (tab === 'fixtures') {
    const roundTables = groupByRound(matches).map(({ round, matches }) => {
      const rows = matches.map((m) => `<tr><td><b>${escapeHtml(m.home)}</b><br><span class="small">vs ${escapeHtml(m.away)}</span></td><td><input id="date_${m.id}" type="date" value="${escapeHtml((m.date && m.date !== 'TBA') ? m.date : '')}"></td><td><input id="time_${m.id}" type="time" value="${escapeHtml((m.time && m.time !== 'TBA') ? m.time : '')}"></td></tr>`).join('');
      return `<h3 class="round-title">${escapeHtml(round)}</h3><div class="table-scroll"><table class="table"><tr><th>Match</th><th>Date</th><th>Time</th></tr>${rows}</table></div>`;
    }).join('');

    c.innerHTML = `<h2>Fixtures + Optional Schedule</h2><div id="adminMessage"></div><div class="admin-actions"><button class="btn" onclick="generateFixtures()">Generate League Fixtures</button><button class="btn alt" onclick="clearFixtureSchedule()">Clear Date/Time Only</button><button class="btn danger" onclick="clearFixtures()">Clear Fixtures</button></div><p class="small">Date and time are optional. Leave them blank if the schedule is not confirmed.</p><div class="tool-card"><h3>Quick schedule apply</h3><p class="small">Apply the same date/time to all fixtures, then adjust individual matches below.</p><div class="form compact"><input id="bulkFixtureDate" type="date"><input id="bulkFixtureTime" type="time"><button class="btn" onclick="applyBulkFixtureSchedule()">Apply to All Fixtures</button></div></div><br>${roundTables || '<div class="card">No fixtures yet. Generate fixtures first.</div>'}<div class="admin-actions"><button class="btn" onclick="saveFixtureSchedule()">Save Fixture Date/Time</button></div>`;
  }

  if (tab === 'results') {
    const rounds = sortedRounds(matches);
    const deadlineRows = rounds.map((round, i) => {
      const saved = (settings.matchweekDeadlines || {})[round] || {};
      return `<tr><td><b>${escapeHtml(round)}</b><br><span class="small">${escapeHtml(roundDeadlineStatus(settings, round))}</span></td><td><input id="mwDeadlineDate_${i}" type="date" value="${escapeHtml(saved.date || '')}"></td><td><input id="mwDeadlineTime_${i}" type="time" value="${escapeHtml(saved.time || '')}"></td></tr>`;
    }).join('');

    c.innerHTML = `<h2>Fast Result Entry</h2><div id="adminMessage"></div><div class="tool-card"><h3>Matchweek result deadlines</h3><p class="small">Set a different result deadline for each matchweek. Public fixtures only appear after a matchweek deadline is set. After the deadline passes, blank results in that matchweek become 0-0. Admin can still edit later.</p><div class="table-scroll"><table class="table"><tr><th>Matchweek</th><th>Deadline Date</th><th>Deadline Time</th></tr>${deadlineRows || '<tr><td colspan="3">Generate fixtures first.</td></tr>'}</table></div><div class="admin-actions"><button class="btn" onclick="saveMatchweekDeadlines()">Save Matchweek Deadlines</button><button class="btn alt" onclick="applyDeadlineDrawsNow()">Apply Due 0-0 Now</button></div></div><br><p class="small">Enter all scores on one screen, then click Save All Results.</p><div class="table-scroll"><table class="table result-table"><tr><th>Round</th><th>Match</th><th>Home</th><th>Away</th><th>Status</th></tr>${matches.map((m) => `<tr><td>${escapeHtml(m.round)}</td><td><b>${escapeHtml(m.home)}</b><br><span class="small">vs ${escapeHtml(m.away)}</span></td><td><input class="score-input" id="hs_${m.id}" type="number" min="0" inputmode="numeric" value="${escapeHtml(m.homeScore)}"></td><td><input class="score-input" id="as_${m.id}" type="number" min="0" inputmode="numeric" value="${escapeHtml(m.awayScore)}"></td><td>${m.autoDrawApplied ? '<span class="tag">Auto 0-0</span>' : '<span class="small">Manual / pending</span>'}</td></tr>`).join('') || '<tr><td colspan="5">No matches yet. Generate fixtures first.</td></tr>'}</table></div><div class="admin-actions"><button class="btn" onclick="saveAllResults()">Save All Results</button><button class="btn alt" onclick="clearAllScores()">Clear All Scores</button></div>`;
  }

  if (tab === 'photo') {
    c.innerHTML = `<h2>Photo Result Upload</h2><div id="adminMessage"></div><p class="small">Upload a clear result screenshot. The website will read the photo, suggest a score, and let admin confirm before saving.</p><div class="tool-card"><h3>Upload result screenshot</h3><p class="small">Step 1: click Choose Result Photo. Step 2: click Read Photo.</p><input id="resultPhoto" class="hidden-file-input" type="file" accept="image/*" onchange="showChosenPhotoName(this)"><div class="admin-actions"><label class="btn alt file-picker-btn" for="resultPhoto">Choose Result Photo</label><button class="btn" onclick="runPhotoOCR()">Read Photo</button></div><p id="chosenPhotoName" class="small">No photo selected yet.</p><p id="photoOcrStatus" class="small"></p></div><br><div id="photoResultPreview" class="card"><p class="small">No photo scanned yet.</p></div>`;
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
  const currentByName = new Map(existingTeams.map((t) => [t.name.toLowerCase(), t]));
  return names.map((name, index) => {
    const existing = currentByName.get(name.toLowerCase());
    return {
      id: preserveIds && existing ? existing.id : Date.now() + index,
      name,
      logo: existing?.logo || ''
    };
  });
}


function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordsFromName(name) {
  return normalizeForMatch(name).split(' ').filter((w) => w.length > 1);
}

function teamAppearsInText(teamName, normalizedText) {
  const words = wordsFromName(teamName);
  if (!words.length) return false;
  if (normalizedText.includes(words.join(' '))) return true;
  const hitCount = words.filter((w) => normalizedText.includes(w)).length;
  return hitCount >= Math.max(1, Math.ceil(words.length * 0.65));
}

function extractScoreCandidates(text) {
  const raw = String(text || '')
    .replace(/[–—−]/g, '-')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 65248));

  const candidates = [];

  function add(homeScore, awayScore, source = '') {
    const h = Number(homeScore);
    const a = Number(awayScore);

    if (!Number.isFinite(h) || !Number.isFinite(a)) return;
    if (h < 0 || a < 0 || h > 30 || a > 30) return;

    candidates.push({
      homeScore: String(h),
      awayScore: String(a),
      label: `${h} - ${a}${source ? ' (' + source + ')' : ''}`
    });
  }

  const standard = /(^|[^\d])(\d{1,2})\s*[-:]\s*(\d{1,2})(?=[^\d]|$)/g;
  let m;
  while ((m = standard.exec(raw)) !== null) add(m[2], m[3], 'detected');

  const logoSeparated = /(^|[^\d])(\d{1,2})\s*(?:e|E|o|O|©|®|€|●|○|\(|\)|\||\/|\\|•|·|_|=|\*)\s*(\d{1,2})(?=[^\d]|$)/g;
  while ((m = logoSeparated.exec(raw)) !== null) add(m[2], m[3], 'logo gap');

  const spaced = /(^|[^\d])(\d{1,2})\s{2,}(\d{1,2})(?=[^\d]|$)/g;
  while ((m = spaced.exec(raw)) !== null) add(m[2], m[3], 'spaced');

  const seen = new Set();
  return candidates.filter((x) => {
    const key = `${x.homeScore}-${x.awayScore}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suggestedMatchesFromText(text) {
  const d = data();
  const normalizedText = normalizeForMatch(text);
  const scored = d.matches.map((m) => ({
    match: m,
    score: (teamAppearsInText(m.home, normalizedText) ? 1 : 0) + (teamAppearsInText(m.away, normalizedText) ? 1 : 0)
  }));
  const strong = scored.filter((x) => x.score === 2).map((x) => x.match);
  if (strong.length) return strong;
  const weak = scored.filter((x) => x.score === 1).map((x) => x.match);
  return weak.length ? weak : d.matches;
}

function renderPhotoPreview(text) {
  const preview = $('#photoResultPreview');
  const scores = extractScoreCandidates(text);
  const matches = suggestedMatchesFromText(text);
  const scoreOptions = scores.length
    ? scores.map((s, i) => `<option value="${i}">${escapeHtml(s.label)}</option>`).join('')
    : '<option value="">No score detected</option>';
  const matchOptions = matches.map((m) => `<option value="${m.id}">${escapeHtml(m.round || 'Match')} — ${escapeHtml(m.home)} vs ${escapeHtml(m.away)}</option>`).join('');
  const firstScore = scores[0] || { homeScore: '', awayScore: '' };

  preview.innerHTML = `<h3>Detected Result Preview</h3><p class="small">Check carefully before saving. OCR can make mistakes.</p><div class="form"><label>Detected match <select id="detectedMatchId">${matchOptions}</select></label><label>Detected score <select id="detectedScoreIndex" onchange="fillManualScoreFromDetected()">${scoreOptions}</select></label><button class="btn" onclick="saveDetectedPhotoResult()">Confirm Save Detected Result</button></div><hr><h3>Manual correction</h3><p class="small">If OCR cannot read the score, type it here and save. This is useful for screenshots where the eFootball logo sits between the two score numbers.</p><div class="form compact"><input id="manualHomeScore" type="number" min="0" placeholder="Home" value="${escapeHtml(firstScore.homeScore)}"><input id="manualAwayScore" type="number" min="0" placeholder="Away" value="${escapeHtml(firstScore.awayScore)}"><button class="btn alt" onclick="saveManualPhotoResult()">Save Manual Score</button></div><details><summary>OCR text</summary><textarea id="ocrTextBox" rows="8">${escapeHtml(text)}</textarea><button class="btn alt" onclick="reparseEditedOCRText()">Re-parse Edited Text</button></details>`;
}

window.showChosenPhotoName = (input) => {
  const box = $('#chosenPhotoName');
  if (!box) return;
  const file = input?.files?.[0];
  box.textContent = file ? `Selected: ${file.name}` : 'No photo selected yet.';
};


window.runPhotoOCR = async () => {
  const input = $('#resultPhoto');
  const status = $('#photoOcrStatus');

  if (!input?.files?.length) return adminMessage('Upload a result photo first.', 'bad');
  if (!window.Tesseract) return adminMessage('OCR library did not load. Check internet connection and refresh.', 'bad');

  status.textContent = 'Reading photo... please wait.';
  $('#photoResultPreview').innerHTML = '<p class="small">Scanning image...</p>';

  try {
    const result = await Tesseract.recognize(input.files[0], 'eng', {
      logger: (m) => {
        if (m.status) {
          const progress = m.progress ? ` ${Math.round(m.progress * 100)}%` : '';
          status.textContent = `${m.status}${progress}`;
        }
      }
    });

    const text = result?.data?.text || '';
    renderPhotoPreview(text);
    const count = extractScoreCandidates(text).length;
    status.textContent = count ? `Detected ${count} score candidate(s). Choose the correct one and confirm.` : 'OCR finished, but no score was detected. Edit OCR text manually or try a clearer screenshot.';
  } catch (error) {
    console.error(error);
    status.textContent = 'OCR failed.';
    $('#photoResultPreview').innerHTML = '<p class="small">Could not read this photo. Try a clearer screenshot.</p>';
    adminMessage('Photo OCR failed. Try a clearer screenshot.', 'bad');
  }
};

window.reparseEditedOCRText = () => {
  renderPhotoPreview($('#ocrTextBox')?.value || '');
};


window.fillManualScoreFromDetected = () => {
  const text = $('#ocrTextBox')?.value || '';
  const scores = extractScoreCandidates(text);
  const index = Number($('#detectedScoreIndex')?.value);

  if (!scores.length || !Number.isFinite(index) || !scores[index]) return;

  const homeBox = $('#manualHomeScore');
  const awayBox = $('#manualAwayScore');

  if (homeBox) homeBox.value = scores[index].homeScore;
  if (awayBox) awayBox.value = scores[index].awayScore;
};

window.saveManualPhotoResult = () => {
  const matchId = Number($('#detectedMatchId')?.value);
  const homeScore = ($('#manualHomeScore')?.value || '').trim();
  const awayScore = ($('#manualAwayScore')?.value || '').trim();

  if (!matchId) return adminMessage('Choose a match first.', 'bad');
  if (homeScore === '' || awayScore === '') return adminMessage('Fill both score boxes first.', 'bad');

  const d = data();
  const match = d.matches.find((m) => Number(m.id) === matchId);
  if (!match) return adminMessage('Selected match was not found.', 'bad');

  match.homeScore = homeScore;
  match.awayScore = awayScore;
  match.autoDrawApplied = false;
  match.autoDrawAppliedAt = '';

  setData({ matches: d.matches });
  adminMessage(`Saved: ${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}`, 'ok');
  showAdminTab('photo');
};


window.saveDetectedPhotoResult = () => {
  const matchId = Number($('#detectedMatchId')?.value);
  const text = $('#ocrTextBox')?.value || '';
  const scores = extractScoreCandidates(text);
  const scoreIndex = Number($('#detectedScoreIndex')?.value);

  if (!matchId) return adminMessage('Choose a match first.', 'bad');
  if (!scores.length || !Number.isFinite(scoreIndex) || !scores[scoreIndex]) {
    return adminMessage('No valid score detected. Edit OCR text or enter result manually.', 'bad');
  }

  const d = data();
  const match = d.matches.find((m) => Number(m.id) === matchId);
  if (!match) return adminMessage('Selected match was not found.', 'bad');

  match.homeScore = scores[scoreIndex].homeScore;
  match.awayScore = scores[scoreIndex].awayScore;
  match.autoDrawApplied = false;
  match.autoDrawAppliedAt = '';

  setData({ matches: d.matches });
  adminMessage(`Saved: ${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}`, 'ok');
  showAdminTab('photo');
};


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
  d.teams.push({ id: Date.now(), name, logo: '' });
  setData({ teams: d.teams });
  showAdminTab('teams');
};

window.updateTeam = (id, value) => {
  const d = data();
  const team = d.teams.find((t) => Number(t.id) === Number(id));
  if (!team) return;
  const oldName = team.name;
  const name = String(value || '').trim();
  if (!name) return;
  d.teams = d.teams.map((t) => (Number(t.id) === Number(id) ? { ...t, name } : t));
  d.matches = d.matches.map((m) => ({
    ...m,
    home: m.home === oldName ? name : m.home,
    away: m.away === oldName ? name : m.away
  }));
  setData({ teams: d.teams, matches: d.matches });
};

window.uploadTeamLogo = (id, input) => {
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return adminMessage('Please choose an image file for the logo.', 'bad');

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 180;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);

      const ratio = Math.max(size / img.width, size / img.height);
      const drawWidth = img.width * ratio;
      const drawHeight = img.height * ratio;
      const x = (size - drawWidth) / 2;
      const y = (size - drawHeight) / 2;
      ctx.drawImage(img, x, y, drawWidth, drawHeight);

      const logo = canvas.toDataURL('image/png');
      const d = data();
      d.teams = d.teams.map((t) => (Number(t.id) === Number(id) ? { ...t, logo } : t));
      setData({ teams: d.teams });
      showAdminTab('teams');
      adminMessage('Team logo uploaded.', 'ok');
    };
    img.onerror = () => adminMessage('Could not read this logo image. Try another image.', 'bad');
    img.src = reader.result;
  };
  reader.onerror = () => adminMessage('Logo upload failed. Try again.', 'bad');
  reader.readAsDataURL(file);
};

window.removeTeamLogo = (id) => {
  const d = data();
  d.teams = d.teams.map((t) => (Number(t.id) === Number(id) ? { ...t, logo: '' } : t));
  setData({ teams: d.teams });
  showAdminTab('teams');
  adminMessage('Team logo removed.', 'ok');
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

window.saveMatchweekDeadlines = () => {
  const d = data();
  const rounds = sortedRounds(d.matches);
  const deadlines = {};

  for (let i = 0; i < rounds.length; i += 1) {
    const round = rounds[i];
    const date = ($(`#mwDeadlineDate_${i}`)?.value || '').trim();
    const time = ($(`#mwDeadlineTime_${i}`)?.value || '').trim();

    if ((date && !time) || (!date && time)) {
      return adminMessage(`Set both date and time for ${round}, or leave both blank.`, 'bad');
    }

    if (date && time) deadlines[round] = { date, time };
  }

  d.settings.matchweekDeadlines = deadlines;
  // Keep old global deadline fields empty so matchweek deadlines control the workflow.
  d.settings.resultDeadlineDate = '';
  d.settings.resultDeadlineTime = '';
  setData({ settings: d.settings });

  const changed = applyResultDeadlineDefaults();
  showAdminTab('results');

  if (changed > 0) adminMessage(`Deadlines saved. ${changed} due blank result(s) were auto-recorded as 0-0.`, 'ok');
  else adminMessage('Matchweek deadlines saved.', 'ok');
};

// Backward-compatible alias. The UI now uses saveMatchweekDeadlines().
window.saveResultDeadline = window.saveMatchweekDeadlines;

window.applyDeadlineDrawsNow = () => {
  const changed = applyResultDeadlineDefaults();
  showAdminTab('results');

  if (changed > 0) adminMessage(`${changed} due blank result(s) were auto-recorded as 0-0.`, 'ok');
  else adminMessage('No due blank results found. Check matchweek deadlines.', 'ok');
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
