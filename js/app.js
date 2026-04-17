// ═══════════════════════════════════════════════════════
//  MyShift AI — app.js v4
// ═══════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://thfxuliapdacxwdpbnca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZnh1bGlhcGRhY3h3ZHBibmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzAwMzQsImV4cCI6MjA5MjAwNjAzNH0.iIB_0t8SSF3pR3f-4rcUtYJz6cbS892LBpPdh_7wDuM';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', function() {

// ── État global ─────────────────────────────────────────
var currentUser  = null;
var selectedDate = null;
var currentYear  = new Date().getFullYear();
var currentMonth = new Date().getMonth();
var shiftsCache  = {};
var settings = {
  name:'', matricule:'',
  rateJour:35, rateNuit:82, rateNuitSeule:41, rateMN:15,
  base:2093.06,
  quotaCA:24, quotaRU:12, quotaRP:12, quotaRN:0, quotaAutre:0
};

var CONGE_TYPES  = ['CA','RU','RP','RN','AUTRE'];
var CONGE_LABELS = {CA:'Conges Annuels',RU:'Repos Unique',RP:'Repos Principal',RN:'Repos de Nuit',AUTRE:'Autre'};
var CONGE_EMOJIS = {CA:'🏖️',RU:'😴',RP:'🛋️',RN:'🌃',AUTRE:'📋'};
var CUSTOM_CODES = [
  {code:'OCP',       label:'OCP',            emoji:'🔧'},
  {code:'FERIE',     label:'Ferie',          emoji:'🎉'},
  {code:'FORMATION', label:'Formation',      emoji:'📚'},
  {code:'AM',        label:'Arret Maladie',  emoji:'🏥'},
  {code:'TP',        label:'Tps Partiel',    emoji:'⏱️'},
  {code:'AUTRE',     label:'Autre',          emoji:'📋'}
];
var MONTHS_FR = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
var MONTHS_FULL = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
var NIGHT_HDR = ['DI/LU','LU/MA','MA/ME','ME/JE','JE/VE','VE/SA','SA/DI'];
var DAY_NAMES = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

// ── Utils ───────────────────────────────────────────────
function fmtDate(date) {
  if (date instanceof Date) {
    var y = date.getFullYear();
    var m = String(date.getMonth()+1).padStart(2,'0');
    var d = String(date.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+d;
  }
  return date;
}
function parseDate(str) {
  var parts = str.split('-');
  return new Date(+parts[0], +parts[1]-1, +parts[2]);
}
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');
}

function toast(msg, type, dur) {
  type = type||'info'; dur = dur||2400;
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast '+type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.4s'; }, dur);
  setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, dur+400);
}

function showLoading(msg) {
  msg = msg||'Chargement...';
  var el = document.getElementById('loading-overlay');
  if(!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    el.innerHTML = '<div class="spinner"></div><div class="loading-text">'+msg+'</div>';
    document.body.appendChild(el);
  }
  el.querySelector('.loading-text').textContent = msg;
  el.classList.remove('hidden');
}
function hideLoading() {
  var el = document.getElementById('loading-overlay');
  if(el) el.classList.add('hidden');
}

// ── Auth ────────────────────────────────────────────────
async function initAuth() {
  var res = await sb.auth.getSession();
  if(res.data && res.data.session) {
    currentUser = res.data.session.user;
    showApp();
  } else {
    showAuthScreen();
  }
  sb.auth.onAuthStateChange(function(_, session) {
    if(session) { currentUser = session.user; showApp(); }
    else { currentUser = null; showAuthScreen(); }
  });
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display  = 'none';
}
async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'flex';
  document.getElementById('header-username').textContent = currentUser.email.split('@')[0];
  loadSettings();
  scheduleWeeklyNotification();
  await loadMonth();
  renderCalendar();
  updateCongesWidget();
  selectDay(fmtDate(new Date()));
}

document.getElementById('btn-login').addEventListener('click', async function() {
  var email  = document.getElementById('auth-email').value.trim();
  var pwd    = document.getElementById('auth-password').value;
  var errEl  = document.getElementById('auth-error');
  if(!email || !pwd) {
    errEl.textContent = 'Veuillez remplir tous les champs.';
    errEl.classList.remove('hidden'); return;
  }
  showLoading('Connexion...');
  var res = await sb.auth.signInWithPassword({email:email, password:pwd});
  hideLoading();
  if(res.error) { errEl.textContent = res.error.message; errEl.classList.remove('hidden'); }
  else { errEl.classList.add('hidden'); }
});

document.getElementById('btn-register').addEventListener('click', async function() {
  var email = document.getElementById('reg-email').value.trim();
  var pwd   = document.getElementById('reg-password').value;
  var errEl = document.getElementById('reg-error');
  if(!email || !pwd) {
    errEl.textContent = 'Veuillez remplir tous les champs.';
    errEl.classList.remove('hidden'); return;
  }
  showLoading('Creation du compte...');
  var res = await sb.auth.signUp({email:email, password:pwd});
  hideLoading();
  if(res.error) { errEl.textContent = res.error.message; errEl.classList.remove('hidden'); }
  else { toast('Compte cree ! Verifiez votre email.','success',4000); }
});

document.getElementById('link-register').addEventListener('click', function(e) {
  e.preventDefault();
  document.getElementById('auth-login-form').classList.add('hidden');
  document.getElementById('auth-register-form').classList.remove('hidden');
});
document.getElementById('link-login').addEventListener('click', function(e) {
  e.preventDefault();
  document.getElementById('auth-register-form').classList.add('hidden');
  document.getElementById('auth-login-form').classList.remove('hidden');
});

// ── Paramètres ──────────────────────────────────────────
function loadSettings() {
  try {
    var raw = sessionStorage.getItem('myshift_settings');
    if(raw) settings = Object.assign(settings, JSON.parse(raw));
  } catch(e) {}
  document.getElementById('settings-name').value       = settings.name||'';
  document.getElementById('settings-matricule').value  = settings.matricule||'';
  document.getElementById('rate-jour').value           = settings.rateJour;
  document.getElementById('rate-nuit').value           = settings.rateNuit;
  document.getElementById('rate-nuit-seule').value     = settings.rateNuitSeule;
  document.getElementById('rate-mn').value             = settings.rateMN;
  document.getElementById('settings-base').value       = settings.base;
  document.getElementById('quota-CA').value            = settings.quotaCA;
  document.getElementById('quota-RU').value            = settings.quotaRU;
  document.getElementById('quota-RP').value            = settings.quotaRP;
  document.getElementById('quota-RN').value            = settings.quotaRN;
  document.getElementById('quota-AUTRE').value         = settings.quotaAutre;
}

function saveSettingsLocal() {
  settings.name          = document.getElementById('settings-name').value.trim();
  settings.matricule     = document.getElementById('settings-matricule').value.trim();
  settings.rateJour      = parseFloat(document.getElementById('rate-jour').value)||35;
  settings.rateNuit      = parseFloat(document.getElementById('rate-nuit').value)||82;
  settings.rateNuitSeule = parseFloat(document.getElementById('rate-nuit-seule').value)||41;
  settings.rateMN        = parseFloat(document.getElementById('rate-mn').value)||15;
  settings.base          = parseFloat(document.getElementById('settings-base').value)||2093.06;
  settings.quotaCA       = parseInt(document.getElementById('quota-CA').value)||24;
  settings.quotaRU       = parseInt(document.getElementById('quota-RU').value)||12;
  settings.quotaRP       = parseInt(document.getElementById('quota-RP').value)||12;
  settings.quotaRN       = parseInt(document.getElementById('quota-RN').value)||0;
  settings.quotaAutre    = parseInt(document.getElementById('quota-AUTRE').value)||0;
  try { sessionStorage.setItem('myshift_settings', JSON.stringify(settings)); } catch(e) {}
  toast('Parametres sauvegardes','success');
  closeModal('modal-settings');
  updateMonthlySummary();
  updateCongesWidget();
}

document.getElementById('btn-settings').addEventListener('click', function() { openModal('modal-settings'); });
document.getElementById('save-settings-btn').addEventListener('click', saveSettingsLocal);
document.getElementById('close-settings-modal').addEventListener('click', function() { closeModal('modal-settings'); });
document.getElementById('btn-logout').addEventListener('click', async function() {
  await sb.auth.signOut(); shiftsCache={}; selectedDate=null;
});

var exportBtnEl = document.getElementById('btn-export-trigger');
if(exportBtnEl) exportBtnEl.addEventListener('click', function() { exportExcel(); });

// ── Notifications vendredi ──────────────────────────────
function scheduleWeeklyNotification() {
  if(!('Notification' in window)) return;
  Notification.requestPermission().then(function(perm) {
    if(perm !== 'granted') return;
    checkAndNotify();
    setInterval(checkAndNotify, 60*60*1000);
  });
}
function checkAndNotify() {
  if(Notification.permission !== 'granted') return;
  var now = new Date();
  if(now.getDay() !== 5) return;
  var todayStr = fmtDate(now);
  try {
    var last = sessionStorage.getItem('myshift_last_notif');
    if(last === todayStr) return;
    sessionStorage.setItem('myshift_last_notif', todayStr);
  } catch(e) {}
  new Notification('MyShift AI', {
    body: 'Pensez a remplir votre planning cette semaine !'
  });
}

// ── Supabase ────────────────────────────────────────────
async function loadMonth() {
  if(!currentUser) return;
  var from = fmtDate(new Date(currentYear, currentMonth-1, 20));
  var to   = fmtDate(new Date(currentYear, currentMonth+1, 10));
  var res  = await sb.from('shifts').select('date,status,note')
    .eq('user_id', currentUser.id).gte('date', from).lte('date', to);
  if(!res.error && res.data) {
    res.data.forEach(function(r) {
      shiftsCache[r.date] = {status: r.status, note: r.note||''};
    });
  }
}

async function saveEntry(dateStr, status, note, imported) {
  if(!currentUser) return;
  if(!shiftsCache[dateStr]) shiftsCache[dateStr] = {};
  if(status !== null && status !== undefined) shiftsCache[dateStr].status = status;
  if(note   !== null && note   !== undefined) shiftsCache[dateStr].note   = note;
  var payload = {
    user_id: currentUser.id,
    date:    dateStr,
    status:  shiftsCache[dateStr].status||null,
    note:    shiftsCache[dateStr].note||null
  };
  if(imported) payload.imported = true;
  var res = await sb.from('shifts').upsert(payload, {onConflict:'user_id,date'});
  if(res.error) {
    delete payload.imported;
    await sb.from('shifts').upsert(payload, {onConflict:'user_id,date'});
  }
}

async function deleteEntry(dateStr) {
  if(!currentUser) return;
  delete shiftsCache[dateStr];
  await sb.from('shifts').delete().eq('user_id', currentUser.id).eq('date', dateStr);
}

// ── Calendrier ──────────────────────────────────────────
function renderCalendar() {
  document.getElementById('cal-month-name').textContent = MONTHS_FULL[currentMonth];
  document.getElementById('cal-year').textContent       = currentYear;

  var headersEl = document.getElementById('cal-headers');
  var daysEl    = document.getElementById('cal-days');
  headersEl.innerHTML = '<div class="cal-header-cell">SEM</div>';
  NIGHT_HDR.forEach(function(h) {
    var d = document.createElement('div');
    d.className = 'cal-header-cell'; d.textContent = h;
    headersEl.appendChild(d);
  });

  daysEl.innerHTML = '';
  var first = new Date(currentYear, currentMonth, 1);
  var startDow = first.getDay();
  if(startDow === 0) startDow = 6; else startDow -= 1;
  var totalDays  = new Date(currentYear, currentMonth+1, 0).getDate();
  var totalCells = Math.ceil((startDow+totalDays)/7)*7;
  var today      = fmtDate(new Date());
  var weekNum    = getWeekNumber(new Date(currentYear, currentMonth, 1-startDow));

  for(var i=0; i<totalCells; i++) {
    if(i%7 === 0) {
      var wn = document.createElement('div');
      wn.className = 'cal-week-num'; wn.textContent = weekNum; weekNum++;
      daysEl.appendChild(wn);
    }
    var dayOffset = i - startDow;
    var date      = new Date(currentYear, currentMonth, dayOffset+1);
    var dateStr   = fmtDate(date);
    var cell      = document.createElement('div');
    cell.className = 'cal-day';
    if(date.getMonth() !== currentMonth) cell.classList.add('other-month');
    if(dateStr === today)                cell.classList.add('today');
    if(dateStr === selectedDate)         cell.classList.add('selected');

    var shift = shiftsCache[dateStr];
    var sc = '', sl = '';
    if(shift && shift.status) {
      var s = shift.status.toLowerCase();
      if(s==='jour')   { sc='s-jour';   sl='JOUR'; }
      else if(s==='nuit')  { sc='s-nuit';   sl='NUIT'; }
      else if(s==='mn')    { sc='s-mn';     sl='MN'; }
      else if(s==='repos') { sc='s-repos';  sl='REPOS'; }
      else if(s==='ca')    { sc='s-conges'; sl='CA'; }
      else if(s==='ru')    { sc='s-conges'; sl='RU'; }
      else if(s==='rp')    { sc='s-conges'; sl='RP'; }
      else if(s==='rn')    { sc='s-conges'; sl='RN'; }
      else if(s==='conges'){ sc='s-conges'; sl='CGE'; }
      else                 { sc='s-custom'; sl=shift.status.toUpperCase().slice(0,5); }
    }
    if(sc) cell.classList.add(sc);
    cell.innerHTML = '<span class="day-num">'+date.getDate()+'</span>'
      +(sl?'<span class="day-status-label">'+sl+'</span>':'')
      +(shift&&shift.note?'<div class="note-dot"></div>':'');

    (function(ds){ cell.addEventListener('click', function(){ selectDay(ds); }); })(dateStr);
    daysEl.appendChild(cell);
  }
  updateMonthlySummary();
  updateCongesWidget();
}

function getWeekNumber(date) {
  var d  = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dn = d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-dn);
  var ys = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-ys)/86400000)+1)/7);
}

document.getElementById('btn-prev-month').addEventListener('click', async function() {
  currentMonth--; if(currentMonth<0){currentMonth=11;currentYear--;}
  await loadMonth(); renderCalendar();
});
document.getElementById('btn-next-month').addEventListener('click', async function() {
  currentMonth++; if(currentMonth>11){currentMonth=0;currentYear++;}
  await loadMonth(); renderCalendar();
});
document.getElementById('tab-today').addEventListener('click', function() {
  document.getElementById('tab-today').classList.add('active');
  document.getElementById('tab-stats').classList.remove('active');
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('cal-grid').classList.remove('hidden');
  document.getElementById('monthly-summary').classList.remove('hidden');
  var td = new Date();
  if(td.getFullYear()!==currentYear||td.getMonth()!==currentMonth) {
    currentYear=td.getFullYear(); currentMonth=td.getMonth();
    loadMonth().then(renderCalendar);
  }
  selectDay(fmtDate(td));
});
document.getElementById('tab-stats').addEventListener('click', function() {
  document.getElementById('tab-stats').classList.add('active');
  document.getElementById('tab-today').classList.remove('active');
  document.getElementById('stats-panel').classList.remove('hidden');
  document.getElementById('cal-grid').classList.add('hidden');
  document.getElementById('monthly-summary').classList.add('hidden');
  updateStatsPanel();
});

// ── Sélection jour ──────────────────────────────────────
function selectDay(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  var date  = parseDate(dateStr);
  var shift = shiftsCache[dateStr];
  var status= shift ? shift.status : null;
  var note  = shift ? (shift.note||'') : '';
  var label = DAY_NAMES[date.getDay()]+' '+date.getDate()+' '+MONTHS_FULL[date.getMonth()];
  document.getElementById('detail-date-label').textContent = label;
  renderStatusBadge(status);
  var sal = calcDaySalary(dateStr);
  var body = document.getElementById('detail-body');
  var noteHtml = note
    ? '<div class="detail-note-text">'+esc(note)+'</div>'
      +'<div class="detail-note-actions">'
      +'<button class="note-action-btn" id="btn-edit-note">Modifier</button>'
      +'<button class="note-action-btn delete" id="btn-delete-note">Supprimer</button>'
      +'</div>'
    : '<div class="detail-note-none">Aucune note &mdash; <a href="#" id="link-add-note">+ Ajouter</a></div>';
  body.innerHTML =
    '<div class="detail-salary-line">'
    +'<span class="detail-salary-amount">'+sal.total.toFixed(2)+' &euro;</span>'
    +'<span class="detail-salary-breakdown">'+sal.breakdown+'</span>'
    +'</div>'
    +'<div class="detail-note-section">'
    +'<div class="detail-note-label">NOTE</div>'
    +noteHtml
    +'</div>';

  var eb = document.getElementById('btn-edit-note');
  var db = document.getElementById('btn-delete-note');
  var al = document.getElementById('link-add-note');
  if(eb) eb.addEventListener('click', function(){ openNoteModal(note); });
  if(db) db.addEventListener('click', deleteNote);
  if(al) al.addEventListener('click', function(e){ e.preventDefault(); openNoteModal(''); });
}

function renderStatusBadge(status) {
  var badge = document.getElementById('detail-status-badge');
  badge.className = 'detail-status-badge';
  if(!status){ badge.textContent='LIBRE'; badge.classList.add('badge-libre'); return; }
  var s = status.toLowerCase();
  var map = {jour:'JOUR',nuit:'NUIT',mn:'MN',repos:'REPOS',conges:'CGE',ca:'CA',ru:'RU',rp:'RP',rn:'RN'};
  badge.textContent = map[s]||status.toUpperCase();
  var cls = ['ca','ru','rp','rn','conges'].includes(s)?'conges':(['jour','nuit','mn','repos'].includes(s)?s:'custom');
  badge.classList.add('badge-'+cls);
}

// ── Calcul salaire ──────────────────────────────────────
function calcDaySalary(dateStr) {
  var shift = shiftsCache[dateStr];
  if(!shift || !shift.status) return {total:0, breakdown:'Aucun service'};
  var s = shift.status.toLowerCase();
  var total = 0, parts = [];
  if(s==='jour')      { total=settings.rateJour; parts.push('Jour: '+settings.rateJour+String.fromCharCode(8364)); }
  else if(s==='nuit') { total=settings.rateNuit; parts.push('Nuit: '+settings.rateNuit+String.fromCharCode(8364)); }
  else if(s==='mn')   { total=settings.rateNuit+settings.rateMN; parts.push('Nuit: '+settings.rateNuit+String.fromCharCode(8364)); parts.push('MN: '+settings.rateMN+String.fromCharCode(8364)); }
  else                { parts.push(shift.status.toUpperCase()); }
  return {total:total, breakdown:parts.join(' + ')};
}

// ── Résumés ─────────────────────────────────────────────
function updateMonthlySummary() {
  var jours=0, nuits=0, repos=0, total=settings.base;
  var days = new Date(currentYear, currentMonth+1, 0).getDate();
  for(var d=1; d<=days; d++) {
    var ds = currentYear+'-'+String(currentMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var shift = shiftsCache[ds]; if(!shift||!shift.status) continue;
    var s = shift.status.toLowerCase();
    if(s==='jour')   { jours++; total+=settings.rateJour; }
    else if(s==='nuit'){ nuits++; total+=settings.rateNuit; }
    else if(s==='mn')  { nuits++; total+=settings.rateNuit+settings.rateMN; }
    else if(s==='repos') repos++;
  }
  document.getElementById('sum-jours').textContent  = jours;
  document.getElementById('sum-nuits').textContent  = nuits;
  document.getElementById('sum-repos').textContent  = repos;
  document.getElementById('sum-salary').textContent = total.toFixed(2)+' €';
}

function updateStatsPanel() {
  var j=0,n=0,mn=0,r=0,ca=0,ru=0,rp=0,rn=0,au=0,sal=settings.base;
  var days = new Date(currentYear, currentMonth+1, 0).getDate();
  for(var d=1; d<=days; d++) {
    var ds = currentYear+'-'+String(currentMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var shift = shiftsCache[ds]; if(!shift||!shift.status) continue;
    var s = shift.status.toLowerCase();
    var info = calcDaySalary(ds); sal += info.total;
    if(s==='jour') j++;
    else if(s==='nuit') n++;
    else if(s==='mn')  { mn++; n++; }
    else if(s==='repos') r++;
    else if(s==='ca')  ca++;
    else if(s==='ru')  ru++;
    else if(s==='rp')  rp++;
    else if(s==='rn')  rn++;
    else if(s&&s!=='libre') au++;
  }
  var grid = document.getElementById('stats-grid');
  grid.innerHTML =
    '<div class="stat-card"><div class="stat-card-title">&#9728; Jours</div><div class="stat-card-value">'+j+'</div></div>'
   +'<div class="stat-card"><div class="stat-card-title">&#127769; Nuits</div><div class="stat-card-value">'+n+'</div></div>'
   +'<div class="stat-card"><div class="stat-card-title">&#127748; MN</div><div class="stat-card-value">'+mn+'</div></div>'
   +'<div class="stat-card"><div class="stat-card-title">&#127968; Repos</div><div class="stat-card-value">'+r+'</div></div>'
   +'<div class="stat-card"><div class="stat-card-title">CA</div><div class="stat-card-value">'+ca+'</div></div>'
   +'<div class="stat-card"><div class="stat-card-title">RU</div><div class="stat-card-value">'+ru+'</div></div>'
   +'<div class="stat-card"><div class="stat-card-title">RP</div><div class="stat-card-value">'+rp+'</div></div>'
   +'<div class="stat-card"><div class="stat-card-title">RN</div><div class="stat-card-value">'+rn+'</div></div>'
   +'<div class="stat-card" style="grid-column:span 2"><div class="stat-card-title">Estime brut '+MONTHS_FULL[currentMonth]+'</div><div class="stat-card-value" style="color:var(--blue)">'+sal.toFixed(2)+' €</div></div>';
}

// ── Compteur congés ─────────────────────────────────────
function countCongesByType(year) {
  var counts = {CA:0,RU:0,RP:0,RN:0,AUTRE:0};
  Object.keys(shiftsCache).forEach(function(dateStr) {
    var shift = shiftsCache[dateStr];
    if(!shift || !shift.status) return;
    var d = parseDate(dateStr);
    if(d.getFullYear() !== year) return;
    var s = shift.status.toUpperCase();
    if(counts.hasOwnProperty(s)) counts[s]++;
    else if(s==='CONGES') counts.AUTRE++;
  });
  return counts;
}

function updateCongesWidget() {
  var widget = document.getElementById('conges-widget');
  if(!widget) return;
  var yrEl = document.getElementById('conges-year');
  if(yrEl) yrEl.textContent = new Date().getFullYear();
  var year   = new Date().getFullYear();
  var used   = countCongesByType(year);
  var quotas = {CA:settings.quotaCA,RU:settings.quotaRU,RP:settings.quotaRP,RN:settings.quotaRN,AUTRE:settings.quotaAutre};
  widget.innerHTML = CONGE_TYPES.map(function(type) {
    var quota   = quotas[type]||0;
    var use     = used[type]||0;
    var remain  = Math.max(0, quota-use);
    var pct     = quota>0 ? Math.min(100, Math.round(use/quota*100)) : 0;
    var color   = pct>=90 ? 'var(--red)' : pct>=70 ? 'var(--gold)' : 'var(--green)';
    return '<div class="conge-row">'
      +'<div class="conge-info">'
      +'<span class="conge-emoji">'+CONGE_EMOJIS[type]+'</span>'
      +'<span class="conge-label">'+type+'</span>'
      +'<span class="conge-count">'+use+'/'+quota+'</span>'
      +'</div>'
      +'<div class="conge-bar-wrap"><div class="conge-bar" style="width:'+pct+'%;background:'+color+'"></div></div>'
      +'<span class="conge-remain" style="color:'+color+'">'+remain+'j restants</span>'
      +'</div>';
  }).join('');
}

// ── Dock ────────────────────────────────────────────────
document.querySelectorAll('.dock-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var action = btn.getAttribute('data-action');
    if(!selectedDate && action!=='export') {
      toast('Selectionnez un jour','info'); return;
    }
    handleAction(action);
  });
});

async function handleAction(action) {
  if(action==='note')    { openNoteModal(shiftsCache[selectedDate]&&shiftsCache[selectedDate].note||''); return; }
  if(action==='conges')  { openCongesModal(); return; }
  if(action==='autre')   { openAutreModal(); return; }
  if(action==='export')  { exportExcel(); return; }
  if(action==='effacer') {
    await deleteEntry(selectedDate);
    renderCalendar(); selectDay(selectedDate);
    toast('Efface','info'); return;
  }
  await saveEntry(selectedDate, action, null, false);
  if(action==='jour') {
    var existing = shiftsCache[selectedDate]&&shiftsCache[selectedDate].note||'';
    if(existing.indexOf('Pause 12h-13h')===-1) {
      await saveEntry(selectedDate, null, existing?existing+'\nPause 12h-13h':'Pause 12h-13h', false);
    }
  }
  renderCalendar(); selectDay(selectedDate);
  toast('Service enregistre','success');
}

// ── Notes ───────────────────────────────────────────────
function openNoteModal(cur) {
  if(!selectedDate) { toast('Selectionnez un jour','info'); return; }
  document.getElementById('note-textarea').value = cur||'';
  openModal('modal-note');
}
async function saveNote() {
  var text = document.getElementById('note-textarea').value.trim();
  await saveEntry(selectedDate, null, text, false);
  closeModal('modal-note');
  renderCalendar(); selectDay(selectedDate);
  toast('Note sauvegardee','success');
}
async function deleteNote() {
  await saveEntry(selectedDate, null, '', false);
  renderCalendar(); selectDay(selectedDate);
  toast('Note supprimee','info');
}
document.getElementById('save-note-btn').addEventListener('click', saveNote);
document.getElementById('close-note-modal').addEventListener('click', function(){ closeModal('modal-note'); });
document.getElementById('close-note-modal-2').addEventListener('click', function(){ closeModal('modal-note'); });

// ── Modale Congés ───────────────────────────────────────
function openCongesModal() {
  if(!selectedDate) { toast('Selectionnez un jour','info'); return; }
  var year   = new Date().getFullYear();
  var used   = countCongesByType(year);
  var quotas = {CA:settings.quotaCA,RU:settings.quotaRU,RP:settings.quotaRP,RN:settings.quotaRN,AUTRE:settings.quotaAutre};
  var grid   = document.getElementById('conges-choice-grid');
  grid.innerHTML = '';
  CONGE_TYPES.forEach(function(type) {
    var quota   = quotas[type]||0;
    var use     = used[type]||0;
    var remain  = Math.max(0, quota-use);
    var isActive = shiftsCache[selectedDate] && shiftsCache[selectedDate].status && shiftsCache[selectedDate].status.toUpperCase()===type;
    var btn = document.createElement('button');
    btn.className = 'conges-choice-btn'+(isActive?' active':'')+(remain<=0&&!isActive?' depleted':'');
    btn.innerHTML =
      '<span class="cc-emoji">'+CONGE_EMOJIS[type]+'</span>'
      +'<span class="cc-type">'+type+'</span>'
      +'<span class="cc-label">'+CONGE_LABELS[type]+'</span>'
      +'<span class="cc-remain">'+remain+'j restants</span>';
    btn.addEventListener('click', async function() {
      await saveEntry(selectedDate, type, null, false);
      closeModal('modal-conges');
      renderCalendar(); selectDay(selectedDate);
      toast(type+' pose','success');
    });
    grid.appendChild(btn);
  });
  openModal('modal-conges');
}
document.getElementById('close-conges-modal').addEventListener('click', function(){ closeModal('modal-conges'); });

// ── Autre ───────────────────────────────────────────────
function openAutreModal() {
  if(!selectedDate) { toast('Selectionnez un jour','info'); return; }
  var grid = document.getElementById('code-grid');
  grid.innerHTML = '';
  CUSTOM_CODES.forEach(function(c) {
    var btn = document.createElement('button');
    btn.className = 'code-btn';
    btn.innerHTML = '<span class="code-emoji">'+c.emoji+'</span>'+c.label;
    btn.addEventListener('click', async function() {
      await saveEntry(selectedDate, c.code, null, false);
      closeModal('modal-autre');
      renderCalendar(); selectDay(selectedDate);
      toast(c.label+' enregistre','success');
    });
    grid.appendChild(btn);
  });
  openModal('modal-autre');
}
document.getElementById('close-autre-modal').addEventListener('click', function(){ closeModal('modal-autre'); });

// ── Export Excel ─────────────────────────────────────────
function exportExcel() {
  var wb = XLSX.utils.book_new();
  var year = currentYear;
  for(var m=0; m<12; m++) {
    var rows = [];
    var days = new Date(year, m+1, 0).getDate();
    rows.push(['Date','Jour','Type','Salaire variable (Eur)','Note']);
    var totJ=0,totN=0,totMN=0,totR=0,totCA=0,totRU=0,totRP=0,totRN=0,totAu=0,totSal=0;
    for(var d=1; d<=days; d++) {
      var ds = year+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      var date = parseDate(ds);
      var shift = shiftsCache[ds];
      var status = shift&&shift.status ? shift.status.toUpperCase() : 'LIBRE';
      var note   = shift&&shift.note   ? shift.note : '';
      var sal    = calcDaySalary(ds);
      totSal += sal.total;
      var s = status.toLowerCase();
      if(s==='jour') totJ++;
      else if(s==='nuit') totN++;
      else if(s==='mn') { totMN++; totN++; }
      else if(s==='repos') totR++;
      else if(s==='ca') totCA++;
      else if(s==='ru') totRU++;
      else if(s==='rp') totRP++;
      else if(s==='rn') totRN++;
      else if(s&&s!=='libre') totAu++;
      rows.push([
        String(d).padStart(2,'0')+'/'+String(m+1).padStart(2,'0')+'/'+year,
        DAY_NAMES[date.getDay()],
        status,
        sal.total > 0 ? sal.total : '',
        note
      ]);
    }
    rows.push([]);
    rows.push(['RESUME DU MOIS','','','','']);
    rows.push(['Jours','',totJ,'','']);
    rows.push(['Nuits','',totN,'','']);
    rows.push(['Montees de nuit','',totMN,'','']);
    rows.push(['Repos','',totR,'','']);
    rows.push(['CA','',totCA,'','']);
    rows.push(['RU','',totRU,'','']);
    rows.push(['RP','',totRP,'','']);
    rows.push(['RN','',totRN,'','']);
    rows.push(['Autres','',totAu,'','']);
    rows.push([]);
    rows.push(['Base mensuelle','',settings.base,'','']);
    rows.push(['Variables','',totSal,'','']);
    rows.push(['TOTAL ESTIME BRUT','',settings.base+totSal,'','']);
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:14},{wch:14},{wch:16},{wch:20},{wch:40}];
    XLSX.utils.book_append_sheet(wb, ws, MONTHS_FULL[m]);
  }
  // Recap annuel
  var recapRows = [['Mois','Jours','Nuits','MN','Repos','CA','RU','RP','RN','Autres','Total brut (Eur)']];
  var grandTotal = 0;
  for(var m2=0; m2<12; m2++) {
    var daysR = new Date(year,m2+1,0).getDate();
    var j2=0,n2=0,mn2=0,r2=0,ca2=0,ru2=0,rp2=0,rn2=0,au2=0,sal2=settings.base;
    for(var d2=1; d2<=daysR; d2++) {
      var ds2 = year+'-'+String(m2+1).padStart(2,'0')+'-'+String(d2).padStart(2,'0');
      var sh2 = shiftsCache[ds2]; var sv2=(sh2&&sh2.status||'').toLowerCase();
      var inf = calcDaySalary(ds2); sal2 += inf.total;
      if(sv2==='jour') j2++;
      else if(sv2==='nuit') n2++;
      else if(sv2==='mn') { mn2++; n2++; }
      else if(sv2==='repos') r2++;
      else if(sv2==='ca') ca2++;
      else if(sv2==='ru') ru2++;
      else if(sv2==='rp') rp2++;
      else if(sv2==='rn') rn2++;
      else if(sv2&&sv2!=='libre') au2++;
    }
    grandTotal += sal2;
    recapRows.push([MONTHS_FULL[m2],j2,n2,mn2,r2,ca2,ru2,rp2,rn2,au2,sal2.toFixed(2)]);
  }
  recapRows.push([]);
  recapRows.push(['TOTAL ANNUEL','','','','','','','','','',grandTotal.toFixed(2)]);
  var wsR = XLSX.utils.aoa_to_sheet(recapRows);
  wsR['!cols'] = [{wch:14}].concat(Array(9).fill({wch:8})).concat([{wch:22}]);
  XLSX.utils.book_append_sheet(wb, wsR, 'Recap Annuel');
  XLSX.writeFile(wb, 'MyShift_'+year+'.xlsx');
  toast('Export Excel genere','success');
}

// ── Import Excel ─────────────────────────────────────────
document.getElementById('btn-import-trigger').addEventListener('click', function() {
  document.getElementById('file-import').click();
});
document.getElementById('file-import').addEventListener('change', async function(e) {
  var file = e.target.files[0]; if(!file) return; e.target.value='';
  showLoading('Analyse du fichier...');
  try {
    var data    = await readExcelFile(file);
    var results = analyzeData(data);
    if(!results||!results.length){ hideLoading(); toast('Aucune donnee detectee','error'); return; }
    await importSchedule(results);
    hideLoading(); await loadMonth(); renderCalendar();
    toast(results.length+' service(s) importe(s)','success');
  } catch(err) { hideLoading(); toast('Erreur import: '+err.message,'error'); }
});

function readExcelFile(file) {
  return new Promise(function(resolve,reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var wb = XLSX.read(e.target.result,{type:'array',cellDates:true});
        var ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws,{header:1,defval:''}));
      } catch(err) { reject(err); }
    };
    reader.onerror = function(){ reject(new Error('Lecture impossible')); };
    reader.readAsArrayBuffer(file);
  });
}

function analyzeData(rows) {
  if(!rows||!rows.length) return [];
  var legend     = buildLegend(rows);
  var userRowIdx = findUserRow(rows); if(userRowIdx===-1) return [];
  var dateRowIdx = findDateRow(rows,userRowIdx); if(dateRowIdx===-1) return [];
  var dateRow = rows[dateRowIdx], userRow = rows[userRowIdx];
  var results = [];
  for(var col=0; col<dateRow.length; col++) {
    var rawDate=dateRow[col], rawCode=userRow[col];
    if(!rawDate||!rawCode) continue;
    var date=parseExcelDate(rawDate); if(!date) continue;
    var code=String(rawCode).trim().toUpperCase(); if(!code) continue;
    var status=resolveStatus(code,legend);
    if(status) results.push({date:fmtDate(date),status:status,code:code});
  }
  return applyBusinessRules(results);
}

function buildLegend(rows) {
  var legend={};
  var kw=['MEMO','CODE','CODES','LEGENDE'];
  var start=-1;
  for(var i=rows.length-1; i>=Math.max(0,rows.length-30); i--) {
    if(kw.some(function(k){ return rows[i].join(' ').toUpperCase().indexOf(k)>-1; })) { start=i; break; }
  }
  var s=start>=0?start:Math.max(0,rows.length-20);
  for(var i2=s; i2<rows.length; i2++) {
    var row=rows[i2];
    for(var j=0; j<row.length-1; j++) {
      var cell=String(row[j]).trim(), next=String(row[j+1]).trim().toLowerCase();
      if(!cell||!next) continue;
      var st=guessStatusFromLabel(next);
      if(st) legend[cell.toUpperCase()]=st;
    }
  }
  return legend;
}

function guessStatusFromLabel(l) {
  if(l.indexOf('nuit')>-1||l.indexOf('night')>-1) return 'nuit';
  if(l.indexOf('mn')>-1||l.indexOf('montee')>-1) return 'mn';
  if(l.indexOf('jour')>-1||l.indexOf('matin')>-1) return 'jour';
  if(l.indexOf('repos')>-1||l.indexOf('rest')>-1) return 'repos';
  if(l.indexOf('conge')>-1||l.indexOf('vacance')>-1) return 'CA';
  return null;
}

function resolveStatus(code,legend) {
  if(legend[code]) return legend[code];
  var c=code.toLowerCase();
  if(c==='mn') return 'mn';
  if(c==='n'||/^n\d+$/.test(c)) return 'nuit';
  if(c==='j'||/^j\d+$/.test(c)) return 'jour';
  if(c==='r'||c==='rep') return 'repos';
  if(c==='ca') return 'CA'; if(c==='ru') return 'RU';
  if(c==='rp') return 'RP'; if(c==='rn') return 'RN';
  if(c.indexOf('nuit')>-1) return 'nuit';
  if(c.indexOf('jour')>-1) return 'jour';
  return null;
}

function findUserRow(rows) {
  var best=0,idx=-1;
  var p=/^[A-Z]{1,4}\d{0,4}$/;
  rows.forEach(function(row,i) {
    var score=0;
    row.forEach(function(cell){ var s=String(cell).trim().toUpperCase(); if(p.test(s)&&s.length>=1&&s.length<=6) score++; });
    if(score>best){best=score;idx=i;}
  });
  return best>=3?idx:-1;
}

function findDateRow(rows,userRowIdx) {
  for(var delta=1; delta<=5; delta++) {
    for(var si=0; si<2; si++) {
      var sign=si===0?-1:1;
      var idx=userRowIdx+sign*delta;
      if(idx<0||idx>=rows.length) continue;
      var cnt=0; rows[idx].forEach(function(c){ if(parseExcelDate(c)) cnt++; });
      if(cnt>=15) return idx;
    }
  }
  return -1;
}

function parseExcelDate(val) {
  if(!val) return null;
  if(val instanceof Date&&!isNaN(val)) return val;
  if(typeof val==='number'&&val>40000&&val<60000) {
    var d=new Date(Math.round((val-25569)*86400*1000)); if(!isNaN(d)) return d;
  }
  var s=String(val).trim();
  var m1=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m1) { var dt=new Date(+m1[3],+m1[2]-1,+m1[1]); if(!isNaN(dt)) return dt; }
  var m2=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m2) { var dt2=new Date(+m2[1],+m2[2]-1,+m2[3]); if(!isNaN(dt2)) return dt2; }
  return null;
}

function applyBusinessRules(entries) {
  entries.forEach(function(e) {
    if(e.status==='jour') e.note='Pause 12h-13h';
  });
  return entries;
}

async function importSchedule(entries) {
  for(var i=0; i<entries.length; i+=20) {
    var batch=entries.slice(i,i+20);
    await Promise.all(batch.map(function(e){ return saveEntry(e.date,e.status,e.note||null,true); }));
  }
}

// ── Modales ─────────────────────────────────────────────
function openModal(id) {
  var el=document.getElementById(id); el.classList.remove('hidden');
  function out(e){ if(e.target===el){ closeModal(id); el.removeEventListener('click',out); } }
  el.addEventListener('click', out);
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── Init ─────────────────────────────────────────────────
initAuth();

}); // fin DOMContentLoaded
