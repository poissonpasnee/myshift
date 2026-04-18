const SUPABASE_URL = 'https://thfxuliapdacxwdpbnca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZnh1bGlhcGRhY3h3ZHBibmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzAwMzQsImV4cCI6MjA5MjAwNjAzNH0.iIB_0t8SSF3pR3f-4rcUtYJz6cbS892LBpPdh_7wDuM';

const BASE_RATE   = 2093.06;
const RATES_DEF   = { jour:35, nuit:82, mn:15 };
const MONTHS      = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const WEEKDAYS    = ['DI/LU','LU/MA','MA/ME','ME/JE','JE/VE','VE/SA','SA/DI'];
const CUSTOM_CODES= ['OCP','Férié','Formation','Stage','Maladie','Grève'];
const CONGES_MAX  = { CA:24, RU:12, RP:12 };

const st = {
  sb: null, user: null, selectedDate: null,
  month: new Date().getMonth(), year: new Date().getFullYear(),
  theme: 'dark',
  rates: { ...RATES_DEF, base: BASE_RATE },
  maxConges: { ...CONGES_MAX },
  entries: new Map(),   // dateKey -> { status, note, ctype }
};

const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2,'0');
const keyOf = (y,m,d) => `${y}-${pad(m+1)}-${pad(d)}`;
const parseDK = (k) => { const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d); };
const fmt€ = (n) => `${n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
const esc = (s) => String(s||'').replace(/[&<>"']/g,m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),2200);
}
function openM(id){ document.getElementById(id).showModal(); }
function closeM(id){ const d=document.getElementById(id); if(d.open) d.close(); }

/* ── THEME ── */
function applyTheme(th){ st.theme=th; document.documentElement.dataset.theme=th; $('#themeToggle').textContent=th==='dark'?'◐':'◑'; }
$('#themeToggle').addEventListener('click',()=>applyTheme(st.theme==='dark'?'light':'dark'));

/* ── SUPABASE ── */
function initSB(){
  try {
    if(window.supabase?.createClient && !SUPABASE_URL.includes('YOUR_SUPABASE'))
      st.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch(e) { console.warn('Supabase init error',e); }
}

/* ── AUTH ── */
async function login(){
  if(!st.sb) return toast('Supabase non disponible');
  const email=$('#email').value.trim(), pw=$('#password').value;
  if(!email||!pw) return toast('Email et mot de passe requis');
  const {data,error} = await st.sb.auth.signInWithPassword({email,password:pw});
  if(error) return $('#authMsg').textContent=error.message;
  st.user=data.user; enterApp();
}
async function register(){
  if(!st.sb) return toast('Supabase non disponible');
  const email=$('#email').value.trim(), pw=$('#password').value;
  if(!email||!pw) return toast('Remplissez les champs');
  const {error}=await st.sb.auth.signUp({email,password:pw});
  if(error) return $('#authMsg').textContent=error.message;
  $('#authMsg').textContent='Compte créé — vérifiez votre email.';
}

/* ── ENTER APP ── */
async function enterApp(){
  $('#authScreen').classList.add('hidden');
  $('#appScreen').classList.remove('hidden');
  if(st.user) $('#topbarUser').textContent=st.user.email;
  await loadAllEntries();
  renderCalendar(); updateStats();
}

/* ── TABS ── */
$$('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const tab=btn.dataset.tab;
  $('#viewToday').classList.toggle('hidden',tab!=='today');
  $('#viewStats').classList.toggle('hidden',tab!=='stats');
}));

/* ── NAVIGATION MOIS ── */
$('#prevMonth').addEventListener('click',()=>{
  st.month--; if(st.month<0){st.month=11;st.year--;}
  st.selectedDate=null; renderCalendar(); clearDetail();
});
$('#nextMonth').addEventListener('click',()=>{
  st.month++; if(st.month>11){st.month=0;st.year++;}
  st.selectedDate=null; renderCalendar(); clearDetail();
});

/* ── CALENDRIER ── */
const WD_LABELS = ['Di','Lu','Ma','Me','Je','Ve','Sa'];

function buildWeekdayHeader(){
  const wdh=$('#weekdayHeader'); wdh.innerHTML='';
  // Colonnes = paires de nuits: Di/Lu  Lu/Ma  Ma/Me  Me/Je  Je/Ve  Ve/Sa  Sa/Di
  WEEKDAYS.forEach(w=>{ const d=document.createElement('div'); d.className='wd'; d.textContent=w; wdh.appendChild(d); });
}

function renderCalendar(){
  $('#monthName').textContent=MONTHS[st.month];
  $('#monthYear').textContent=String(st.year);
  const grid=$('#calendarGrid'); grid.innerHTML='';
  const first=new Date(st.year,st.month,1);
  const daysInMonth=new Date(st.year,st.month+1,0).getDate();
  // offset: Monday-first — day 0=Mon…6=Sun
  let offset=(first.getDay()+6)%7;
  const today=new Date();
  for(let i=0;i<42;i++){
    const dayNum=i-offset+1;
    const cell=document.createElement('div');
    if(dayNum<1||dayNum>daysInMonth){ cell.className='day empty'; grid.appendChild(cell); continue; }
    const dateKey=keyOf(st.year,st.month,dayNum);
    const entry=st.entries.get(dateKey)||{};
    const status=entry.status||'';
    cell.className='day'+(status?' s-'+status:'');
    if(dayNum===today.getDate()&&st.month===today.getMonth()&&st.year===today.getFullYear()) cell.classList.add('today');
    if(dateKey===st.selectedDate) cell.classList.add('selected');
    const lbl=statusLabel(status,entry.ctype);
    cell.innerHTML=`<div class="day-inner"><span class="day-num">${dayNum}</span>${lbl?`<span class="day-lbl">${lbl}</span>`:''}</div>${entry.note?'<span class="day-note">📝</span>':''}`;
    cell.addEventListener('click',()=>selectDay(dateKey));
    grid.appendChild(cell);
  }
  updateMonthStats();
}

function statusLabel(status,ctype){
  const map={jour:'JOUR',nuit:'NUIT',mn:'MN',repos:'REPOS',conges:ctype||'CONGÉ',ca:'CA',ru:'RU',rp:'RP',rn:'RN'};
  return map[status]||'';
}

/* ── SELECT DAY ── */
function selectDay(dateKey){
  st.selectedDate=dateKey;
  const d=parseDK(dateKey);
  const entry=st.entries.get(dateKey)||{};
  const cap=d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  $('#detailDate').textContent=cap.charAt(0).toUpperCase()+cap.slice(1);
  $('#detailStatus').textContent=statusLabel(entry.status,entry.ctype)||'LIBRE';
  const sal=daySalary(entry.status);
  $('#detailContent').innerHTML=`
    <div class="salary-row"><span>Gain du jour</span><strong>${fmt€(sal)}</strong></div>
    <div class="salary-row" style="font-size:13px"><span>Total estimé du mois</span><strong style="font-size:15px">${fmt€(monthTotal())}</strong></div>
    ${entry.note?`<div class="note-card"><strong>Note</strong><p>${esc(entry.note)}</p><div class="note-actions"><button class="btn btn-ghost" id="editNoteBtn">Modifier</button><button class="btn btn-ghost danger" id="delNoteBtn">Supprimer</button></div></div>`:`<div class="note-card"><strong>Aucune note</strong><p class="muted-hint" style="font-size:12px">Aucune note pour ce jour.</p><div class="note-actions"><button class="btn btn-primary" id="addNoteBtn">+ Ajouter</button></div></div>`}
  `;
  $('#editNoteBtn')?.addEventListener('click',openNoteModal);
  $('#delNoteBtn')?.addEventListener('click',deleteNote);
  $('#addNoteBtn')?.addEventListener('click',openNoteModal);
  // re-render pour highlight
  $$('.day').forEach(el=>el.classList.remove('selected'));
  $$('.day').forEach((el,i)=>{ if(el.querySelector('.day-num')?.textContent==String(parseDK(dateKey).getDate())) {
    // match by index in grid
  } });
  renderCalendar();
}

function clearDetail(){
  $('#detailDate').textContent='Aucun jour sélectionné';
  $('#detailStatus').textContent='—';
  $('#detailContent').innerHTML='<p class="muted-hint">Touchez une case du calendrier.</p>';
}

function daySalary(status){ return ({jour:st.rates.jour,nuit:st.rates.nuit,mn:st.rates.mn})[status]||0; }

function monthTotal(){
  let t=st.rates.base;
  for(const [k,e] of st.entries){
    const d=parseDK(k); if(d.getMonth()!==st.month||d.getFullYear()!==st.year) continue;
    t+=daySalary(e.status);
  }
  return t;
}

function updateMonthStats(){
  let j=0,n=0,mn=0;
  for(const [k,e] of st.entries){
    const d=parseDK(k); if(d.getMonth()!==st.month||d.getFullYear()!==st.year) continue;
    if(e.status==='jour') j++;
    if(e.status==='nuit') n++;
    if(e.status==='mn')   mn++;
  }
  $('#countJ').textContent=j;
  $('#countN').textContent=n;
  $('#countMN').textContent=mn;
  $('#monthSalary').textContent=fmt€(monthTotal());
}

/* ── STATS ANNUELLES ── */
function updateStats(){
  let j=0,n=0,mn=0,totSal=0,takenCA=0,takenRU=0,takenRP=0,takenRN=0;
  const yr=st.year;
  for(const [k,e] of st.entries){
    const d=parseDK(k); if(d.getFullYear()!==yr) continue;
    if(e.status==='jour'){j++;totSal+=st.rates.jour;}
    if(e.status==='nuit'){n++;totSal+=st.rates.nuit;}
    if(e.status==='mn'){mn++;totSal+=st.rates.mn;}
    const ct=(e.ctype||e.status||'').toUpperCase();
    if(ct==='CA') takenCA++;
    if(ct==='RU') takenRU++;
    if(ct==='RP') takenRP++;
    if(ct==='RN') takenRN++;
  }
  const base=st.rates.base*12;
  $('#totalJ').textContent=j;
  $('#totalN').textContent=n;
  $('#totalMN').textContent=mn;
  $('#yearSalary').textContent=fmt€(base+totSal);
  $('#ctCA').textContent=takenCA; $('#ctRU').textContent=takenRU; $('#ctRP').textContent=takenRP;
  $('#cCA').textContent=Math.max(0,st.maxConges.CA-takenCA);
  $('#cRU').textContent=Math.max(0,st.maxConges.RU-takenRU);
  $('#cRP').textContent=Math.max(0,st.maxConges.RP-takenRP);
  $('#cRN').textContent=takenRN;
}

/* ── DOCK ── */
$$('.dock-btn[data-status]').forEach(btn=>btn.addEventListener('click',()=>{
  if(!st.selectedDate) return toast('Sélectionnez un jour d'abord');
  const status=btn.dataset.status;
  if(status==='conges'){ openM('congesModal'); return; }
  saveEntry(st.selectedDate,{status,ctype:null});
  toast(statusLabel(status)+' enregistré');
}));
$('#noteBtn').addEventListener('click',()=>{ if(!st.selectedDate) return toast('Sélectionnez un jour'); openNoteModal(); });
$('#otherBtn').addEventListener('click',()=>{ if(!st.selectedDate) return toast('Sélectionnez un jour'); openM('otherModal'); });
$('#clearBtn').addEventListener('click',()=>{
  if(!st.selectedDate) return toast('Sélectionnez un jour');
  saveEntry(st.selectedDate,{status:null,note:'',ctype:null});
  toast('Jour effacé');
});

/* ── CONGÉS MODAL ── */
$('#closeConges').addEventListener('click',()=>closeM('congesModal'));
$('#cancelConges').addEventListener('click',()=>closeM('congesModal'));
$$('[data-ctype]').forEach(btn=>btn.addEventListener('click',()=>{
  if(!st.selectedDate) return;
  const ctype=btn.dataset.ctype;
  saveEntry(st.selectedDate,{status:'conges',ctype});
  closeM('congesModal');
  toast(`Congé ${ctype} enregistré`);
}));

/* ── NOTES ── */
function openNoteModal(){ $('#noteText').value=st.entries.get(st.selectedDate)?.note||''; openM('noteModal'); }
function deleteNote(){
  const e={...st.entries.get(st.selectedDate)||{}};
  delete e.note; saveEntry(st.selectedDate,e); toast('Note supprimée');
}
$('#saveNoteBtn').addEventListener('click',()=>{
  const note=$('#noteText').value.trim();
  saveEntry(st.selectedDate,{note}); closeM('noteModal'); toast('Note sauvegardée');
});
$('#closeNote').addEventListener('click',()=>closeM('noteModal'));
$('#cancelNote').addEventListener('click',()=>closeM('noteModal'));

/* ── AUTRE MODAL ── */
$('#closeOther').addEventListener('click',()=>closeM('otherModal'));
$('#cancelOther').addEventListener('click',()=>closeM('otherModal'));
(function buildCustomCodes(){
  const g=$('#customCodes'); g.innerHTML='';
  CUSTOM_CODES.forEach(code=>{
    const b=document.createElement('button');
    b.className='code-btn'; b.textContent=code;
    b.addEventListener('click',()=>{ if(!st.selectedDate) return; saveEntry(st.selectedDate,{status:code.toLowerCase(),ctype:null}); closeM('otherModal'); toast(code+' enregistré'); });
    g.appendChild(b);
  });
})();

/* ── SETTINGS ── */
$('#settingsBtn').addEventListener('click',()=>{
  $('#rateBase').value=st.rates.base;
  $('#rateJour').value=st.rates.jour;
  $('#rateNuit').value=st.rates.nuit;
  $('#rateMN').value=st.rates.mn;
  $('#maxCA').value=st.maxConges.CA;
  $('#maxRU').value=st.maxConges.RU;
  $('#maxRP').value=st.maxConges.RP;
  openM('settingsModal');
});
$('#saveSettingsBtn').addEventListener('click',()=>{
  st.rates.base=parseFloat($('#rateBase').value)||BASE_RATE;
  st.rates.jour=parseFloat($('#rateJour').value)||RATES_DEF.jour;
  st.rates.nuit=parseFloat($('#rateNuit').value)||RATES_DEF.nuit;
  st.rates.mn  =parseFloat($('#rateMN').value)||RATES_DEF.mn;
  st.maxConges.CA=parseInt($('#maxCA').value)||24;
  st.maxConges.RU=parseInt($('#maxRU').value)||12;
  st.maxConges.RP=parseInt($('#maxRP').value)||12;
  updateMonthStats(); updateStats();
  if(st.selectedDate) selectDay(st.selectedDate);
  closeM('settingsModal'); toast('Paramètres sauvegardés');
});
$('#closeSettings').addEventListener('click',()=>closeM('settingsModal'));
$('#cancelSettings').addEventListener('click',()=>closeM('settingsModal'));

/* ── SAVE ENTRY (Local-First + Supabase upsert) ── */
function saveEntry(dateKey,patch){
  const prev=st.entries.get(dateKey)||{};
  const next={...prev,...patch};
  if(!next.status&&!next.note&&!next.ctype) st.entries.delete(dateKey); else st.entries.set(dateKey,next);
  renderCalendar();
  if(st.selectedDate===dateKey) selectDay(dateKey);
  updateStats();
  syncEntry(dateKey,next).catch(()=>{});
}

async function syncEntry(dateKey,entry){
  if(!st.sb||!st.user) return;
  const payload={user_id:st.user.id,date:dateKey,status:entry.status||null,note:entry.note||null,ctype:entry.ctype||null,imported:true};
  try{
    const r=await st.sb.from('shifts').upsert(payload,{onConflict:'user_id,date'});
    if(r.error) throw r.error;
  }catch(e){
    const fb={...payload}; delete fb.imported; delete fb.ctype;
    try{ await st.sb.from('shifts').upsert(fb,{onConflict:'user_id,date'}); }catch(_){}
  }
}

/* ── LOAD ALL ENTRIES ── */
async function loadAllEntries(){
  if(!st.sb||!st.user) return;
  try{
    const {data,error}=await st.sb.from('shifts').select('*').eq('user_id',st.user.id);
    if(error||!data) return;
    data.forEach(row=>{
      if(row.date) st.entries.set(row.date,{status:row.status||null,note:row.note||null,ctype:row.ctype||null});
    });
  }catch(_){}
}

/* ── IMPORT EXCEL ── */
$('#importBtn').addEventListener('click',()=>$('#fileInput').click());
$('#fileInput').addEventListener('change',e=>{ if(e.target.files[0]) handleImport(e.target.files[0]).catch(()=>toast('Impossible de lire ce fichier')); });

async function handleImport(file){
  const ab=await file.arrayBuffer();
  const wb=XLSX.read(ab,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  const entries=applyMNLogic(extractSchedule(rows));
  let count=0;
  for(const e of entries){ saveEntry(e.date,{status:e.status,ctype:e.ctype||null}); count++; }
  toast(`${count} entrées importées`);
}

function analyzeRows(rows){
  let best={row:-1,score:-1};
  for(let i=0;i<rows.length;i++){
    const row=rows[i]||[];
    const score=row.reduce((a,v)=>a+(/[A-Z]{1,3}\d{1,3}|(J|N|MN|R|CA|RTT|RP)/i.test(String(v))?1:0),0);
    if(score>best.score) best={row:i,score};
  }
  return best.row;
}

function extractSchedule(rows){
  const bestRow=analyzeRows(rows);
  const row=rows[bestRow]||[];
  const header=rows[Math.max(0,bestRow-1)]||[];
  const dates=header.map(c=>{
    const s=String(c).match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
    if(!s) return null;
    const y=s[3]?(s[3].length===2?2000+Number(s[3]):Number(s[3])):st.year;
    return keyOf(y,Number(s[2])-1,Number(s[1]));
  });
  return row.map((cell,i)=>{
    const v=String(cell).trim().toUpperCase();
    let status=null,ctype=null;
    if(/^N\d*/.test(v)||v==='NUIT') status='nuit';
    else if(/^J\d*/.test(v)||v==='JOUR') status='jour';
    else if(/^MN/.test(v)) status='mn';
    else if(/^R(EPOS)?$/.test(v)) status='repos';
    else if(/^CA$/.test(v)){status='conges';ctype='CA';}
    else if(/^RU$/.test(v)){status='conges';ctype='RU';}
    else if(/^RP$/.test(v)){status='conges';ctype='RP';}
    else if(/^RN$/.test(v)){status='conges';ctype='RN';}
    else if(/^C(ONG)?/.test(v)) status='conges';
    if(status&&dates[i]) return {date:dates[i],status,ctype};
    return null;
  }).filter(Boolean);
}

function applyMNLogic(entries){
  const byDay=new Map(entries.map(e=>[e.date,e]));
  const dates=[...byDay.keys()].sort();
  dates.forEach((d,idx)=>{
    const cur=parseDK(d);
    if(byDay.get(d)?.status!=='nuit') return;
    if(cur.getDay()===0) return; // Dimanche, pas de MN
    const nextD=dates[idx+1];
    if(nextD&&!byDay.has(nextD+'_mn')){
      byDay.set(nextD,{date:nextD,status:'mn',ctype:null});
    }
  });
  return [...byDay.values()];
}

/* ── INIT ── */
applyTheme(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
initSB();
buildWeekdayHeader();

$('#loginBtn').addEventListener('click',login);
$('#registerBtn').addEventListener('click',register);
