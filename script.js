/* =========================================================================
   Football Tournament Manager — script.js
   Single shared script used by BOTH index.html (public site) and
   admin.html (admin dashboard). Pure vanilla JS, no dependencies.

   SECTIONS:
   1. Constants & i18n
   2. Storage layer (LocalStorage)
   3. Data helpers (CRUD, fixtures, calculations)
   4. Utility helpers
   5. Theme + language
   6. Public site rendering (index.html)
   7. Admin dashboard logic (admin.html)
   8. Init / router
   ========================================================================= */

/* ---------------------------------------------------------------------
   1. CONSTANTS & I18N
   --------------------------------------------------------------------- */
const STORAGE_KEY   = 'ftm_tournament_v1';
const THEME_KEY      = 'ftm_theme';
const LANG_KEY        = 'ftm_lang';
const ADMIN_SESSION_KEY = 'ftm_admin_session';

/* ---------------------------------------------------------------------
   FIREBASE SETUP — paste YOUR project's config below.
   Get it from: Firebase Console → Project settings → General →
   "Your apps" → Web app → SDK setup and configuration.
   --------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBs6cxOYgYDY4o0A-7chtnWn9IZy_SYz5s",
  authDomain: "tournament-b8b62.firebaseapp.com",
  databaseURL: "https://tournament-b8b62-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tournament-b8b62",
  storageBucket: "tournament-b8b62.firebasestorage.app",
  messagingSenderId: "654521550525",
  appId: "1:654521550525:web:8b45614c49ed05505e19d4"
};
firebase.initializeApp(firebaseConfig);
const _db = firebase.database();

/* In-memory cache so the rest of the app (which reads data synchronously
   everywhere) doesn't need to change at all. */
let _cache = null;
let _onRemoteChange = null; // set by public/admin pages to re-render on live updates

/** Must be awaited once before the app starts rendering. */
async function initRemoteData(){
  const snap = await _db.ref(STORAGE_KEY).get();
  _cache = snap.exists() ? Object.assign(emptyTournament(), snap.val()) : emptyTournament();
  normalizeClubs(_cache);

  // Live sync: whenever ANYONE saves (e.g. the admin), every open tab/browser
  // gets the update automatically.
  _db.ref(STORAGE_KEY).on('value', (snap) => {
    if(!snap.exists()) return;
    const incoming = Object.assign(emptyTournament(), snap.val());
    normalizeClubs(incoming);
    _cache = incoming;
    if(typeof _onRemoteChange === 'function') _onRemoteChange();
  });
}

/* Simple admin password — change this before deploying! */
const ADMIN_PASSWORD = 'Soheibhm99';

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const I18N = {
  en: {
    dir: 'ltr',
    nav_home: 'Home', nav_groups: 'Groups', nav_knockout: 'Knockout', nav_stats: 'Statistics', nav_champion: 'Champion',
    admin: 'Admin',
    latest_results: 'Latest Results', upcoming_matches: 'Upcoming Matches',
    standings: 'Standings', top_scorers: 'Top Scorers', top_assists: 'Top Assists',
    view_all: 'View all', no_matches: 'No matches yet', no_data: 'No data yet',
    days: 'Days', hours: 'Hours', mins: 'Mins', secs: 'Secs',
    group: 'Group', fixtures: 'Fixtures', played: 'Played', upcoming: 'Upcoming',
    pos: '#', club: 'Club', pl: 'P', w: 'W', d: 'D', l: 'L', gf: 'GF', ga: 'GA', gd: 'GD', pts: 'Pts',
    goals: 'Goals', assists: 'Assists', best_clubs: 'Best Clubs',
    search_clubs: 'Search clubs...', search_players: 'Search players...',
    champion_title: 'Tournament Champion', champion_empty: 'Champion has not been decided yet.',
    footer: 'Built with the Football Tournament Manager — No backend, 100% LocalStorage.',
  },
  ar: {
    dir: 'rtl',
    nav_home: 'الرئيسية', nav_groups: 'المجموعات', nav_knockout: 'الأدوار الإقصائية', nav_stats: 'الإحصائيات', nav_champion: 'البطل',
    admin: 'الإدارة',
    latest_results: 'آخر النتائج', upcoming_matches: 'المباريات القادمة',
    standings: 'الترتيب', top_scorers: 'الهدافون', top_assists: 'صناع الأهداف',
    view_all: 'عرض الكل', no_matches: 'لا توجد مباريات بعد', no_data: 'لا توجد بيانات بعد',
    days: 'أيام', hours: 'ساعات', mins: 'دقائق', secs: 'ثواني',
    group: 'المجموعة', fixtures: 'المباريات', played: 'ملعوبة', upcoming: 'قادمة',
    pos: '#', club: 'النادي', pl: 'لعب', w: 'فاز', d: 'تعادل', l: 'خسر', gf: 'له', ga: 'عليه', gd: 'الفرق', pts: 'نقاط',
    goals: 'الهدافون', assists: 'صناع الأهداف', best_clubs: 'أفضل الأندية',
    search_clubs: 'ابحث عن نادٍ...', search_players: 'ابحث عن لاعب...',
    champion_title: 'بطل البطولة', champion_empty: 'لم يتم تحديد البطل بعد.',
    footer: 'صُنع بواسطة مدير بطولات كرة القدم — بدون سيرفر، تخزين محلي بالكامل.',
  }
};

function t(key){
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

/* ---------------------------------------------------------------------
   2. STORAGE LAYER
   --------------------------------------------------------------------- */
function emptyTournament(){
  return {
    name: '', banner: '', startDate: '', numGroups: 0,
    champion: null,
    groups: [],   // {id, name}
    clubs: [],    // {id, name, logo, groupId, players:[{id,name,number}]}
    matches: [],  // {id, groupId, homeClubId, awayClubId, leg, date, played, homeScore, awayScore, goals:[{clubId, playerName, minute, assistName}]}
    knockoutRounds: [],   // {id, name}  — ordered list, earlier rounds feed later ones
    knockoutMatches: [],  // {id, roundId, homeSource, awaySource, date, played, homeScore, awayScore, homePen, awayPen, goals:[]}
    idCounter: 1
  };
}

function loadData(){
  // Synchronous read from the in-memory cache (kept up to date by Firebase).
  // initRemoteData() populates this before the app first renders.
  return _cache || emptyTournament();
}

/** Ensures every club has a players[] array (for data created before squads existed). */
function normalizeClubs(data){
  (data.clubs || []).forEach(c => { if(!Array.isArray(c.players)) c.players = []; });
}

function saveData(data){
  _cache = data;
  // Fire-and-forget write to Firebase so every other browser sees it too.
  _db.ref(STORAGE_KEY).set(data).catch(e => console.error('Failed to save tournament data', e));
}

function resetData(){
  _cache = emptyTournament();
  _db.ref(STORAGE_KEY).set(_cache).catch(e => console.error('Failed to reset tournament data', e));
}

function nextId(data, prefix){
  const id = prefix + (data.idCounter || 1);
  data.idCounter = (data.idCounter || 1) + 1;
  return id;
}

function exportDataFile(){
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (data.name ? data.name.replace(/\s+/g,'_') : 'tournament') + '_export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importDataFromText(text){
  const parsed = JSON.parse(text);
  const data = Object.assign(emptyTournament(), parsed);
  normalizeClubs(data);
  saveData(data);
  return data;
}

/* ---------------------------------------------------------------------
   3. DATA HELPERS (tournament / clubs / fixtures / results / stats)
   --------------------------------------------------------------------- */

/** Create or update the tournament's core info + regenerate group list. */
function setupTournament(data, {name, banner, startDate, numGroups}){
  data.name = name;
  if(banner) data.banner = banner;
  data.startDate = startDate;
  numGroups = Math.max(0, parseInt(numGroups, 10) || 0);
  data.numGroups = numGroups;

  const newGroups = [];
  for(let i=0;i<numGroups;i++){
    const existing = data.groups[i];
    newGroups.push(existing || {id: nextId(data,'g'), name: 'Group ' + GROUP_LETTERS[i % GROUP_LETTERS.length]});
  }
  // Any groups removed: strip clubs/matches that pointed to them
  const keptIds = new Set(newGroups.map(g=>g.id));
  data.clubs.forEach(c=>{ if(c.groupId && !keptIds.has(c.groupId)) c.groupId = null; });
  data.matches = data.matches.filter(m => keptIds.has(m.groupId));
  data.groups = newGroups;
  saveData(data);
  return data;
}

function getGroupClubs(data, groupId){
  return data.clubs.filter(c => c.groupId === groupId);
}

function addClub(data, {name, logo, groupId}){
  const club = {id: nextId(data,'c'), name: name.trim(), logo: logo || '', groupId: groupId || null, players: []};
  data.clubs.push(club);
  saveData(data);
  return club;
}

/* ---------- Players (squad registration per club) ---------- */
function getClubPlayers(data, clubId){
  const club = data.clubs.find(c=>c.id===clubId);
  return club ? (club.players || []) : [];
}

function addPlayer(data, clubId, {name, number}){
  const club = data.clubs.find(c=>c.id===clubId);
  if(!club) return null;
  if(!club.players) club.players = [];
  const player = {id: nextId(data,'p'), name: name.trim(), number: number || ''};
  club.players.push(player);
  saveData(data);
  return player;
}

function deletePlayer(data, clubId, playerId){
  const club = data.clubs.find(c=>c.id===clubId);
  if(!club) return;
  club.players = (club.players||[]).filter(p=>p.id!==playerId);
  saveData(data);
}

function editClub(data, id, fields){
  const club = data.clubs.find(c=>c.id===id);
  if(!club) return;
  Object.assign(club, fields);
  saveData(data);
}

function deleteClub(data, id){
  data.clubs = data.clubs.filter(c=>c.id!==id);
  data.matches = data.matches.filter(m=> m.homeClubId!==id && m.awayClubId!==id);
  if(data.champion === id) data.champion = null;
  saveData(data);
}

function getClub(data, id){
  return data.clubs.find(c=>c.id===id) || {name:'—', logo:''};
}

/** Round-robin fixture generation for a single group.
 *  legs=1 → single round-robin (each pair plays once)
 *  legs=2 → double round-robin (each pair plays home AND away) — the default,
 *           matching a normal league group stage. */
function generateFixturesForGroup(data, groupId, legs){
  legs = legs === 1 ? 1 : 2;
  const clubs = getGroupClubs(data, groupId);
  // wipe existing matches for this group and regenerate fresh
  data.matches = data.matches.filter(m=>m.groupId!==groupId);
  if(clubs.length < 2) { saveData(data); return; }
  for(let i=0;i<clubs.length;i++){
    for(let j=i+1;j<clubs.length;j++){
      data.matches.push({
        id: nextId(data,'m'),
        groupId,
        homeClubId: clubs[i].id,
        awayClubId: clubs[j].id,
        leg: 1,
        date: '',
        played: false,
        homeScore: null,
        awayScore: null,
        goals: []
      });
      if(legs === 2){
        data.matches.push({
          id: nextId(data,'m'),
          groupId,
          homeClubId: clubs[j].id,
          awayClubId: clubs[i].id,
          leg: 2,
          date: '',
          played: false,
          homeScore: null,
          awayScore: null,
          goals: []
        });
      }
    }
  }
  saveData(data);
}

function generateAllFixtures(data, legs){
  data.groups.forEach(g => generateFixturesForGroup(data, g.id, legs));
}

/** Manually add a single extra match — any two clubs, any (or no) group.
 *  Gives the admin full control to patch fixtures beyond the auto-generator. */
function addManualMatch(data, {groupId, homeClubId, awayClubId, date}){
  const match = {
    id: nextId(data,'m'), groupId: groupId || null,
    homeClubId, awayClubId, leg:1, date: date||'',
    played:false, homeScore:null, awayScore:null, goals:[]
  };
  data.matches.push(match);
  saveData(data);
  return match;
}

/** Reassigns the two clubs playing in an existing match (fixture correction). */
function updateMatchTeams(data, matchId, {homeClubId, awayClubId}){
  const m = data.matches.find(x=>x.id===matchId);
  if(!m) return;
  m.homeClubId = homeClubId;
  m.awayClubId = awayClubId;
  saveData(data);
}

function renameGroup(data, groupId, name){
  const g = data.groups.find(x=>x.id===groupId);
  if(!g) return;
  g.name = name.trim() || g.name;
  saveData(data);
}

/* ------------------------------------------------------------------
   KNOCKOUT BRACKET ENGINE
   A knockout match's home/away side is a "source" string, one of:
     "club:<clubId>"        — a specific, manually chosen club
     "group:<groupId>:<rank>" — e.g. the 1st or 2nd place club of a group
     "winner:<matchId>"     — winner of an earlier knockout match
     "loser:<matchId>"      — loser of an earlier knockout match
   This lets the bracket auto-fill itself as results come in, while still
   letting the admin hard-set any side manually at any time.
   ------------------------------------------------------------------ */

function addKnockoutRound(data, name){
  const round = {id: nextId(data,'kr'), name: name.trim() || 'Round'};
  data.knockoutRounds.push(round);
  saveData(data);
  return round;
}

function deleteKnockoutRound(data, roundId){
  data.knockoutRounds = data.knockoutRounds.filter(r=>r.id!==roundId);
  data.knockoutMatches = data.knockoutMatches.filter(m=>m.roundId!==roundId);
  saveData(data);
}

function renameKnockoutRound(data, roundId, name){
  const r = data.knockoutRounds.find(x=>x.id===roundId);
  if(!r) return;
  r.name = name.trim() || r.name;
  saveData(data);
}

function addKnockoutMatch(data, {roundId, homeSource, awaySource, date}){
  const match = {
    id: nextId(data,'km'), roundId, homeSource, awaySource,
    date: date||'', played:false, homeScore:null, awayScore:null,
    homePen:null, awayPen:null, goals:[]
  };
  data.knockoutMatches.push(match);
  saveData(data);
  return match;
}

function deleteKnockoutMatch(data, matchId){
  data.knockoutMatches = data.knockoutMatches.filter(m=>m.id!==matchId);
  saveData(data);
}

function updateKnockoutMatchSources(data, matchId, {homeSource, awaySource}){
  const m = data.knockoutMatches.find(x=>x.id===matchId);
  if(!m) return;
  m.homeSource = homeSource;
  m.awaySource = awaySource;
  saveData(data);
}

function saveKnockoutResult(data, matchId, {homeScore, awayScore, homePen, awayPen, date, goals}){
  const m = data.knockoutMatches.find(x=>x.id===matchId);
  if(!m) return;
  m.homeScore = homeScore; m.awayScore = awayScore;
  m.homePen = (homePen===''||homePen==null) ? null : homePen;
  m.awayPen = (awayPen===''||awayPen==null) ? null : awayPen;
  m.played = true;
  if(date) m.date = date;
  m.goals = goals || [];
  saveData(data);
}

function clearKnockoutResult(data, matchId){
  const m = data.knockoutMatches.find(x=>x.id===matchId);
  if(!m) return;
  m.played=false; m.homeScore=null; m.awayScore=null; m.homePen=null; m.awayPen=null; m.goals=[];
  saveData(data);
}

/** Resolves a source string down to an actual club, or null if not decided yet. */
function resolveKnockoutSource(data, source, visited){
  visited = visited || new Set();
  if(!source) return null;
  const parts = source.split(':');
  const type = parts[0];
  if(type === 'club'){
    return data.clubs.find(c=>c.id===parts[1]) || null;
  }
  if(type === 'group'){
    const groupId = parts[1], rank = parseInt(parts[2],10);
    const standings = computeStandings(data, groupId);
    const row = standings[rank-1];
    return row ? row.club : null;
  }
  if(type === 'winner' || type === 'loser'){
    const matchId = parts[1];
    if(visited.has(matchId)) return null; // safety net against accidental cycles
    visited.add(matchId);
    const km = data.knockoutMatches.find(x=>x.id===matchId);
    if(!km || !km.played) return null;
    let homeWon;
    if(km.homeScore === km.awayScore){
      if(km.homePen == null || km.awayPen == null || km.homePen === km.awayPen) return null; // decider not entered yet
      homeWon = km.homePen > km.awayPen;
    } else {
      homeWon = km.homeScore > km.awayScore;
    }
    const wantHomeSide = type === 'winner' ? homeWon : !homeWon;
    return resolveKnockoutSource(data, wantHomeSide ? km.homeSource : km.awaySource, visited);
  }
  return null;
}

const ORDINALS = {1:'1st',2:'2nd',3:'3rd',4:'4th',5:'5th',6:'6th',7:'7th',8:'8th'};

/** Human-readable placeholder label for a source, used while it's still undecided. */
function knockoutSourceLabel(data, source){
  if(!source) return 'TBD';
  const parts = source.split(':');
  const type = parts[0];
  if(type === 'club'){ const c = data.clubs.find(x=>x.id===parts[1]); return c ? c.name : 'TBD'; }
  if(type === 'group'){
    const g = data.groups.find(x=>x.id===parts[1]);
    const rank = parseInt(parts[2],10);
    return (ORDINALS[rank]||rank+'th') + ' — ' + (g ? g.name : '?');
  }
  if(type === 'winner') return 'Winner: ' + knockoutMatchLabel(data, parts[1]);
  if(type === 'loser')  return 'Loser: ' + knockoutMatchLabel(data, parts[1]);
  return 'TBD';
}

function knockoutMatchLabel(data, matchId){
  const km = data.knockoutMatches.find(x=>x.id===matchId);
  if(!km) return '?';
  const h = resolveKnockoutSource(data, km.homeSource) || {name: knockoutSourceLabel(data, km.homeSource)};
  const a = resolveKnockoutSource(data, km.awaySource) || {name: knockoutSourceLabel(data, km.awaySource)};
  return `${h.name} vs ${a.name}`;
}

/** Quick-setup: pairs up groups two at a time — 1st of group i vs 2nd of group i+1,
 *  and 1st of group i+1 vs 2nd of group i — the classic cross-group knockout draw. */
function generateCrossKnockout(data, roundName){
  if(data.groups.length < 2 || data.groups.length % 2 !== 0) return null;
  const round = addKnockoutRound(data, roundName || 'Knockout Stage');
  for(let i=0;i<data.groups.length;i+=2){
    const gA = data.groups[i], gB = data.groups[i+1];
    addKnockoutMatch(data, {roundId: round.id, homeSource:`group:${gA.id}:1`, awaySource:`group:${gB.id}:2`});
    addKnockoutMatch(data, {roundId: round.id, homeSource:`group:${gB.id}:1`, awaySource:`group:${gA.id}:2`});
  }
  return round;
}

/** Generic bracket progression: pairs up the winners of an existing round's matches
 *  (in order, 1v2, 3v4, ...) into a brand-new next round. Works for any round size. */
function generateNextKnockoutRound(data, sourceRoundId, newRoundName){
  const sourceMatches = data.knockoutMatches.filter(m=>m.roundId===sourceRoundId);
  if(sourceMatches.length < 2) return null;
  const round = addKnockoutRound(data, newRoundName || 'Next Round');
  for(let i=0;i+1<sourceMatches.length;i+=2){
    addKnockoutMatch(data, {roundId: round.id, homeSource:`winner:${sourceMatches[i].id}`, awaySource:`winner:${sourceMatches[i+1].id}`});
  }
  return round;
}

function saveMatchResult(data, matchId, {homeScore, awayScore, date, goals}){
  const m = data.matches.find(x=>x.id===matchId);
  if(!m) return;
  m.homeScore = homeScore;
  m.awayScore = awayScore;
  m.played = true;
  if(date) m.date = date;
  m.goals = goals || [];
  saveData(data);
}

function clearMatchResult(data, matchId){
  const m = data.matches.find(x=>x.id===matchId);
  if(!m) return;
  m.played = false; m.homeScore = null; m.awayScore = null; m.goals = [];
  saveData(data);
}

function deleteMatch(data, matchId){
  data.matches = data.matches.filter(m=>m.id!==matchId);
  saveData(data);
}

/** Compute standings table for one group, sorted by points/GD/GF. */
function computeStandings(data, groupId){
  const clubs = getGroupClubs(data, groupId);
  const table = clubs.map(c => ({club:c, played:0, win:0, draw:0, loss:0, gf:0, ga:0, gd:0, pts:0}));
  const byId = {}; table.forEach(row => byId[row.club.id] = row);

  data.matches.filter(m => m.groupId===groupId && m.played).forEach(m => {
    const h = byId[m.homeClubId], a = byId[m.awayClubId];
    if(!h || !a) return;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if(m.homeScore > m.awayScore){ h.win++; h.pts+=3; a.loss++; }
    else if(m.homeScore < m.awayScore){ a.win++; a.pts+=3; h.loss++; }
    else { h.draw++; a.draw++; h.pts+=1; a.pts+=1; }
  });
  table.forEach(row => row.gd = row.gf - row.ga);
  table.sort((x,y) => y.pts-x.pts || y.gd-x.gd || y.gf-x.gf || x.club.name.localeCompare(y.club.name));
  return table;
}

function computeAllStandings(data){
  const out = {};
  data.groups.forEach(g => out[g.id] = computeStandings(data, g.id));
  return out;
}

function computeBestClubs(data){
  let all = [];
  data.groups.forEach(g => { all = all.concat(computeStandings(data, g.id).map(r => ({...r, groupName:g.name}))); });
  return all.sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
}

function computeTopScorers(data, limit){
  const map = {};
  data.matches.forEach(m => {
    (m.goals||[]).forEach(g => {
      if(!g.playerName) return;
      const key = g.playerName.trim().toLowerCase() + '|' + g.clubId;
      if(!map[key]) map[key] = {playerName:g.playerName.trim(), clubId:g.clubId, goals:0};
      map[key].goals++;
    });
  });
  const arr = Object.values(map).sort((a,b)=>b.goals-a.goals);
  return limit ? arr.slice(0, limit) : arr;
}

function computeTopAssists(data, limit){
  const map = {};
  data.matches.forEach(m => {
    (m.goals||[]).forEach(g => {
      if(!g.assistName) return;
      const key = g.assistName.trim().toLowerCase() + '|' + g.clubId;
      if(!map[key]) map[key] = {playerName:g.assistName.trim(), clubId:g.clubId, assists:0};
      map[key].assists++;
    });
  });
  const arr = Object.values(map).sort((a,b)=>b.assists-a.assists);
  return limit ? arr.slice(0, limit) : arr;
}

/* ---------------------------------------------------------------------
   4. UTILITY HELPERS
   --------------------------------------------------------------------- */
function escapeHtml(str){
  return String(str==null?'':str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return iso;
  return d.toLocaleString(getLang()==='ar' ? 'ar-EG' : 'en-GB', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    if(!file){ resolve(''); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clubLogoOrPlaceholder(logo){
  return logo ? logo : 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23167a45"/><text x="50%" y="56%" font-size="18" text-anchor="middle" fill="white" font-family="sans-serif">⚽</text></svg>'
  );
}

function toast(msg){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(()=> el.classList.remove('show'), 2400);
}

function byId(id){ return document.getElementById(id); }

/* ---------------------------------------------------------------------
   5. THEME + LANGUAGE
   --------------------------------------------------------------------- */
function getTheme(){ return localStorage.getItem(THEME_KEY) || 'light'; }
function setTheme(theme){
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
  const btn = byId('themeToggle');
  if(btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme(){ setTheme(getTheme()==='dark' ? 'light' : 'dark'); }

function getLang(){ return localStorage.getItem(LANG_KEY) || 'en'; }
function setLang(lang){
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', I18N[lang].dir);
  const btn = byId('langToggle');
  if(btn) btn.textContent = lang === 'ar' ? 'EN' : 'AR';
  applyTranslations();
}
function toggleLang(){ setLang(getLang()==='ar' ? 'en' : 'ar'); }

function applyTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  // re-render current page content so dynamic text (dates, table headers) updates too
  if(document.body.dataset.page === 'public') renderPublicApp();
  if(document.body.dataset.page === 'admin') renderAdminIfLoggedIn();
}

function initThemeLang(){
  setTheme(getTheme());
  setLang(getLang());
  const themeBtn = byId('themeToggle');
  if(themeBtn) themeBtn.addEventListener('click', toggleTheme);
  const langBtn = byId('langToggle');
  if(langBtn) langBtn.addEventListener('click', toggleLang);
}

/* =========================================================================
   6. PUBLIC SITE RENDERING (index.html)
   ========================================================================= */
let countdownTimer = null;

function renderPublicApp(){
  const data = loadData();
  renderNavActive();
  const route = (location.hash || '#home').replace('#','');
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  const target = byId('page-' + route) || byId('page-home');
  target.classList.remove('hidden');

  if(route === 'home' || !byId('page-'+route)) renderHome(data);
  if(route === 'groups') renderGroupsPage(data);
  if(route === 'knockout') renderKnockoutPage(data);
  if(route === 'stats') renderStatsPage(data);
  if(route === 'champion') renderChampionPage(data);
}

function renderNavActive(){
  const route = (location.hash || '#home');
  document.querySelectorAll('.nav-links a').forEach(a=>{
    a.classList.toggle('active', a.getAttribute('href') === route);
  });
}

function renderHome(data){
  // Hero
  byId('heroName').textContent = data.name || 'Football Tournament';
  const bannerImg = byId('heroBanner');
  bannerImg.src = data.banner || 'images/tournament-logo.jpg';
  bannerImg.classList.remove('hidden');

  startCountdown(data);

  // Latest results (played, most recent by id)
  const played = data.matches.filter(m=>m.played).slice().reverse().slice(0,4);
  byId('latestResults').innerHTML = played.length ? played.map(m=>matchCardHtml(data,m)).join('') : emptyHtml(t('no_matches'));

  // Upcoming matches
  const upcoming = data.matches.filter(m=>!m.played).slice(0,4);
  byId('upcomingMatches').innerHTML = upcoming.length ? upcoming.map(m=>matchCardHtml(data,m)).join('') : emptyHtml(t('no_matches'));

  // Standings preview: show each group's mini table
  const allStandings = computeAllStandings(data);
  const groupsHtml = data.groups.map(g => standingsTableHtml(g, allStandings[g.id])).join('');
  byId('homeStandings').innerHTML = groupsHtml || emptyHtml(t('no_data'));

  // Top scorers / assists (top 5)
  byId('homeScorers').innerHTML = statListHtml(data, computeTopScorers(data,5), 'goals');
  byId('homeAssists').innerHTML = statListHtml(data, computeTopAssists(data,5), 'assists');
}

function startCountdown(data){
  clearInterval(countdownTimer);
  const box = byId('countdown');
  if(!box) return;
  // countdown targets the next upcoming match date, else the tournament start date
  const upcomingWithDate = data.matches.filter(m=>!m.played && m.date).sort((a,b)=> new Date(a.date)-new Date(b.date));
  const targetIso = upcomingWithDate.length ? upcomingWithDate[0].date : data.startDate;
  if(!targetIso){ box.innerHTML = ''; return; }
  const target = new Date(targetIso).getTime();
  if(isNaN(target)){ box.innerHTML=''; return; }

  function tick(){
    const diff = target - Date.now();
    if(diff <= 0){ box.innerHTML = ''; clearInterval(countdownTimer); return; }
    const d = Math.floor(diff/86400000);
    const h = Math.floor(diff%86400000/3600000);
    const m = Math.floor(diff%3600000/60000);
    const s = Math.floor(diff%60000/1000);
    box.innerHTML = `
      <div class="box"><span class="num">${d}</span><span class="lbl">${t('days')}</span></div>
      <div class="box"><span class="num">${h}</span><span class="lbl">${t('hours')}</span></div>
      <div class="box"><span class="num">${m}</span><span class="lbl">${t('mins')}</span></div>
      <div class="box"><span class="num">${s}</span><span class="lbl">${t('secs')}</span></div>`;
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function matchCardHtml(data, m){
  const home = getClub(data, m.homeClubId), away = getClub(data, m.awayClubId);
  const group = data.groups.find(g=>g.id===m.groupId);
  const scoreHtml = m.played ? `${m.homeScore} - ${m.awayScore}` : '—';
  const goalsHtml = m.played && m.goals && m.goals.length
    ? `<div class="goal-list">${m.goals.map(g=>{
        const club = getClub(data,g.clubId);
        return `<div>⚽ ${escapeHtml(g.playerName)} (${escapeHtml(club.name)})${g.minute?` — ${escapeHtml(g.minute)}'`:''}${g.assistName?` <span class="text-dim">· 🅰️ ${escapeHtml(g.assistName)}</span>`:''}</div>`;
      }).join('')}</div>` : '';
  return `
    <div class="match-card fade-in">
      <div class="meta">
        <span>${group ? escapeHtml(group.name) : ''}</span>
        <span class="badge ${m.played?'played':'upcoming'}">${m.played?t('played'):t('upcoming')}</span>
      </div>
      <div class="match-teams">
        <div class="match-team"><img src="${clubLogoOrPlaceholder(home.logo)}" alt=""><span>${escapeHtml(home.name)}</span></div>
        <div class="match-score ${!m.played?'live':''}">${scoreHtml}</div>
        <div class="match-team right"><img src="${clubLogoOrPlaceholder(away.logo)}" alt=""><span>${escapeHtml(away.name)}</span></div>
      </div>
      ${m.date ? `<div class="meta"><span>📅 ${fmtDate(m.date)}</span><span></span></div>` : ''}
      ${goalsHtml}
    </div>`;
}

function emptyHtml(msg){
  return `<div class="empty"><div class="big">⚽</div><p>${escapeHtml(msg)}</p></div>`;
}

function standingsTableHtml(group, rows){
  const body = rows.length ? rows.map((r,i)=>`
    <tr class="${i<2?'qualify':''}">
      <td class="rank-cell">${i+1}</td>
      <td><div class="team-cell"><img src="${clubLogoOrPlaceholder(r.club.logo)}" alt="">${escapeHtml(r.club.name)}</div></td>
      <td>${r.played}</td><td>${r.win}</td><td>${r.draw}</td><td>${r.loss}</td>
      <td>${r.gf}</td><td>${r.ga}</td><td>${r.gd}</td>
      <td class="pts-cell">${r.pts}</td>
    </tr>`).join('') : `<tr><td colspan="10">${t('no_data')}</td></tr>`;
  return `
    <div class="card mb-16">
      <h3 style="margin-bottom:10px">${escapeHtml(group.name)}</h3>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${t('pos')}</th><th>${t('club')}</th><th>${t('pl')}</th><th>${t('w')}</th><th>${t('d')}</th><th>${t('l')}</th>
            <th>${t('gf')}</th><th>${t('ga')}</th><th>${t('gd')}</th><th>${t('pts')}</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}

function statListHtml(data, rows, mode){
  if(!rows.length) return emptyHtml(t('no_data'));
  return rows.map((r,i)=>{
    const club = getClub(data, r.clubId);
    const value = mode==='goals' ? r.goals : r.assists;
    return `
      <div class="stat-row">
        <div class="stat-rank">${i+1}</div>
        <img src="${clubLogoOrPlaceholder(club.logo)}" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;">
        <div class="stat-player"><div class="name">${escapeHtml(r.playerName)}</div><div class="club">${escapeHtml(club.name)}</div></div>
        <div class="stat-value">${value}</div>
      </div>`;
  }).join('');
}

/* ---------------- Groups page ---------------- */
function renderGroupsPage(data){
  const wrap = byId('groupsContent');
  if(!data.groups.length){ wrap.innerHTML = emptyHtml(t('no_data')); return; }
  const allStandings = computeAllStandings(data);

  const tabsHtml = data.groups.map((g,i)=>`<button class="tab-btn ${i===0?'active':''}" data-group="${g.id}">${escapeHtml(g.name)}</button>`).join('');

  wrap.innerHTML = `
    <div class="search-bar"><span>🔍</span><input id="clubSearch" data-i18n-placeholder="search_clubs" placeholder="${t('search_clubs')}"></div>
    <div id="allClubsChips" class="flex gap-8" style="flex-wrap:wrap;margin-bottom:24px;"></div>
    <div class="tabs" id="groupTabs">${tabsHtml}</div>
    <div id="groupPanels"></div>`;

  // club chips (searchable list of all clubs across tournament)
  function renderChips(filter){
    const list = data.clubs.filter(c => c.name.toLowerCase().includes((filter||'').toLowerCase()));
    byId('allClubsChips').innerHTML = list.length ? list.map(c=>{
      const g = data.groups.find(gr=>gr.id===c.groupId);
      return `<div class="club-chip"><img src="${clubLogoOrPlaceholder(c.logo)}" alt="">${escapeHtml(c.name)}${g?` <span class="text-dim">· ${escapeHtml(g.name)}</span>`:''}</div>`;
    }).join('') : `<span class="text-dim">${t('no_data')}</span>`;
  }
  renderChips('');
  byId('clubSearch').addEventListener('input', e => renderChips(e.target.value));

  function renderGroupPanel(groupId){
    const group = data.groups.find(g=>g.id===groupId);
    const rows = allStandings[groupId] || [];
    const fixtures = data.matches.filter(m=>m.groupId===groupId);
    byId('groupPanels').innerHTML = `
      ${standingsTableHtml(group, rows)}
      <h3 class="mt-16 mb-16">${t('fixtures')}</h3>
      <div class="grid grid-2">${fixtures.length ? fixtures.map(m=>matchCardHtml(data,m)).join('') : emptyHtml(t('no_matches'))}</div>
    `;
  }
  document.querySelectorAll('#groupTabs .tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#groupTabs .tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderGroupPanel(btn.dataset.group);
    });
  });
  if(data.groups[0]) renderGroupPanel(data.groups[0].id);
}

/* ---------------- Knockout page (public, read-only bracket view) ---------------- */
function knockoutPublicMatchCardHtml(data, m){
  const home = resolveKnockoutSource(data, m.homeSource);
  const away = resolveKnockoutSource(data, m.awaySource);
  const homeName = home ? home.name : knockoutSourceLabel(data, m.homeSource);
  const awayName = away ? away.name : knockoutSourceLabel(data, m.awaySource);
  const homeLogo = clubLogoOrPlaceholder(home ? home.logo : '');
  const awayLogo = clubLogoOrPlaceholder(away ? away.logo : '');
  const scoreHtml = m.played
    ? `${m.homeScore} - ${m.awayScore}` + (m.homePen!=null && m.awayPen!=null ? `<div style="font-size:.65rem;font-weight:600;">(pen ${m.homePen}-${m.awayPen})</div>` : '')
    : '—';
  const goalsHtml = m.played && m.goals && m.goals.length
    ? `<div class="goal-list">${m.goals.map(g=>{
        const club = getClub(data,g.clubId);
        return `<div>⚽ ${escapeHtml(g.playerName)} (${escapeHtml(club.name)})${g.minute?` — ${escapeHtml(g.minute)}'`:''}${g.assistName?` <span class="text-dim">· 🅰️ ${escapeHtml(g.assistName)}</span>`:''}</div>`;
      }).join('')}</div>` : '';
  return `
    <div class="match-card fade-in">
      <div class="meta">
        <span></span>
        <span class="badge ${m.played?'played':'upcoming'}">${m.played?t('played'):t('upcoming')}</span>
      </div>
      <div class="match-teams">
        <div class="match-team"><img src="${homeLogo}" alt=""><span>${escapeHtml(homeName)}</span></div>
        <div class="match-score ${!m.played?'live':''}">${scoreHtml}</div>
        <div class="match-team right"><img src="${awayLogo}" alt=""><span>${escapeHtml(awayName)}</span></div>
      </div>
      ${m.date ? `<div class="meta"><span>📅 ${fmtDate(m.date)}</span><span></span></div>` : ''}
      ${goalsHtml}
    </div>`;
}

function renderKnockoutPage(data){
  const wrap = byId('knockoutContent');
  if(!data.knockoutRounds.length){ wrap.innerHTML = emptyHtml(t('no_data')); return; }
  wrap.innerHTML = data.knockoutRounds.map(r=>{
    const matches = data.knockoutMatches.filter(m=>m.roundId===r.id);
    return `
      <div class="mb-16">
        <h3 class="mb-16">${escapeHtml(r.name)}</h3>
        <div class="grid grid-2">${matches.length ? matches.map(m=>knockoutPublicMatchCardHtml(data,m)).join('') : emptyHtml(t('no_matches'))}</div>
      </div>`;
  }).join('');
}


function renderStatsPage(data){
  const scorers = computeTopScorers(data);
  const assists = computeTopAssists(data);
  const clubs = computeBestClubs(data);

  const wrap = byId('statsContent');
  wrap.innerHTML = `
    <div class="search-bar"><span>🔍</span><input id="playerSearch" data-i18n-placeholder="search_players" placeholder="${t('search_players')}"></div>
    <div class="grid grid-2">
      <div class="card">
        <div class="section-head"><h2><span class="tag"></span>${t('top_scorers')}</h2></div>
        <div id="statScorers"></div>
      </div>
      <div class="card">
        <div class="section-head"><h2><span class="tag"></span>${t('top_assists')}</h2></div>
        <div id="statAssists"></div>
      </div>
    </div>
    <div class="card mt-16">
      <div class="section-head"><h2><span class="tag"></span>${t('best_clubs')}</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>${t('pos')}</th><th>${t('club')}</th><th>${t('group')}</th><th>${t('pl')}</th><th>${t('pts')}</th><th>${t('gd')}</th></tr></thead>
          <tbody id="bestClubsBody"></tbody>
        </table>
      </div>
    </div>`;

  function apply(filter){
    const f = (filter||'').toLowerCase();
    byId('statScorers').innerHTML = statListHtml(data, scorers.filter(r=>r.playerName.toLowerCase().includes(f)), 'goals');
    byId('statAssists').innerHTML = statListHtml(data, assists.filter(r=>r.playerName.toLowerCase().includes(f)), 'assists');
  }
  apply('');
  byId('playerSearch').addEventListener('input', e=>apply(e.target.value));

  byId('bestClubsBody').innerHTML = clubs.length ? clubs.map((r,i)=>`
    <tr>
      <td class="rank-cell">${i+1}</td>
      <td><div class="team-cell"><img src="${clubLogoOrPlaceholder(r.club.logo)}" alt="">${escapeHtml(r.club.name)}</div></td>
      <td>${escapeHtml(r.groupName)}</td>
      <td>${r.played}</td><td class="pts-cell">${r.pts}</td><td>${r.gd}</td>
    </tr>`).join('') : `<tr><td colspan="6">${t('no_data')}</td></tr>`;
}

/* ---------------- Champion page ---------------- */
function renderChampionPage(data){
  const wrap = byId('championContent');
  const champ = data.champion ? getClub(data, data.champion) : null;
  wrap.innerHTML = champ ? `
    <div class="champion-box fade-in">
      <div class="trophy">🏆</div>
      <img src="${clubLogoOrPlaceholder(champ.logo)}" alt="">
      <div class="text-dim" style="color:#dff5e6;">${t('champion_title')}</div>
      <h2>${escapeHtml(champ.name)}</h2>
    </div>` : emptyHtml(t('champion_empty'));
}

/* =========================================================================
   7. ADMIN DASHBOARD LOGIC (admin.html)
   ========================================================================= */
function isAdminLoggedIn(){ return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; }

function initAdminLogin(){
  const form = byId('loginForm');
  if(!form) return;
  if(isAdminLoggedIn()) showAdminDashboard();

  form.addEventListener('submit', e=>{
    e.preventDefault();
    const pass = byId('adminPassword').value;
    if(pass === ADMIN_PASSWORD){
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      showAdminDashboard();
    } else {
      byId('loginError').textContent = getLang()==='ar' ? 'كلمة مرور خاطئة' : 'Incorrect password';
    }
  });

  const logoutBtn = byId('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', ()=>{
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    location.reload();
  });
}

function showAdminDashboard(){
  byId('loginScreen').classList.add('hidden');
  byId('dashboard').classList.remove('hidden');
  renderAdminDashboard();
}

function renderAdminIfLoggedIn(){
  if(isAdminLoggedIn() && byId('dashboard') && !byId('dashboard').classList.contains('hidden')){
    renderAdminDashboard();
  }
}

let adminActiveTab = 'setup';

function renderAdminDashboard(){
  const data = loadData();
  renderAdminTabs(data);
  renderSetupTab(data);
  renderClubsTab(data);
  renderFixturesTab(data);
  renderMatchesTab(data);
  renderKnockoutTab(data);
  renderChampionTab(data);
  renderDataTab(data);
}

function renderAdminTabs(){
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.tab === adminActiveTab);
    btn.onclick = ()=>{
      adminActiveTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.classList.toggle('active', b===btn));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-'+btn.dataset.tab));
    };
  });
}

/* ---------- Tab: Tournament setup ---------- */
function renderSetupTab(data){
  byId('setupName').value = data.name || '';
  byId('setupDate').value = data.startDate || '';
  byId('setupGroups').value = data.numGroups || 1;
  const preview = byId('bannerPreview');
  if(data.banner){ preview.src = data.banner; preview.classList.remove('hidden'); } else preview.classList.add('hidden');

  byId('setupForm').onsubmit = async (e)=>{
    e.preventDefault();
    const file = byId('setupBanner').files[0];
    const banner = file ? await fileToBase64(file) : data.banner;
    setupTournament(data, {
      name: byId('setupName').value.trim() || 'Football Tournament',
      banner,
      startDate: byId('setupDate').value,
      numGroups: byId('setupGroups').value
    });
    toast(getLang()==='ar' ? 'تم حفظ البطولة' : 'Tournament saved');
    renderAdminDashboard();
  };
}

/* ---------- Tab: Clubs ---------- */
function renderClubsTab(data){
  // group selector for the add-club form
  const groupSelect = byId('clubGroupSelect');
  groupSelect.innerHTML = data.groups.map(g=>{
    const count = getGroupClubs(data,g.id).length;
    return `<option value="${g.id}" ${count>=4?'disabled':''}>${escapeHtml(g.name)} (${count}/4)</option>`;
  }).join('') || `<option value="">—</option>`;

  const list = byId('clubsList');
  list.innerHTML = data.clubs.length ? data.clubs.map(c=>{
    const g = data.groups.find(gr=>gr.id===c.groupId);
    const playerCount = (c.players||[]).length;
    return `
      <div class="list-item">
        <img src="${clubLogoOrPlaceholder(c.logo)}" alt="">
        <div class="grow"><strong>${escapeHtml(c.name)}</strong><div class="text-dim">${g?escapeHtml(g.name):'—'} · ${playerCount} player${playerCount===1?'':'s'}</div></div>
        <div class="actions">
          <button class="mini-btn edit" data-squad="${c.id}">👥 Squad</button>
          <button class="mini-btn edit" data-edit-club="${c.id}">✏️ Edit</button>
          <button class="mini-btn del" data-del-club="${c.id}">🗑️ Delete</button>
        </div>
      </div>`;
  }).join('') : `<p class="text-dim">No clubs yet.</p>`;

  byId('clubForm').onsubmit = async (e)=>{
    e.preventDefault();
    const groupId = byId('clubGroupSelect').value;
    if(groupId && getGroupClubs(data, groupId).length >= 4){
      toast('This group already has 4 clubs'); return;
    }
    const file = byId('clubLogo').files[0];
    const logo = file ? await fileToBase64(file) : '';
    addClub(data, {name: byId('clubName').value.trim(), logo, groupId});
    byId('clubForm').reset();
    toast('Club added');
    renderAdminDashboard();
  };

  list.querySelectorAll('[data-del-club]').forEach(btn=>{
    btn.onclick = ()=>{
      if(confirm('Delete this club and all its matches?')){
        deleteClub(data, btn.dataset.delClub);
        toast('Club deleted');
        renderAdminDashboard();
      }
    };
  });
  list.querySelectorAll('[data-edit-club]').forEach(btn=>{
    btn.onclick = ()=> openEditClubModal(data, btn.dataset.editClub);
  });
  list.querySelectorAll('[data-squad]').forEach(btn=>{
    btn.onclick = ()=> openSquadModal(data, btn.dataset.squad);
  });
}

/** Opens the "Manage Squad" modal for a single club: register/delete its players. */
function openSquadModal(data, clubId){
  const club = data.clubs.find(c=>c.id===clubId);
  if(!club) return;
  const overlay = byId('squadModal');
  byId('squadModalTitle').textContent = 'Squad — ' + club.name;
  overlay.classList.add('open');

  function renderList(){
    const players = getClubPlayers(data, clubId);
    byId('playersList').innerHTML = players.length ? players.map(p=>`
      <div class="list-item">
        <div class="grow"><strong>${escapeHtml(p.name)}</strong>${p.number?` <span class="text-dim">#${escapeHtml(String(p.number))}</span>`:''}</div>
        <div class="actions"><button class="mini-btn del" data-del-player="${p.id}">🗑️ Delete</button></div>
      </div>`).join('') : `<p class="text-dim">No players registered yet for this club.</p>`;

    byId('playersList').querySelectorAll('[data-del-player]').forEach(btn=>{
      btn.onclick = ()=>{
        if(confirm('Delete this player?')){
          deletePlayer(data, clubId, btn.dataset.delPlayer);
          toast('Player deleted');
          renderList();
          renderClubsTab(data); // refresh player count in the clubs list behind the modal
        }
      };
    });
  }
  renderList();

  byId('addPlayerForm').onsubmit = (e)=>{
    e.preventDefault();
    const name = byId('playerName').value.trim();
    if(!name) return;
    addPlayer(data, clubId, {name, number: byId('playerNumber').value});
    byId('addPlayerForm').reset();
    toast('Player added');
    renderList();
    renderClubsTab(data);
  };

  byId('closeSquadModal').onclick = ()=> overlay.classList.remove('open');
}

function openEditClubModal(data, clubId){
  const club = data.clubs.find(c=>c.id===clubId);
  if(!club) return;
  const overlay = byId('editClubModal');
  byId('editClubName').value = club.name;
  byId('editClubGroup').innerHTML = data.groups.map(g=>`<option value="${g.id}" ${g.id===club.groupId?'selected':''}>${escapeHtml(g.name)}</option>`).join('');
  overlay.classList.add('open');

  byId('editClubForm').onsubmit = async (e)=>{
    e.preventDefault();
    const file = byId('editClubLogo').files[0];
    const fields = {name: byId('editClubName').value.trim(), groupId: byId('editClubGroup').value};
    if(file) fields.logo = await fileToBase64(file);
    editClub(data, clubId, fields);
    overlay.classList.remove('open');
    toast('Club updated');
    renderAdminDashboard();
  };
  byId('closeEditClub').onclick = ()=> overlay.classList.remove('open');
}

/* ---------- Tab: Fixtures ---------- */
function renderFixturesTab(data){
  const legs = byId('legsToggle').checked ? 2 : 1;

  const wrap = byId('fixturesGroupList');
  wrap.innerHTML = data.groups.map(g=>{
    const count = getGroupClubs(data,g.id).length;
    const matchCount = data.matches.filter(m=>m.groupId===g.id).length;
    return `
      <div class="list-item">
        <div class="grow">
          <input type="text" class="rename-group-input" data-rename="${g.id}" value="${escapeHtml(g.name)}" style="font-weight:700;border:1px solid transparent;background:transparent;color:var(--text);width:auto;max-width:180px;padding:2px 4px;">
          <div class="text-dim">${count} clubs · ${matchCount} matches generated</div>
        </div>
        <div class="actions">
          <button class="mini-btn edit" data-gen="${g.id}" ${count<2?'disabled':''}>⚙️ Generate</button>
        </div>
      </div>`;
  }).join('') || `<p class="text-dim">Create groups first in the Setup tab.</p>`;

  wrap.querySelectorAll('[data-rename]').forEach(input=>{
    input.addEventListener('change', ()=>{
      renameGroup(data, input.dataset.rename, input.value);
      toast('Group renamed');
      renderAdminDashboard();
    });
    input.addEventListener('focus', function(){ this.style.borderColor = 'var(--border)'; });
  });

  wrap.querySelectorAll('[data-gen]').forEach(btn=>{
    btn.onclick = ()=>{
      if(confirm('This will regenerate fixtures for this group and remove existing matches/results for it. Continue?')){
        generateFixturesForGroup(data, btn.dataset.gen, byId('legsToggle').checked ? 2 : 1);
        toast('Fixtures generated');
        renderAdminDashboard();
      }
    };
  });

  byId('genAllBtn').onclick = ()=>{
    if(data.groups.length===0){ toast('No groups yet'); return; }
    if(confirm('Generate fixtures for ALL groups? This regenerates all matches.')){
      generateAllFixtures(data, byId('legsToggle').checked ? 2 : 1);
      toast('All fixtures generated');
      renderAdminDashboard();
    }
  };

  // ---- manual "add extra match" form ----
  const groupSel = byId('manualMatchGroup');
  groupSel.innerHTML = `<option value="">— no group (extra/friendly) —</option>` + data.groups.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  const homeSel = byId('manualMatchHome'), awaySel = byId('manualMatchAway');
  const clubOptions = data.clubs.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  homeSel.innerHTML = clubOptions; awaySel.innerHTML = clubOptions;

  byId('manualMatchForm').onsubmit = (e)=>{
    e.preventDefault();
    if(homeSel.value === awaySel.value){ toast('Home and away must be different clubs'); return; }
    addManualMatch(data, {
      groupId: groupSel.value || null,
      homeClubId: homeSel.value,
      awayClubId: awaySel.value,
      date: byId('manualMatchDate').value
    });
    byId('manualMatchForm').reset();
    toast('Match added');
    renderAdminDashboard();
  };
}

/* ---------- Tab: Matches (enter/edit results) ---------- */
function renderMatchesTab(data){
  const list = byId('matchesList');
  if(!data.matches.length){ list.innerHTML = '<p class="text-dim">No matches yet — generate fixtures first.</p>'; return; }
  list.innerHTML = data.matches.map(m=>{
    const home = getClub(data,m.homeClubId), away = getClub(data,m.awayClubId);
    const group = data.groups.find(g=>g.id===m.groupId);
    return `
      <div class="list-item">
        <div class="grow">
          <strong>${escapeHtml(home.name)} vs ${escapeHtml(away.name)}</strong>
          <div class="text-dim">${group?escapeHtml(group.name):''} ${m.played?`· ${m.homeScore} - ${m.awayScore}`:'· not played'}</div>
        </div>
        <div class="actions">
          <button class="mini-btn edit" data-match="${m.id}">${m.played?'✏️ Edit result':'➕ Enter result'}</button>
          <button class="mini-btn del" data-del-match="${m.id}">🗑️ Delete</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-match]').forEach(btn=>{
    btn.onclick = ()=> openMatchModal(data, btn.dataset.match);
  });
  list.querySelectorAll('[data-del-match]').forEach(btn=>{
    btn.onclick = ()=>{
      if(confirm('Delete this match?')){
        deleteMatch(data, btn.dataset.delMatch);
        toast('Match deleted');
        renderAdminDashboard();
      }
    };
  });
}

function openMatchModal(data, matchId){
  const m = data.matches.find(x=>x.id===matchId);
  if(!m) return;
  const overlay = byId('matchModal');

  // Candidate clubs for this fixture: same group if it belongs to one, otherwise any club
  // (keeps group matches "locked" to their group by default while still allowing full override).
  const candidateClubs = m.groupId ? getGroupClubs(data, m.groupId) : data.clubs;
  const clubList = candidateClubs.length ? candidateClubs : data.clubs;

  const homeClubSel = byId('matchHomeClub'), awayClubSel = byId('matchAwayClub');
  const optionsHtml = clubList.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  homeClubSel.innerHTML = optionsHtml;
  awayClubSel.innerHTML = optionsHtml;
  homeClubSel.value = m.homeClubId;
  awayClubSel.value = m.awayClubId;

  function currentHome(){ return getClub(data, homeClubSel.value); }
  function currentAway(){ return getClub(data, awayClubSel.value); }

  byId('matchModalTitle').textContent = `${currentHome().name} vs ${currentAway().name}`;
  byId('matchDate').value = m.date || '';
  byId('matchHomeScore').value = m.homeScore ?? '';
  byId('matchAwayScore').value = m.awayScore ?? '';

  const goalsWrap = byId('goalsWrap');
  goalsWrap.innerHTML = '';

  const OTHER_VALUE = '__other__';

  /** Builds <option> list from a club's registered squad, plus a manual "Other" fallback. */
  function playerOptionsHtml(players, includeNoneOption){
    let html = includeNoneOption ? `<option value="">No assist</option>` : `<option value="">-- select player --</option>`;
    html += players.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.number?` (#${escapeHtml(String(p.number))})`:''}</option>`).join('');
    html += `<option value="${OTHER_VALUE}">Other (type manually)…</option>`;
    return html;
  }

  /** Refreshes the scorer/assist dropdowns for a goal row based on the currently selected team. */
  function refreshPlayerSelects(div, clubId, selectedPlayerName, selectedAssistName){
    const club = getClub(data, clubId);
    const players = club.players || [];
    const scorerSelect = div.querySelector('.goalPlayerSelect');
    const assistSelect = div.querySelector('.goalAssistSelect');
    const scorerOther = div.querySelector('.goalPlayerOther');
    const assistOther = div.querySelector('.goalAssistOther');

    scorerSelect.innerHTML = playerOptionsHtml(players, false);
    assistSelect.innerHTML = playerOptionsHtml(players, true);

    // Pre-fill scorer
    if(selectedPlayerName && players.some(p=>p.name===selectedPlayerName)){
      scorerSelect.value = selectedPlayerName;
      scorerOther.classList.add('hidden');
    } else if(selectedPlayerName){
      scorerSelect.value = OTHER_VALUE;
      scorerOther.value = selectedPlayerName;
      scorerOther.classList.remove('hidden');
    } else if(players.length === 0){
      // no squad registered yet for this club — jump straight to manual entry
      scorerSelect.value = OTHER_VALUE;
      scorerOther.classList.remove('hidden');
    } else {
      scorerOther.classList.add('hidden');
    }

    // Pre-fill assist
    if(selectedAssistName && players.some(p=>p.name===selectedAssistName)){
      assistSelect.value = selectedAssistName;
      assistOther.classList.add('hidden');
    } else if(selectedAssistName){
      assistSelect.value = OTHER_VALUE;
      assistOther.value = selectedAssistName;
      assistOther.classList.remove('hidden');
    } else {
      assistSelect.value = '';
      assistOther.classList.add('hidden');
    }
  }

  function addGoalRow(goal){
    const div = document.createElement('div');
    div.className = 'goal-entry';
    div.innerHTML = `
      <button type="button" class="remove-goal">✕</button>
      <div class="field-row">
        <div class="field">
          <label>Team</label>
          <select class="goalClub"></select>
        </div>
        <div class="field">
          <label>Minute</label>
          <input type="number" class="goalMinute" min="1" max="130" value="${goal?goal.minute||'':''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Scorer</label>
          <select class="goalPlayerSelect"></select>
          <input type="text" class="goalPlayerOther hidden mt-16" placeholder="Type player name">
        </div>
        <div class="field">
          <label>Assist by (optional)</label>
          <select class="goalAssistSelect"></select>
          <input type="text" class="goalAssistOther hidden mt-16" placeholder="Type assist name">
        </div>
      </div>`;

    const clubSelect = div.querySelector('.goalClub');
    function fillTeamOptions(){
      clubSelect.innerHTML = `
        <option value="${homeClubSel.value}">${escapeHtml(currentHome().name)}</option>
        <option value="${awayClubSel.value}">${escapeHtml(currentAway().name)}</option>`;
    }
    fillTeamOptions();
    // default team is home unless we're editing an existing away-side goal
    clubSelect.value = goal ? goal.clubId : homeClubSel.value;
    // keep this row's team dropdown in sync whenever the fixture's home/away team changes
    div._syncTeams = ()=>{
      const wasHome = clubSelect.value === homeClubSel.dataset.prevHome;
      fillTeamOptions();
      clubSelect.value = wasHome ? homeClubSel.value : awayClubSel.value;
      refreshPlayerSelects(div, clubSelect.value, '', '');
    };

    refreshPlayerSelects(div, clubSelect.value, goal ? goal.playerName : '', goal ? goal.assistName : '');

    clubSelect.addEventListener('change', ()=> refreshPlayerSelects(div, clubSelect.value, '', ''));
    div.querySelector('.goalPlayerSelect').addEventListener('change', function(){
      div.querySelector('.goalPlayerOther').classList.toggle('hidden', this.value !== OTHER_VALUE);
    });
    div.querySelector('.goalAssistSelect').addEventListener('change', function(){
      div.querySelector('.goalAssistOther').classList.toggle('hidden', this.value !== OTHER_VALUE);
    });

    div.querySelector('.remove-goal').onclick = ()=> div.remove();
    goalsWrap.appendChild(div);
  }
  (m.goals||[]).forEach(addGoalRow);
  byId('addGoalBtn').onclick = ()=> addGoalRow(null);

  // Reassigning home/away team: update the modal title + every goal row's team dropdown
  homeClubSel.dataset.prevHome = homeClubSel.value;
  function onTeamsChanged(){
    byId('matchModalTitle').textContent = `${currentHome().name} vs ${currentAway().name}`;
    goalsWrap.querySelectorAll('.goal-entry').forEach(div => div._syncTeams());
    homeClubSel.dataset.prevHome = homeClubSel.value;
  }
  homeClubSel.onchange = onTeamsChanged;
  awayClubSel.onchange = onTeamsChanged;

  overlay.classList.add('open');
  byId('closeMatchModal').onclick = ()=> overlay.classList.remove('open');

  byId('matchForm').onsubmit = (e)=>{
    e.preventDefault();
    if(homeClubSel.value === awayClubSel.value){ toast('Home and away must be different clubs'); return; }
    updateMatchTeams(data, matchId, {homeClubId: homeClubSel.value, awayClubId: awayClubSel.value});
    const goals = Array.from(goalsWrap.querySelectorAll('.goal-entry')).map(div=>{
      const scorerVal = div.querySelector('.goalPlayerSelect').value;
      const assistVal = div.querySelector('.goalAssistSelect').value;
      const playerName = scorerVal === OTHER_VALUE ? div.querySelector('.goalPlayerOther').value.trim() : scorerVal;
      const assistName = assistVal === OTHER_VALUE ? div.querySelector('.goalAssistOther').value.trim() : assistVal;
      return {
        clubId: div.querySelector('.goalClub').value,
        minute: div.querySelector('.goalMinute').value,
        playerName,
        assistName
      };
    }).filter(g=>g.playerName);

    saveMatchResult(data, matchId, {
      homeScore: parseInt(byId('matchHomeScore').value,10) || 0,
      awayScore: parseInt(byId('matchAwayScore').value,10) || 0,
      date: byId('matchDate').value,
      goals
    });
    overlay.classList.remove('open');
    toast('Result saved');
    renderAdminDashboard();
  };

  byId('clearResultBtn').onclick = ()=>{
    if(confirm('Clear this result?')){
      clearMatchResult(data, matchId);
      overlay.classList.remove('open');
      toast('Result cleared');
      renderAdminDashboard();
    }
  };
}

/* ---------- Tab: Knockout ---------- */
function buildSourceOptionsHtml(data, currentRoundId, selected){
  let html = `<option value="">-- select --</option>`;

  if(data.groups.length){
    html += `<optgroup label="Group Position">`;
    data.groups.forEach(g=>{
      const count = Math.max(getGroupClubs(data,g.id).length, 2);
      for(let r=1;r<=Math.min(count,4);r++){
        const val = `group:${g.id}:${r}`;
        html += `<option value="${val}" ${selected===val?'selected':''}>${ORDINALS[r]||r+'th'} — ${escapeHtml(g.name)}</option>`;
      }
    });
    html += `</optgroup>`;
  }

  const roundIndex = data.knockoutRounds.findIndex(r=>r.id===currentRoundId);
  const earlierRoundIds = new Set((roundIndex===-1 ? data.knockoutRounds : data.knockoutRounds.slice(0, roundIndex)).map(r=>r.id));
  const earlierMatches = data.knockoutMatches.filter(m=> earlierRoundIds.has(m.roundId));
  if(earlierMatches.length){
    html += `<optgroup label="Winner of">` + earlierMatches.map(m=>{
      const val = `winner:${m.id}`;
      return `<option value="${val}" ${selected===val?'selected':''}>Winner: ${escapeHtml(knockoutMatchLabel(data,m.id))}</option>`;
    }).join('') + `</optgroup>`;
    html += `<optgroup label="Loser of">` + earlierMatches.map(m=>{
      const val = `loser:${m.id}`;
      return `<option value="${val}" ${selected===val?'selected':''}>Loser: ${escapeHtml(knockoutMatchLabel(data,m.id))}</option>`;
    }).join('') + `</optgroup>`;
  }

  if(data.clubs.length){
    html += `<optgroup label="Specific Club">` + data.clubs.map(c=>{
      const val = `club:${c.id}`;
      return `<option value="${val}" ${selected===val?'selected':''}>${escapeHtml(c.name)}</option>`;
    }).join('') + `</optgroup>`;
  }
  return html;
}

function knockoutMatchRowHtml(data, m){
  const home = resolveKnockoutSource(data, m.homeSource);
  const away = resolveKnockoutSource(data, m.awaySource);
  const homeName = home ? home.name : knockoutSourceLabel(data, m.homeSource);
  const awayName = away ? away.name : knockoutSourceLabel(data, m.awaySource);
  let scoreTxt;
  if(m.played) scoreTxt = `${m.homeScore} - ${m.awayScore}` + (m.homePen!=null && m.awayPen!=null ? ` (pen ${m.homePen}-${m.awayPen})` : '');
  else scoreTxt = (home && away) ? 'Not played yet' : 'Waiting for teams to be decided';
  return `
    <div class="list-item">
      <div class="grow"><strong>${escapeHtml(homeName)}</strong> vs <strong>${escapeHtml(awayName)}</strong><div class="text-dim">${scoreTxt}</div></div>
      <div class="actions">
        <button class="mini-btn edit" data-ko-result="${m.id}">${m.played?'✏️ Edit result':'➕ Enter result'}</button>
        <button class="mini-btn del" data-ko-del="${m.id}">🗑️ Delete</button>
      </div>
    </div>`;
}

function renderKnockoutTab(data){
  const canCross = data.groups.length>=2 && data.groups.length%2===0;
  byId('crossKnockoutBtn').disabled = !canCross;
  byId('crossKnockoutForm').onsubmit = (e)=>{
    e.preventDefault();
    if(!canCross){ toast('Need an even number of groups (2, 4, 6…) to auto-generate a cross-bracket'); return; }
    generateCrossKnockout(data, byId('crossRoundName').value.trim());
    byId('crossRoundName').value = '';
    toast('Bracket generated');
    renderAdminDashboard();
  };

  byId('addRoundForm').onsubmit = (e)=>{
    e.preventDefault();
    const name = byId('newRoundName').value.trim();
    if(!name) return;
    addKnockoutRound(data, name);
    byId('newRoundName').value = '';
    toast('Round added');
    renderAdminDashboard();
  };

  const wrap = byId('knockoutRoundsList');
  wrap.innerHTML = data.knockoutRounds.length ? data.knockoutRounds.map(r=>{
    const matches = data.knockoutMatches.filter(m=>m.roundId===r.id);
    return `
      <div class="card mb-16">
        <div class="section-head">
          <input type="text" class="rename-round-input" data-rename-round="${r.id}" value="${escapeHtml(r.name)}" style="font-weight:800;font-size:1.05rem;border:1px solid transparent;background:transparent;color:var(--text);padding:2px 4px;">
          <div class="flex gap-8">
            <button class="mini-btn edit" data-advance="${r.id}" ${matches.length<2?'disabled':''}>➡️ Advance Winners</button>
            <button class="mini-btn del" data-del-round="${r.id}">🗑️ Delete Round</button>
          </div>
        </div>
        <div>${matches.length ? matches.map(m=>knockoutMatchRowHtml(data,m)).join('') : '<p class="text-dim">No matches in this round yet — add one below.</p>'}</div>
        <details class="mt-16">
          <summary class="pill-btn" style="display:inline-block;cursor:pointer;">➕ Add Match to this Round</summary>
          <form class="add-knockout-match-form mt-16" data-round-form="${r.id}">
            <div class="field-row">
              <div class="field"><label>Home side</label><select class="koHomeSource">${buildSourceOptionsHtml(data,r.id,'')}</select></div>
              <div class="field"><label>Away side</label><select class="koAwaySource">${buildSourceOptionsHtml(data,r.id,'')}</select></div>
            </div>
            <div class="field"><label>Date (optional)</label><input type="datetime-local" class="koDateNew"></div>
            <button class="btn-block" type="submit">➕ Add Match</button>
          </form>
        </details>
      </div>`;
  }).join('') : `<p class="text-dim">No knockout rounds yet — use Quick Setup above, or add one manually.</p>`;

  wrap.querySelectorAll('[data-rename-round]').forEach(inp=>{
    inp.addEventListener('change', ()=>{ renameKnockoutRound(data, inp.dataset.renameRound, inp.value); toast('Round renamed'); renderAdminDashboard(); });
  });
  wrap.querySelectorAll('[data-del-round]').forEach(btn=>{
    btn.onclick = ()=>{ if(confirm('Delete this round and all its matches?')){ deleteKnockoutRound(data, btn.dataset.delRound); toast('Round deleted'); renderAdminDashboard(); } };
  });
  wrap.querySelectorAll('[data-advance]').forEach(btn=>{
    btn.onclick = ()=>{
      const name = prompt('Name for the next round?', 'Next Round');
      if(name===null) return;
      generateNextKnockoutRound(data, btn.dataset.advance, name);
      toast('Next round created');
      renderAdminDashboard();
    };
  });
  wrap.querySelectorAll('.add-knockout-match-form').forEach(form=>{
    form.onsubmit = (e)=>{
      e.preventDefault();
      const homeSource = form.querySelector('.koHomeSource').value;
      const awaySource = form.querySelector('.koAwaySource').value;
      if(!homeSource || !awaySource){ toast('Pick both sides'); return; }
      addKnockoutMatch(data, {roundId: form.dataset.roundForm, homeSource, awaySource, date: form.querySelector('.koDateNew').value});
      toast('Match added');
      renderAdminDashboard();
    };
  });
  wrap.querySelectorAll('[data-ko-result]').forEach(btn=>{
    btn.onclick = ()=> openKnockoutMatchModal(data, btn.dataset.koResult);
  });
  wrap.querySelectorAll('[data-ko-del]').forEach(btn=>{
    btn.onclick = ()=>{ if(confirm('Delete this match?')){ deleteKnockoutMatch(data, btn.dataset.koDel); toast('Match deleted'); renderAdminDashboard(); } };
  });
}

function openKnockoutMatchModal(data, matchId){
  const m = data.knockoutMatches.find(x=>x.id===matchId);
  if(!m) return;
  const overlay = byId('knockoutModal');
  const homeSourceSel = byId('koHomeSourceSel'), awaySourceSel = byId('koAwaySourceSel');
  homeSourceSel.innerHTML = buildSourceOptionsHtml(data, m.roundId, m.homeSource);
  awaySourceSel.innerHTML = buildSourceOptionsHtml(data, m.roundId, m.awaySource);
  homeSourceSel.value = m.homeSource;
  awaySourceSel.value = m.awaySource;

  const resolvedHome = ()=> resolveKnockoutSource(data, homeSourceSel.value);
  const resolvedAway = ()=> resolveKnockoutSource(data, awaySourceSel.value);

  function updateTitleAndState(){
    const h = resolvedHome(), a = resolvedAway();
    byId('koModalTitle').textContent = (h?h.name:knockoutSourceLabel(data,homeSourceSel.value)) + ' vs ' + (a?a.name:knockoutSourceLabel(data,awaySourceSel.value));
    const ready = !!(h && a);
    byId('koNotReadyMsg').classList.toggle('hidden', ready);
    byId('koScoreFields').classList.toggle('hidden', !ready);
    return {h,a,ready};
  }

  byId('koDate').value = m.date || '';
  byId('koHomeScore').value = m.homeScore ?? '';
  byId('koAwayScore').value = m.awayScore ?? '';
  byId('koHomePen').value = m.homePen ?? '';
  byId('koAwayPen').value = m.awayPen ?? '';

  const goalsWrap = byId('koGoalsWrap');
  goalsWrap.innerHTML = '';
  const OTHER_VALUE = '__other__';

  function playerOptionsHtml(players, includeNone){
    let html = includeNone ? `<option value="">No assist</option>` : `<option value="">-- select player --</option>`;
    html += players.map(p=>`<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.number?` (#${escapeHtml(String(p.number))})`:''}</option>`).join('');
    html += `<option value="${OTHER_VALUE}">Other (type manually)…</option>`;
    return html;
  }
  function refreshPlayerSelects(div, clubId, selPlayer, selAssist){
    const club = data.clubs.find(c=>c.id===clubId) || {players:[]};
    const players = club.players || [];
    const scorerSel = div.querySelector('.koGoalPlayerSelect');
    const assistSel = div.querySelector('.koGoalAssistSelect');
    const scorerOther = div.querySelector('.koGoalPlayerOther');
    const assistOther = div.querySelector('.koGoalAssistOther');
    scorerSel.innerHTML = playerOptionsHtml(players,false);
    assistSel.innerHTML = playerOptionsHtml(players,true);
    if(selPlayer && players.some(p=>p.name===selPlayer)){ scorerSel.value=selPlayer; scorerOther.classList.add('hidden'); }
    else if(selPlayer){ scorerSel.value=OTHER_VALUE; scorerOther.value=selPlayer; scorerOther.classList.remove('hidden'); }
    else if(players.length===0){ scorerSel.value=OTHER_VALUE; scorerOther.classList.remove('hidden'); }
    else scorerOther.classList.add('hidden');
    if(selAssist && players.some(p=>p.name===selAssist)){ assistSel.value=selAssist; assistOther.classList.add('hidden'); }
    else if(selAssist){ assistSel.value=OTHER_VALUE; assistOther.value=selAssist; assistOther.classList.remove('hidden'); }
    else { assistSel.value=''; assistOther.classList.add('hidden'); }
  }

  function addGoalRow(goal){
    const div = document.createElement('div');
    div.className = 'goal-entry';
    div.innerHTML = `
      <button type="button" class="remove-goal">✕</button>
      <div class="field-row">
        <div class="field"><label>Team</label><select class="koGoalClub"></select></div>
        <div class="field"><label>Minute</label><input type="number" class="koGoalMinute" min="1" max="130" value="${goal?goal.minute||'':''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Scorer</label><select class="koGoalPlayerSelect"></select><input type="text" class="koGoalPlayerOther hidden mt-16" placeholder="Type player name"></div>
        <div class="field"><label>Assist by (optional)</label><select class="koGoalAssistSelect"></select><input type="text" class="koGoalAssistOther hidden mt-16" placeholder="Type assist name"></div>
      </div>`;
    const clubSel = div.querySelector('.koGoalClub');
    function fillTeams(){
      const h = resolvedHome(), a = resolvedAway();
      clubSel.innerHTML = `<option value="${h?h.id:''}">${h?escapeHtml(h.name):'Home'}</option><option value="${a?a.id:''}">${a?escapeHtml(a.name):'Away'}</option>`;
    }
    fillTeams();
    clubSel.value = goal ? goal.clubId : ((resolvedHome()||{}).id || '');
    refreshPlayerSelects(div, clubSel.value, goal?goal.playerName:'', goal?goal.assistName:'');
    clubSel.addEventListener('change', ()=> refreshPlayerSelects(div, clubSel.value, '', ''));
    div.querySelector('.koGoalPlayerSelect').addEventListener('change', function(){ div.querySelector('.koGoalPlayerOther').classList.toggle('hidden', this.value!==OTHER_VALUE); });
    div.querySelector('.koGoalAssistSelect').addEventListener('change', function(){ div.querySelector('.koGoalAssistOther').classList.toggle('hidden', this.value!==OTHER_VALUE); });
    div.querySelector('.remove-goal').onclick = ()=> div.remove();
    goalsWrap.appendChild(div);
  }
  (m.goals||[]).forEach(addGoalRow);
  byId('koAddGoalBtn').onclick = ()=> addGoalRow(null);

  homeSourceSel.onchange = updateTitleAndState;
  awaySourceSel.onchange = updateTitleAndState;
  updateTitleAndState();

  overlay.classList.add('open');
  byId('closeKoModal').onclick = ()=> overlay.classList.remove('open');

  byId('koForm').onsubmit = (e)=>{
    e.preventDefault();
    updateKnockoutMatchSources(data, matchId, {homeSource: homeSourceSel.value, awaySource: awaySourceSel.value});
    const {ready} = updateTitleAndState();
    if(!ready){ toast('Both teams must be decided before entering a result'); return; }
    const hs = parseInt(byId('koHomeScore').value,10) || 0;
    const as = parseInt(byId('koAwayScore').value,10) || 0;
    if(hs===as && (byId('koHomePen').value==='' || byId('koAwayPen').value==='')){
      toast('Scores are level — enter a penalty shoot-out result to decide the winner');
      return;
    }
    const goals = Array.from(goalsWrap.querySelectorAll('.goal-entry')).map(div=>{
      const scorerVal = div.querySelector('.koGoalPlayerSelect').value;
      const assistVal = div.querySelector('.koGoalAssistSelect').value;
      const playerName = scorerVal===OTHER_VALUE ? div.querySelector('.koGoalPlayerOther').value.trim() : scorerVal;
      const assistName = assistVal===OTHER_VALUE ? div.querySelector('.koGoalAssistOther').value.trim() : assistVal;
      return { clubId: div.querySelector('.koGoalClub').value, minute: div.querySelector('.koGoalMinute').value, playerName, assistName };
    }).filter(g=>g.playerName);

    saveKnockoutResult(data, matchId, {
      homeScore: hs, awayScore: as,
      homePen: byId('koHomePen').value, awayPen: byId('koAwayPen').value,
      date: byId('koDate').value, goals
    });
    overlay.classList.remove('open');
    toast('Result saved');
    renderAdminDashboard();
  };

  byId('koClearBtn').onclick = ()=>{
    if(confirm('Clear this result?')){
      clearKnockoutResult(data, matchId);
      overlay.classList.remove('open');
      toast('Result cleared');
      renderAdminDashboard();
    }
  };
}

/* ---------- Tab: Champion ---------- */
function renderChampionTab(data){
  const select = byId('championSelect');
  select.innerHTML = `<option value="">— none —</option>` + data.clubs.map(c=>`<option value="${c.id}" ${c.id===data.champion?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
  byId('championForm').onsubmit = (e)=>{
    e.preventDefault();
    data.champion = select.value || null;
    saveData(data);
    toast('Champion updated');
    renderAdminDashboard();
  };
}

/* ---------- Tab: Data (export/import/reset) ---------- */
function renderDataTab(){
  byId('exportBtn').onclick = exportDataFile;
  byId('importInput').onchange = async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    try{
      const text = await file.text();
      importDataFromText(text);
      toast('Tournament imported');
      renderAdminDashboard();
    }catch(err){
      alert('Invalid JSON file');
    }
    e.target.value = '';
  };
  byId('resetBtn').onclick = ()=>{
    if(confirm('This will permanently delete ALL tournament data. Are you sure?')){
      resetData();
      toast('Tournament reset');
      renderAdminDashboard();
    }
  };
}

/* =========================================================================
   8. INIT / ROUTER
   ========================================================================= */
document.addEventListener('DOMContentLoaded', async ()=>{
  initThemeLang();

  const hamburger = byId('hamburger');
  if(hamburger){
    hamburger.addEventListener('click', ()=> byId('navLinks').classList.toggle('open'));
  }

  // Wait for the tournament data to load from Firebase before rendering anything.
  await initRemoteData();

  if(document.body.dataset.page === 'public'){
    window.addEventListener('hashchange', renderPublicApp);
    _onRemoteChange = renderPublicApp; // live-refresh visitors when admin saves
    renderPublicApp();
  }

  if(document.body.dataset.page === 'admin'){
    initAdminLogin();
  }
});