// ═══════════════════════════════════════════════════════════
//  MyShift AI — app.js  v3
//  Vanilla JS ES6 | Supabase Auth/DB | SheetJS XLSX
// ═══════════════════════════════════════════════════════════

// ── Config Supabase ──────────────────────────────────────
const SUPABASE_URL      = 'https://thfxuliapdacxwdpbnca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZnh1bGlhcGRhY3h3ZHBibmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzAwMzQsImV4cCI6MjA5MjAwNjAzNH0.iIB_0t8SSF3pR3f-4rcUtYJz6cbS892LBpPdh_7wDuM';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Debug visuel mobile ──────────────────────────────────
(function(){
  const errors = [];
  const orig = console.error.bind(console);
  console.error = (...args) => { errors.push(args.join(' ')); orig(...args); showDebug(); };
  window.onerror = (msg, src, line) => { errors.push(`${msg} (ligne ${line})`); showDebug(); };
  window.onunhandledrejection = e => { errors.push('Promise: ' + (e.reason?.message || e.reason)); showDebug(); };
  function showDebug(){
    let el = document.getElementById('debug-panel');
    if(!el){
      el = document.createElement('div');
      el.id = 'debug-panel';
      el.style.cssText = 'position:fixed;bottom:80px;left:10px;right:10px;z-index:9999;background:rgba(0,0,0,0.92);border:1px solid #ef4444;border-radius:12px;padding:12px;font-size:11px;color:#fca5a5;max-height:180px;overflow-y:auto;font-family:monospace;';
      el.innerHTML = '<div style="font-weight:700;margin-bottom:6px;color:#fff">🐛 Debug (visible mobile)</div><div id="debug-msgs"></div>';
      document.body.appendChild(el);
    }
    document.getElementById('debug-msgs').innerHTML = errors.slice(-5).map(e=>`<div style="margin-bottom:4px;border-bottom:1px solid #333;padding-bottom:4px">${e}</div>`).join('');
  }
})();



// ── État global ──────────────────────────────────────────
let currentUser  = null;
let selectedDate = null;
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let shiftsCache  = {};
let settings = {
  name: '', matricule: '',
  rateJour: 35, rateNuit: 82, rateNuitSeule: 41, rateMN: 15,
  base: 2093.06,
  // Compteurs congés
  quotaCA: 24, quotaRU: 12, quotaRP: 12, quotaRN: 0, quotaAutre: 0
};

// ── Codes congés ────────────────────────────────────────
const CONGE_TYPES = ['CA','RU','RP','RN','AUTRE'];
const CONGE_LABELS = { CA:'Congés Annuels', RU:'Repos Unique', RP:'Repos Principal', RN:'Repos de Nuit', AUTRE:'Autre' };

// ── Codes custom ─────────────────────────────────────────
const CUSTOM_CODES = [
  { code:'CA',        label:'Congé Annuel',   emoji:'🏖️' },
  { code:'RU',        label:'Repos Unique',   emoji:'😴' },
  { code:'RP',        label:'Repos Principal',emoji:'🛋️' },
  { code:'RN',        label:'Repos Nuit',     emoji:'🌃' },
  { code:'OCP',       label:'OCP',            emoji:'🔧' },
  { code:'FERIE',     label:'Férié',          emoji:'🎉' },
  { code:'FORMATION', label:'Formation',      emoji:'📚' },
  { code:'AM',        label:'Arrêt Maladie',  emoji:'🏥' },
  { code:'TP',        label:'Tps Partiel',    emoji:'⏱️' },
  { code:'AUTRE',     label:'Autre',          emoji:'📋' },
];

// ── Locaux ───────────────────────────────────────────────
const MONTHS_FR   = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const NIGHT_HDR   = ['DI/LU','LU/MA','MA/ME','ME/JE','JE/VE','VE/SA','SA/DI'];
const DAY_NAMES   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

// ── Utils ────────────────────────────────────────────────
function fmt(date) {
  if (date instanceof Date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  return date;
}
function parseDate(str) { const [y,m,d]=str.split('-').map(Number); return new Date(y,m-1,d); }

function toast(msg, type='info', duration=2400) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity 0.4s'; }, duration);
  setTimeout(()=>t.remove(), duration+400);
}
function showLoading(msg='Chargement...') {
  let el=document.getElementById('loading-overlay');
  if(!el){ el=document.createElement('div'); el.id='loading-overlay'; el.className='loading-overlay';
    el.innerHTML=`<div class="spinner"></div><div class="loading-text">${msg}</div>`; document.body.appendChild(el); }
  el.querySelector('.loading-text').textContent=msg; el.classList.remove('hidden');
}
function hideLoading() { const el=document.getElementById('loading-overlay'); if(el) el.classList.add('hidden'); }

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ── Auth ─────────────────────────────────────────────────
async function initAuth() {
  const { data:{ session } } = await sb.auth.getSession();
  if (session) { currentUser=session.user; showApp(); }
  else          { showAuth(); }
  sb.auth.onAuthStateChange((_,session)=>{
    if(session){ currentUser=session.user; showApp(); }
    else{ currentUser=null; showAuth(); }
  });
}

function showAuth() {
  const auth=document.getElementById('auth-screen'), app=document.getElementById('app-screen');
  auth.classList.add('active'); auth.style.display='flex';
  app.classList.remove('active'); app.style.display='none';
  document.body.style.overflow='hidden';
}
async function showApp() {
  const auth=document.getElementById('auth-screen'), app=document.getElementById('app-screen');
  auth.classList.remove('active'); auth.style.display='none';
  app.classList.add('active'); app.style.display='flex';
  document.body.style.overflow='';
  document.getElementById('header-username').textContent=currentUser.email.split('@')[0];
  loadSettings();
  scheduleWeeklyNotification();
  await loadMonth();
  renderCalendar();
  updateCongesWidget();
}

document.getElementById('btn-login').addEventListener('click', async()=>{
  const email=document.getElementById('auth-email').value.trim();
  const pwd=document.getElementById('auth-password').value;
  const errEl=document.getElementById('auth-error');
  if(!email||!pwd){ errEl.textContent='Veuillez remplir tous les champs.'; errEl.classList.remove('hidden'); return; }
  showLoading('Connexion...');
  const{error}=await sb.auth.signInWithPassword({email,password:pwd});
  hideLoading();
  if(error){ errEl.textContent=error.message; errEl.classList.remove('hidden'); }
  else errEl.classList.add('hidden');
});

document.getElementById('btn-register').addEventListener('click', async()=>{
  const email=document.getElementById('reg-email').value.trim();
  const pwd=document.getElementById('reg-password').value;
  const errEl=document.getElementById('reg-error');
  if(!email||!pwd){ errEl.textContent='Veuillez remplir tous les champs.'; errEl.classList.remove('hidden'); return; }
  showLoading('Création du compte...');
  const{error}=await sb.auth.signUp({email,password:pwd});
  hideLoading();
  if(error){ errEl.textContent=error.message; errEl.classList.remove('hidden'); }
  else toast('Compte créé ! Vérifiez votre email.','success',4000);
});

document.getElementById('link-register').addEventListener('click', e=>{
  e.preventDefault();
  document.getElementById('auth-login-form').classList.add('hidden');
  document.getElementById('auth-register-form').classList.remove('hidden');
});
document.getElementById('link-login').addEventListener('click', e=>{
  e.preventDefault();
  document.getElementById('auth-register-form').classList.add('hidden');
  document.getElementById('auth-login-form').classList.remove('hidden');
});

// ── Paramètres ───────────────────────────────────────────
function loadSettings() {
  try { const r=sessionStorage.getItem('myshift_settings'); if(r) settings={...settings,...JSON.parse(r)}; } catch(e){}
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
  try{ sessionStorage.setItem('myshift_settings',JSON.stringify(settings)); } catch(e){}
  toast('Paramètres sauvegardés','success');
  closeModal('modal-settings');
  updateMonthlySummary();
  updateCongesWidget();
}

document.getElementById('btn-settings').addEventListener('click',()=>openModal('modal-settings'));
document.getElementById('btn-export-trigger').addEventListener('click',()=>exportExcel());
document.getElementById('save-settings-btn').addEventListener('click',saveSettingsLocal);
document.getElementById('btn-logout').addEventListener('click',async()=>{ await sb.auth.signOut(); shiftsCache={}; selectedDate=null; });
document.getElementById('close-settings-modal').addEventListener('click',()=>closeModal('modal-settings'));

// ── Notifications hebdomadaires (vendredi) ───────────────
function scheduleWeeklyNotification() {
  if(!('Notification' in window)) return;
  Notification.requestPermission().then(perm=>{
    if(perm!=='granted') return;
    checkAndNotify();
    // Vérifier toutes les heures
    setInterval(checkAndNotify, 60*60*1000);
  });
}

function checkAndNotify() {
  if(Notification.permission!=='granted') return;
  const now   = new Date();
  const isFri = now.getDay()===5; // 5 = vendredi
  if(!isFri) return;
  const todayStr = fmt(now);
  const lastKey  = 'myshift_last_notif';
  try{
    const last = sessionStorage.getItem(lastKey);
    if(last===todayStr) return; // déjà notifié aujourd'hui
    sessionStorage.setItem(lastKey, todayStr);
  } catch(e){}
  new Notification('MyShift AI 📅', {
    body: 'N\'oubliez pas de remplir votre planning cette semaine !',
    icon: '/myshift/icons/icon-192.png',
    badge: '/myshift/icons/icon-192.png'
  });
}

// ── Données Supabase ─────────────────────────────────────
async function loadMonth() {
  if(!currentUser) return;
  const from=fmt(new Date(currentYear,currentMonth-1,20));
  const to  =fmt(new Date(currentYear,currentMonth+1,10));
  const{data,error}=await sb.from('shifts').select('date,status,note')
    .eq('user_id',currentUser.id).gte('date',from).lte('date',to);
  if(!error&&data) data.forEach(r=>{ shiftsCache[r.date]={status:r.status,note:r.note||''}; });
}

async function saveEntry(dateStr, status, note=null, imported=false) {
  if(!currentUser) return;
  if(!shiftsCache[dateStr]) shiftsCache[dateStr]={};
  if(status!==null) shiftsCache[dateStr].status=status;
  if(note!==null)   shiftsCache[dateStr].note=note;
  const payload={user_id:currentUser.id,date:dateStr,
    status:shiftsCache[dateStr].status||null,
    note:shiftsCache[dateStr].note||null, imported};
  let{error}=await sb.from('shifts').upsert(payload,{onConflict:'user_id,date'});
  if(error&&(error.code==='PGRST204'||error.message?.includes('imported'))){
    const{imported:_,...retry}=payload;
    ({error}=await sb.from('shifts').upsert(retry,{onConflict:'user_id,date'}));
  }
  if(error) console.warn('saveEntry:',error.message);
}

async function deleteEntry(dateStr) {
  if(!currentUser) return;
  delete shiftsCache[dateStr];
  await sb.from('shifts').delete().eq('user_id',currentUser.id).eq('date',dateStr);
}

// ── Calendrier ───────────────────────────────────────────
function renderCalendar() {
  document.getElementById('cal-month-name').textContent=MONTHS_FR[currentMonth];
  document.getElementById('cal-year').textContent=currentYear;

  const headersEl=document.getElementById('cal-headers');
  const daysEl   =document.getElementById('cal-days');
  headersEl.innerHTML='<div class="cal-header-cell">SEM</div>';
  NIGHT_HDR.forEach(h=>{ const d=document.createElement('div'); d.className='cal-header-cell'; d.textContent=h; headersEl.appendChild(d); });

  daysEl.innerHTML='';
  const first=new Date(currentYear,currentMonth,1);
  let startDow=first.getDay(); startDow=(startDow===0)?6:startDow-1;
  const totalDays=new Date(currentYear,currentMonth+1,0).getDate();
  const totalCells=Math.ceil((startDow+totalDays)/7)*7;
  const today=fmt(new Date());
  let weekNum=getWeekNumber(new Date(currentYear,currentMonth,1-startDow));

  for(let i=0;i<totalCells;i++){
    if(i%7===0){
      const wn=document.createElement('div'); wn.className='cal-week-num'; wn.textContent=weekNum; weekNum++; daysEl.appendChild(wn);
    }
    const dayOffset=i-startDow;
    const date=new Date(currentYear,currentMonth,dayOffset+1);
    const dateStr=fmt(date);
    const cell=document.createElement('div'); cell.className='cal-day';
    if(date.getMonth()!==currentMonth) cell.classList.add('other-month');
    if(dateStr===today)                cell.classList.add('today');
    if(dateStr===selectedDate)         cell.classList.add('selected');

    const shift=shiftsCache[dateStr];
    let statusClass='', statusLabel='';
    if(shift?.status){
      const s=shift.status.toLowerCase();
      if(s==='jour'){       statusClass='s-jour';   statusLabel='JOUR'; }
      else if(s==='nuit'){  statusClass='s-nuit';   statusLabel='NUIT'; }
      else if(s==='mn'){    statusClass='s-mn';     statusLabel='MN'; }
      else if(s==='repos'){ statusClass='s-repos';  statusLabel='REPOS'; }
      else if(s==='conges'||s==='ca'){ statusClass='s-conges'; statusLabel=shift.status.toUpperCase(); }
      else if(['ru','rp','rn'].includes(s)){ statusClass='s-conges'; statusLabel=shift.status.toUpperCase(); }
      else{                 statusClass='s-custom'; statusLabel=shift.status.toUpperCase().slice(0,5); }
    }
    if(statusClass) cell.classList.add(statusClass);
    cell.innerHTML=`<span class="day-num">${date.getDate()}</span>${statusLabel?`<span class="day-status-label">${statusLabel}</span>`:''}${shift?.note?'<div class="note-dot"></div>':''}`;
    cell.addEventListener('click',()=>selectDay(dateStr));
    daysEl.appendChild(cell);
  }
  updateMonthlySummary();
  updateStatsPanel();
  updateCongesWidget();
}

function getWeekNumber(date){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const dn=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-dn);
  const ys=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-ys)/86400000)+1)/7);
}

document.getElementById('btn-prev-month').addEventListener('click',async()=>{
  currentMonth--; if(currentMonth<0){currentMonth=11;currentYear--;} await loadMonth(); renderCalendar();
});
document.getElementById('btn-next-month').addEventListener('click',async()=>{
  currentMonth++; if(currentMonth>11){currentMonth=0;currentYear++;} await loadMonth(); renderCalendar();
});

document.getElementById('tab-today').addEventListener('click',()=>{
  document.getElementById('tab-today').classList.add('active');
  document.getElementById('tab-stats').classList.remove('active');
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('cal-grid').classList.remove('hidden');
  document.getElementById('monthly-summary').classList.remove('hidden');
  const today=fmt(new Date()); const td=parseDate(today);
  if(td.getFullYear()!==currentYear||td.getMonth()!==currentMonth){
    currentYear=td.getFullYear(); currentMonth=td.getMonth(); loadMonth().then(renderCalendar);
  }
  selectDay(today);
});
document.getElementById('tab-stats').addEventListener('click',()=>{
  document.getElementById('tab-stats').classList.add('active');
  document.getElementById('tab-today').classList.remove('active');
  document.getElementById('stats-panel').classList.remove('hidden');
  document.getElementById('cal-grid').classList.add('hidden');
  document.getElementById('monthly-summary').classList.add('hidden');
  updateStatsPanel();
});

// ── Sélection jour ───────────────────────────────────────
function selectDay(dateStr) {
  selectedDate=dateStr;
  renderCalendar();
  const date=parseDate(dateStr);
  const shift=shiftsCache[dateStr];
  const status=shift?.status||null;
  const note=shift?.note||'';
  const label=`${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTHS_FR[date.getMonth()]}`;
  document.getElementById('detail-date-label').textContent=label;
  renderStatusBadge(status);
  const salaryInfo=calcDaySalary(dateStr);
  const body=document.getElementById('detail-body');
  body.innerHTML=`
    <div class="detail-salary-line">
      <span class="detail-salary-amount">${salaryInfo.total.toFixed(2)} €</span>
      <span class="detail-salary-breakdown">${salaryInfo.breakdown}</span>
    </div>
    <div class="detail-note-section">
      <div class="detail-note-label">📝 NOTE</div>
      ${note
        ?`<div class="detail-note-text">${escapeHtml(note)}</div>
          <div class="detail-note-actions">
            <button class="note-action-btn" id="btn-edit-note">Modifier</button>
            <button class="note-action-btn delete" id="btn-delete-note">Supprimer</button>
          </div>`
        :`<div class="detail-note-none">Aucune note — <a href="#" id="link-add-note" style="color:var(--blue);text-decoration:none;">+ Ajouter</a></div>`
      }
    </div>`;
  const eb=document.getElementById('btn-edit-note');
  const db=document.getElementById('btn-delete-note');
  const al=document.getElementById('link-add-note');
  if(eb) eb.addEventListener('click',()=>openNoteModal(note));
  if(db) db.addEventListener('click',deleteNote);
  if(al) al.addEventListener('click',e=>{e.preventDefault();openNoteModal('');});
}

function renderStatusBadge(status){
  const badge=document.getElementById('detail-status-badge');
  badge.className='detail-status-badge';
  if(!status){badge.textContent='LIBRE';badge.classList.add('badge-libre');return;}
  const s=status.toLowerCase();
  const map={jour:'JOUR',nuit:'NUIT',mn:'MN',repos:'REPOS',conges:'CONGÉS',ca:'CA',ru:'RU',rp:'RP',rn:'RN'};
  badge.textContent=map[s]||status.toUpperCase();
  const cls=['ca','ru','rp','rn','conges'].includes(s)?'conges':(['jour','nuit','mn','repos'].includes(s)?s:'custom');
  badge.classList.add(`badge-${cls}`);
}

// ── Calcul salaire ───────────────────────────────────────
// MN = travail de nuit CE jour-là (soir vers lendemain matin)
// Donc si MN un lundi → travail nuit lundi soir → PAS de MN si ce "lundi" est dimanche (impossible mais garde logique)
function calcDaySalary(dateStr){
  const shift=shiftsCache[dateStr];
  if(!shift?.status) return {total:0,breakdown:'Aucun service'};
  const s=shift.status.toLowerCase();
  let total=0, parts=[];
  if(s==='jour'){
    total=settings.rateJour; parts.push(`Jour: ${settings.rateJour}€`);
  } else if(s==='nuit'){
    total=settings.rateNuit; parts.push(`Nuit: ${settings.rateNuit}€`);
  } else if(s==='mn'){
    // MN = montée de nuit = travail nuit ce soir
    total=settings.rateNuit+settings.rateMN;
    parts.push(`Nuit: ${settings.rateNuit}€`);
    parts.push(`MN: ${settings.rateMN}€`);
  } else if(['repos','conges','ca','ru','rp','rn','autre'].includes(s)){
    total=0; parts.push(shift.status.toUpperCase());
  } else {
    total=0; parts.push(shift.status);
  }
  return{total,breakdown:parts.join(' + ')};
}

// ── Résumé mensuel ───────────────────────────────────────
function updateMonthlySummary(){
  let jours=0,nuits=0,repos=0,total=settings.base;
  const days=new Date(currentYear,currentMonth+1,0).getDate();
  for(let d=1;d<=days;d++){
    const ds=`${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const shift=shiftsCache[ds]; if(!shift?.status) continue;
    const s=shift.status.toLowerCase();
    if(s==='jour'){  jours++; total+=settings.rateJour; }
    else if(s==='nuit'){ nuits++; total+=settings.rateNuit; }
    else if(s==='mn'){   nuits++; total+=settings.rateNuit+settings.rateMN; }
    else if(s==='repos') repos++;
  }
  document.getElementById('sum-jours').textContent =jours;
  document.getElementById('sum-nuits').textContent =nuits;
  document.getElementById('sum-repos').textContent =repos;
  document.getElementById('sum-salary').textContent=total.toFixed(2)+' €';
}

// ── Stats panel ──────────────────────────────────────────
function updateStatsPanel(){
  let jours=0,nuits=0,mn=0,repos=0,conges=0,ca=0,ru=0,rp=0,rn=0,autre=0;
  let totalSalary=settings.base;
  const days=new Date(currentYear,currentMonth+1,0).getDate();
  for(let d=1;d<=days;d++){
    const ds=`${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const shift=shiftsCache[ds]; if(!shift?.status) continue;
    const s=shift.status.toLowerCase();
    if(s==='jour'){   jours++; totalSalary+=settings.rateJour; }
    else if(s==='nuit'){ nuits++; totalSalary+=settings.rateNuit; }
    else if(s==='mn'){   mn++;   nuits++; totalSalary+=settings.rateNuit+settings.rateMN; }
    else if(s==='repos') repos++;
    else if(s==='ca')    ca++;
    else if(s==='ru')    ru++;
    else if(s==='rp')    rp++;
    else if(s==='rn')    rn++;
    else if(s==='conges'||s==='autre') autre++;
  }
  const grid=document.getElementById('stats-grid');
  grid.innerHTML=`
    <div class="stat-card"><div class="stat-card-title">☀️ Jours</div><div class="stat-card-value">${jours}</div></div>
    <div class="stat-card"><div class="stat-card-title">🌙 Nuits</div><div class="stat-card-value">${nuits}</div></div>
    <div class="stat-card"><div class="stat-card-title">🌄 MN</div><div class="stat-card-value">${mn}</div></div>
    <div class="stat-card"><div class="stat-card-title">🏠 Repos</div><div class="stat-card-value">${repos}</div></div>
    <div class="stat-card"><div class="stat-card-title">🏖️ CA</div><div class="stat-card-value">${ca}</div></div>
    <div class="stat-card"><div class="stat-card-title">😴 RU</div><div class="stat-card-value">${ru}</div></div>
    <div class="stat-card"><div class="stat-card-title">🛋️ RP</div><div class="stat-card-value">${rp}</div></div>
    <div class="stat-card"><div class="stat-card-title">🌃 RN</div><div class="stat-card-value">${rn}</div></div>
    <div class="stat-card" style="grid-column:span 2">
      <div class="stat-card-title">💰 Estimé brut ${MONTHS_FR[currentMonth]}</div>
      <div class="stat-card-value" style="color:var(--blue)">${totalSalary.toFixed(2)} €</div>
    </div>`;
}

// ── Compteur congés ──────────────────────────────────────
function countCongesByType(year){
  const counts={CA:0,RU:0,RP:0,RN:0,AUTRE:0};
  Object.entries(shiftsCache).forEach(([dateStr,shift])=>{
    if(!shift?.status) return;
    const d=parseDate(dateStr);
    if(d.getFullYear()!==year) return;
    const s=shift.status.toUpperCase();
    if(counts.hasOwnProperty(s)) counts[s]++;
    else if(s==='CONGES') counts.AUTRE++;
  });
  return counts;
}

function updateCongesWidget(){
  const yrEl=document.getElementById('conges-year');
  if(yrEl) yrEl.textContent=new Date().getFullYear();
  const widget=document.getElementById('conges-widget');
  if(!widget) return;
  const year=new Date().getFullYear();
  const used=countCongesByType(year);
  const quotas={CA:settings.quotaCA,RU:settings.quotaRU,RP:settings.quotaRP,RN:settings.quotaRN,AUTRE:settings.quotaAutre};
  const emojis={CA:'🏖️',RU:'😴',RP:'🛋️',RN:'🌃',AUTRE:'📋'};

  widget.innerHTML=CONGE_TYPES.map(type=>{
    const quota=quotas[type]||0;
    const use=used[type]||0;
    const remain=Math.max(0,quota-use);
    const pct=quota>0?Math.min(100,Math.round(use/quota*100)):0;
    const color=pct>=90?'var(--red)':pct>=70?'var(--gold)':'var(--green)';
    return `
      <div class="conge-row">
        <div class="conge-info">
          <span class="conge-emoji">${emojis[type]}</span>
          <span class="conge-label">${type}</span>
          <span class="conge-count">${use}/${quota}</span>
        </div>
        <div class="conge-bar-wrap">
          <div class="conge-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="conge-remain" style="color:${color}">${remain}j restants</span>
      </div>`;
  }).join('');
}

// ── Dock ─────────────────────────────────────────────────
document.querySelectorAll('.dock-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const action=btn.dataset.action;
    if(!selectedDate&&action!=='note'&&action!=='autre'&&action!=='export'){
      toast('Sélectionnez un jour d\'abord','info'); return;
    }
    handleAction(action);
  });
});

async function handleAction(action){
  if(action==='note'){   openNoteModal(shiftsCache[selectedDate]?.note||''); return; }
  if(action==='autre'){  openAutreModal(); return; }
  if(action==='export'){ exportExcel(); return; }
  if(action==='effacer'){
    await deleteEntry(selectedDate); renderCalendar(); selectDay(selectedDate);
    toast('Effacé','info'); return;
  }
  await saveEntry(selectedDate,action);
  if(action==='jour'){
    const existing=shiftsCache[selectedDate]?.note||'';
    if(!existing.includes('Pause 12h-13h')){
      await saveEntry(selectedDate,null,existing?existing+'\nPause 12h-13h':'Pause 12h-13h');
    }
  }
  renderCalendar(); selectDay(selectedDate);
  toast('Service enregistré ✓','success');
}

// ── Notes ────────────────────────────────────────────────
function openNoteModal(cur=''){
  if(!selectedDate){toast('Sélectionnez un jour d\'abord','info');return;}
  document.getElementById('note-textarea').value=cur; openModal('modal-note');
}
async function saveNote(){
  const text=document.getElementById('note-textarea').value.trim();
  await saveEntry(selectedDate,null,text); closeModal('modal-note');
  renderCalendar(); selectDay(selectedDate); toast('Note sauvegardée ✓','success');
}
async function deleteNote(){
  await saveEntry(selectedDate,null,''); renderCalendar(); selectDay(selectedDate); toast('Note supprimée','info');
}
document.getElementById('save-note-btn').addEventListener('click',saveNote);
document.getElementById('close-note-modal').addEventListener('click',()=>closeModal('modal-note'));
document.getElementById('close-note-modal-2').addEventListener('click',()=>closeModal('modal-note'));

// ── Autre ────────────────────────────────────────────────
function openAutreModal(){
  if(!selectedDate){toast('Sélectionnez un jour d\'abord','info');return;}
  const grid=document.getElementById('code-grid'); grid.innerHTML='';
  CUSTOM_CODES.forEach(c=>{
    const btn=document.createElement('button'); btn.className='code-btn';
    btn.innerHTML=`<span class="code-emoji">${c.emoji}</span>${c.label}`;
    btn.addEventListener('click',async()=>{
      await saveEntry(selectedDate,c.code); closeModal('modal-autre');
      renderCalendar(); selectDay(selectedDate); toast(`${c.label} enregistré ✓`,'success');
    });
    grid.appendChild(btn);
  });
  openModal('modal-autre');
}
document.getElementById('close-autre-modal').addEventListener('click',()=>closeModal('modal-autre'));

// ── Export Excel ─────────────────────────────────────────
function exportExcel(){
  const wb=XLSX.utils.book_new();
  const year=currentYear;

  // Un onglet par mois
  for(let m=0;m<12;m++){
    const rows=[];
    const monthName=MONTHS_FR[m];
    const days=new Date(year,m+1,0).getDate();

    // En-tête
    rows.push(['Date','Jour Semaine','Type de service','Salaire estimé (€)','Note']);

    let totJour=0,totNuit=0,totMN=0,totRepos=0,totCA=0,totRU=0,totRP=0,totRN=0,totAutre=0;
    let totalSalaire=0;

    for(let d=1;d<=days;d++){
      const ds=`${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const date=parseDate(ds);
      const shift=shiftsCache[ds];
      const status=shift?.status||'LIBRE';
      const note=shift?.note||'';
      const sal=calcDaySalary(ds);
      totalSalaire+=sal.total;

      const s=status.toLowerCase();
      if(s==='jour') totJour++;
      else if(s==='nuit') totNuit++;
      else if(s==='mn'){ totMN++; totNuit++; }
      else if(s==='repos') totRepos++;
      else if(s==='ca') totCA++;
      else if(s==='ru') totRU++;
      else if(s==='rp') totRP++;
      else if(s==='rn') totRN++;
      else if(s!=='libre') totAutre++;

      rows.push([
        `${String(d).padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${year}`,
        DAY_NAMES[date.getDay()],
        status.toUpperCase(),
        sal.total > 0 ? sal.total : '',
        note
      ]);
    }

    // Ligne vide + résumé
    rows.push([]);
    rows.push(['── RÉSUMÉ DU MOIS ──','','','','']);
    rows.push(['Jours travaillés','',totJour,'','']);
    rows.push(['Nuits travaillées','',totNuit,'','']);
    rows.push(['Montées de nuit (MN)','',totMN,'','']);
    rows.push(['Repos','',totRepos,'','']);
    rows.push(['Congés Annuels (CA)','',totCA,'','']);
    rows.push(['Repos Unique (RU)','',totRU,'','']);
    rows.push(['Repos Principal (RP)','',totRP,'','']);
    rows.push(['Repos de Nuit (RN)','',totRN,'','']);
    rows.push(['Autres','',totAutre,'','']);
    rows.push([]);
    rows.push(['Base mensuelle','',settings.base.toFixed(2)+' €','','']);
    rows.push(['Variables du mois','',totalSalaire.toFixed(2)+' €','','']);
    rows.push(['TOTAL ESTIMÉ BRUT','',(settings.base+totalSalaire).toFixed(2)+' €','','']);

    const ws=XLSX.utils.aoa_to_sheet(rows);
    // Largeurs colonnes
    ws['!cols']=[{wch:14},{wch:14},{wch:20},{wch:20},{wch:40}];
    XLSX.utils.book_append_sheet(wb,ws,monthName);
  }

  // Onglet récap annuel
  const recapRows=[
    ['Mois','Jours','Nuits','MN','Repos','CA','RU','RP','RN','Autres','Salaire estimé brut (€)']
  ];
  let grandTotal=0;
  for(let m=0;m<12;m++){
    const days=new Date(year,m+1,0).getDate();
    let j=0,n=0,mn=0,r=0,ca=0,ru=0,rp=0,rn=0,au=0,sal=settings.base;
    for(let d=1;d<=days;d++){
      const ds=`${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const shift=shiftsCache[ds]; const s=(shift?.status||'').toLowerCase();
      const info=calcDaySalary(ds); sal+=info.total;
      if(s==='jour') j++;
      else if(s==='nuit') n++;
      else if(s==='mn'){ mn++; n++; }
      else if(s==='repos') r++;
      else if(s==='ca') ca++;
      else if(s==='ru') ru++;
      else if(s==='rp') rp++;
      else if(s==='rn') rn++;
      else if(s&&s!=='libre') au++;
    }
    grandTotal+=sal;
    recapRows.push([MONTHS_FR[m],j,n,mn,r,ca,ru,rp,rn,au,sal.toFixed(2)]);
  }
  recapRows.push([]);
  recapRows.push(['TOTAL ANNUEL','','','','','','','','','',grandTotal.toFixed(2)]);

  const wsRecap=XLSX.utils.aoa_to_sheet(recapRows);
  wsRecap['!cols']=[{wch:14},...Array(9).fill({wch:8}),{wch:22}];
  XLSX.utils.book_append_sheet(wb,wsRecap,'Récap Annuel');

  XLSX.writeFile(wb,`MyShift_${year}.xlsx`);
  toast('Export Excel généré ✓','success');
}

// ── Modales ──────────────────────────────────────────────
function openModal(id){
  const el=document.getElementById(id); el.classList.remove('hidden');
  el.addEventListener('click',function out(e){ if(e.target===el){closeModal(id);el.removeEventListener('click',out);} });
}
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }

// ── Import Excel ─────────────────────────────────────────
document.getElementById('btn-import-trigger').addEventListener('click',()=>document.getElementById('file-import').click());
document.getElementById('file-import').addEventListener('change',async e=>{
  const file=e.target.files[0]; if(!file) return; e.target.value='';
  showLoading('Analyse du fichier…');
  try{
    const data=await readExcelFile(file);
    const results=analyzeData(data);
    if(!results||results.length===0){ hideLoading(); toast('Aucune donnée détectée','error'); return; }
    await importSchedule(results);
    hideLoading(); await loadMonth(); renderCalendar();
    toast(`${results.length} service(s) importé(s) ✓`,'success');
  }catch(err){ hideLoading(); toast('Erreur import : '+err.message,'error'); }
});

function readExcelFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{ const wb=XLSX.read(e.target.result,{type:'array',cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; resolve(XLSX.utils.sheet_to_json(ws,{header:1,defval:''})); }
      catch(err){reject(err);}
    };
    reader.onerror=()=>reject(new Error('Lecture impossible'));
    reader.readAsArrayBuffer(file);
  });
}

function analyzeData(rows){
  if(!rows||!rows.length) return [];
  const legend=buildLegend(rows);
  const userRowIdx=findUserRow(rows); if(userRowIdx===-1) return [];
  const dateRowIdx=findDateRow(rows,userRowIdx); if(dateRowIdx===-1) return [];
  const dateRow=rows[dateRowIdx], userRow=rows[userRowIdx];
  const results=[];
  for(let col=0;col<dateRow.length;col++){
    const rawDate=dateRow[col], rawCode=userRow[col];
    if(!rawDate||!rawCode) continue;
    const date=parseExcelDate(rawDate); if(!date) continue;
    const code=String(rawCode).trim().toUpperCase(); if(!code) continue;
    const status=resolveStatus(code,legend);
    if(status) results.push({date:fmt(date),status,code});
  }
  return applyBusinessRules(results);
}

function buildLegend(rows){
  const legend={};
  const kw=['MEMO','CODE','CODES','N°','LÉGENDE','LEGENDE'];
  let start=-1;
  for(let i=rows.length-1;i>=Math.max(0,rows.length-30);i--){
    if(kw.some(k=>rows[i].join(' ').toUpperCase().includes(k))){start=i;break;}
  }
  const s=start>=0?start:Math.max(0,rows.length-20);
  for(let i=s;i<rows.length;i++){
    const row=rows[i];
    for(let j=0;j<row.length-1;j++){
      const cell=String(row[j]).trim(), next=String(row[j+1]).trim().toLowerCase();
      if(!cell||!next) continue;
      const status=guessStatusFromLabel(next);
      if(status) legend[cell.toUpperCase()]=status;
    }
  }
  return legend;
}

function guessStatusFromLabel(l){
  if(l.includes('nuit')||l.includes('night')) return 'nuit';
  if(l.includes('mn')||l.includes('montée')||l.includes('montee')) return 'mn';
  if(l.includes('jour')||l.includes('day')||l.includes('matin')) return 'jour';
  if(l.includes('repos')||l.includes('rest')) return 'repos';
  if(l.includes('congé')||l.includes('conge')||l.includes('vacance')) return 'CA';
  return null;
}

function resolveStatus(code,legend){
  if(legend[code]) return legend[code];
  const c=code.toLowerCase();
  if(c==='mn'||c.includes('montee')||c.includes('montée')) return 'mn';
  if(c==='n'||/^n\d+$/.test(c)) return 'nuit';
  if(c==='j'||/^j\d+$/.test(c)) return 'jour';
  if(c==='r'||c==='rep') return 'repos';
  if(c==='ca') return 'CA';
  if(c==='ru') return 'RU';
  if(c==='rp') return 'RP';
  if(c==='rn') return 'RN';
  if(c.includes('nuit')) return 'nuit';
  if(c.includes('jour')) return 'jour';
  if(/^[nj]\d+/.test(c)) return c.startsWith('n')?'nuit':'jour';
  return null;
}

function findUserRow(rows){
  let best=0,idx=-1;
  const p=/^[A-Z]{1,4}\d{0,4}$/;
  rows.forEach((row,i)=>{
    let score=0; row.forEach(cell=>{ const s=String(cell).trim().toUpperCase(); if(p.test(s)&&s.length>=1&&s.length<=6) score++; });
    if(score>best){best=score;idx=i;}
  });
  return best>=3?idx:-1;
}

function findDateRow(rows,userRowIdx){
  for(let delta=1;delta<=5;delta++){
    for(const sign of[-1,1]){
      const idx=userRowIdx+sign*delta;
      if(idx<0||idx>=rows.length) continue;
      let cnt=0; rows[idx].forEach(c=>{if(parseExcelDate(c)) cnt++;});
      if(cnt>=15) return idx;
    }
  }
  return -1;
}

function parseExcelDate(val){
  if(!val) return null;
  if(val instanceof Date&&!isNaN(val)) return val;
  if(typeof val==='number'&&val>40000&&val<60000){
    const d=new Date(Math.round((val-25569)*86400*1000)); if(!isNaN(d)) return d;
  }
  const s=String(val).trim();
  const pats=[/^(\d{2})\/(\d{2})\/(\d{4})$/,/^(\d{4})-(\d{2})-(\d{2})$/,/^(\d{2})-(\d{2})-(\d{4})$/];
  for(const p of pats){
    const m=s.match(p); if(!m) continue;
    let y,mo,d;
    if(p.source.startsWith('^(\\d{4})'))[,y,mo,d]=m; else[,d,mo,y]=m;
    const dt=new Date(+y,+mo-1,+d); if(!isNaN(dt)) return dt;
  }
  return null;
}

function applyBusinessRules(entries){
  entries.forEach(e=>{
    // MN = travaille nuit CE soir → pas besoin d'ajouter MN le lendemain
    // (c'est déjà le jour du travail)
    if(e.status==='jour') e.note='Pause 12h-13h';
  });
  return entries;
}

async function importSchedule(entries){
  for(let i=0;i<entries.length;i+=20){
    await Promise.all(entries.slice(i,i+20).map(e=>saveEntry(e.date,e.status,e.note||null,true)));
  }
}

// ── Init ─────────────────────────────────────────────────
initAuth();
