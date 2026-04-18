/* MyShift AI — app.js v20260418c */
'use strict';
var SUPABASE_URL = 'https://thfxuliapdacxwdpbnca.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZnh1bGlhcGRhY3h3ZHBibmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzAwMzQsImV4cCI6MjA5MjAwNjAzNH0.iIB_0t8SSF3pR3f-4rcUtYJz6cbS892LBpPdh_7wDuM';
var BASE_RATE    = 2093.06;
var RATES_DEF    = { jour:35, nuit:82, mn:15 };
var MONTHS       = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
var WEEKDAYS     = ['DI/LU','LU/MA','MA/ME','ME/JE','JE/VE','VE/SA','SA/DI'];
var CUSTOM_CODES = ['OCP','Férié','Formation','Stage','Maladie','Grève'];

var sb=null, currentUser=null, selectedDate=null;
var currentMonth=new Date().getMonth(), currentYear=new Date().getFullYear();
var entries={}, rates={jour:35,nuit:82,mn:15,base:2093.06}, maxConges={CA:24,RU:12,RP:12};

function gid(id){return document.getElementById(id);}
function qs(s){return document.querySelector(s);}
function qsa(s){return Array.from(document.querySelectorAll(s));}
function pad(n){return String(n).padStart(2,'0');}
function keyOf(y,m,d){return y+'-'+pad(m+1)+'-'+pad(d);}
function parseDK(k){var p=k.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function fmtM(n){return n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toast(msg){var t=gid('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('show');},2400);}
function openM(id){document.getElementById(id).showModal();}
function closeM(id){var d=document.getElementById(id);if(d&&d.open)d.close();}

/* THEME */
function applyTheme(th){document.documentElement.setAttribute('data-theme',th);gid('themeToggle').textContent=th==='dark'?'◐':'◑';}
gid('themeToggle').addEventListener('click',function(){var cur=document.documentElement.getAttribute('data-theme');applyTheme(cur==='dark'?'light':'dark');});

/* SUPABASE */
function initSB(){
  try{
    if(window.supabase&&window.supabase.createClient){
      sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    }
  }catch(e){console.error('Supabase init',e);}
}

/* AUTH */
function doLogin(){
  var email=gid('email').value.trim(), pw=gid('password').value, msg=gid('authMsg');
  if(!email||!pw){msg.textContent='Remplissez email et mot de passe.';return;}
  if(!sb){msg.textContent='Serveur non disponible.';return;}
  gid('loginBtn').disabled=true; gid('loginBtn').textContent='…'; msg.textContent='';
  sb.auth.signInWithPassword({email:email,password:pw}).then(function(res){
    if(res.error){msg.textContent=res.error.message;}
    else{currentUser=res.data.user;enterApp();}
  }).catch(function(e){msg.textContent='Erreur: '+e.message;
  }).finally(function(){gid('loginBtn').disabled=false;gid('loginBtn').textContent='Connexion';});
}
function doRegister(){
  var email=gid('email').value.trim(), pw=gid('password').value, msg=gid('authMsg');
  if(!email||!pw){msg.textContent='Remplissez email et mot de passe.';return;}
  if(!sb){msg.textContent='Serveur non disponible.';return;}
  gid('registerBtn').disabled=true; gid('registerBtn').textContent='…';
  sb.auth.signUp({email:email,password:pw}).then(function(res){
    if(res.error)msg.textContent=res.error.message;
    else msg.textContent='Compte créé ! Vérifiez votre email.';
  }).catch(function(e){msg.textContent='Erreur: '+e.message;
  }).finally(function(){gid('registerBtn').disabled=false;gid('registerBtn').textContent='Créer un compte';});
}
gid('loginBtn').addEventListener('click',doLogin);
gid('registerBtn').addEventListener('click',doRegister);
gid('email').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});
gid('password').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});

/* ENTER APP */
function enterApp(){
  gid('authScreen').classList.add('hidden');
  gid('appScreen').classList.remove('hidden');
  if(currentUser) gid('topbarUser').textContent=currentUser.email;
  loadAllEntries().then(function(){buildWeekdayHeader();renderCalendar();updateStats();});
}

/* TABS */
qsa('.tab-btn').forEach(function(btn){
  btn.addEventListener('click',function(){
    qsa('.tab-btn').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    var tab=btn.getAttribute('data-tab');
    gid('viewToday').classList.toggle('hidden',tab!=='today');
    gid('viewStats').classList.toggle('hidden',tab!=='stats');
    if(tab==='stats')updateStats();
  });
});

/* NAVIGATION MOIS */
gid('prevMonth').addEventListener('click',function(){currentMonth--;if(currentMonth<0){currentMonth=11;currentYear--;}selectedDate=null;renderCalendar();clearDetail();});
gid('nextMonth').addEventListener('click',function(){currentMonth++;if(currentMonth>11){currentMonth=0;currentYear++;}selectedDate=null;renderCalendar();clearDetail();});

/* CALENDRIER */
function buildWeekdayHeader(){
  var wdh=gid('weekdayHeader'); wdh.innerHTML='';
  WEEKDAYS.forEach(function(w){var d=document.createElement('div');d.className='wd';d.textContent=w;wdh.appendChild(d);});
}

function renderCalendar(){
  gid('monthName').textContent=MONTHS[currentMonth];
  gid('monthYear').textContent=String(currentYear);
  var grid=gid('calendarGrid'); grid.innerHTML='';
  var first=new Date(currentYear,currentMonth,1);
  var dim=new Date(currentYear,currentMonth+1,0).getDate();
  var offset=(first.getDay()+6)%7;
  var today=new Date();
  for(var i=0;i<42;i++){
    var dayNum=i-offset+1;
    var cell=document.createElement('div');
    if(dayNum<1||dayNum>dim){cell.className='day empty';grid.appendChild(cell);continue;}
    var dk=keyOf(currentYear,currentMonth,dayNum);
    var entry=entries[dk]||{};
    var status=entry.status||'';
    cell.className='day'+(status?' s-'+status:'');
    if(dayNum===today.getDate()&&currentMonth===today.getMonth()&&currentYear===today.getFullYear())cell.classList.add('today');
    if(dk===selectedDate)cell.classList.add('selected');
    var lbl=statusLbl(status,entry.ctype);
    cell.innerHTML='<div class="day-inner"><span class="day-num">'+dayNum+'</span>'+(lbl?'<span class="day-lbl">'+lbl+'</span>':'')+'</div>'+(entry.note?'<span class="day-note">📝</span>':'');
    (function(dateKey){cell.addEventListener('click',function(){selectDay(dateKey);});})(dk);
    grid.appendChild(cell);
  }
  updateMonthStats();
}

function statusLbl(s,ct){
  var m={jour:'JOUR',nuit:'NUIT',mn:'MN',repos:'REPOS',conges:ct||'CONGÉ',ca:'CA',ru:'RU',rp:'RP',rn:'RN'};
  return m[s]||(s?s.toUpperCase():'');
}

/* SELECT DAY */
function selectDay(dk){
  selectedDate=dk;
  var d=parseDK(dk), entry=entries[dk]||{};
  var cap=d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  gid('detailDate').textContent=cap.charAt(0).toUpperCase()+cap.slice(1);
  gid('detailStatus').textContent=statusLbl(entry.status,entry.ctype)||'LIBRE';
  var sal=daySal(entry.status);
  var noteHtml=entry.note
    ?'<div class="note-card"><strong>Note</strong><p>'+escH(entry.note)+'</p><div class="note-actions"><button class="btn btn-ghost" onclick="openNoteModal()">Modifier</button><button class="btn btn-ghost danger" onclick="deleteNote()">Supprimer</button></div></div>'
    :'<div class="note-card"><strong>Aucune note</strong><div class="note-actions"><button class="btn btn-primary" onclick="openNoteModal()">+ Ajouter</button></div></div>';
  gid('detailContent').innerHTML=
    '<div class="salary-row"><span>Gain estimé du jour</span><strong>'+fmtM(sal)+'</strong></div>'+
    '<div class="salary-row"><span>Total mois estimé</span><strong style="font-size:15px">'+fmtM(monthTotal())+'</strong></div>'+
    noteHtml;
  renderCalendar();
}
function clearDetail(){gid('detailDate').textContent='Aucun jour sélectionné';gid('detailStatus').textContent='—';gid('detailContent').innerHTML='<p class="muted-hint">Touchez une case du calendrier.</p>';}
function daySal(s){return s==='jour'?rates.jour:s==='nuit'?rates.nuit:s==='mn'?rates.mn:0;}
function monthTotal(){
  var t=rates.base, keys=Object.keys(entries);
  for(var i=0;i<keys.length;i++){var d=parseDK(keys[i]);if(d.getMonth()!==currentMonth||d.getFullYear()!==currentYear)continue;t+=daySal(entries[keys[i]].status);}
  return t;
}
function updateMonthStats(){
  var j=0,n=0,mn=0,keys=Object.keys(entries);
  for(var i=0;i<keys.length;i++){var d=parseDK(keys[i]);if(d.getMonth()!==currentMonth||d.getFullYear()!==currentYear)continue;var s=entries[keys[i]].status;if(s==='jour')j++;if(s==='nuit')n++;if(s==='mn')mn++;}
  gid('countJ').textContent=j; gid('countN').textContent=n; gid('countMN').textContent=mn;
  gid('monthSalary').textContent=fmtM(monthTotal());
}

/* STATS */
function updateStats(){
  var j=0,n=0,mn=0,sal=0,cCA=0,cRU=0,cRP=0,cRN=0,keys=Object.keys(entries);
  for(var i=0;i<keys.length;i++){
    var d=parseDK(keys[i]); if(d.getFullYear()!==currentYear)continue;
    var e=entries[keys[i]]; var s=e.status||''; var ct=(e.ctype||'').toUpperCase();
    if(s==='jour'){j++;sal+=rates.jour;} if(s==='nuit'){n++;sal+=rates.nuit;} if(s==='mn'){mn++;sal+=rates.mn;}
    if(ct==='CA')cCA++; if(ct==='RU')cRU++; if(ct==='RP')cRP++; if(ct==='RN')cRN++;
  }
  gid('totalJ').textContent=j; gid('totalN').textContent=n; gid('totalMN').textContent=mn;
  gid('yearSalary').textContent=fmtM(rates.base*12+sal);
  gid('ctCA').textContent=cCA; gid('ctRU').textContent=cRU; gid('ctRP').textContent=cRP;
  gid('cCA').textContent=Math.max(0,maxConges.CA-cCA);
  gid('cRU').textContent=Math.max(0,maxConges.RU-cRU);
  gid('cRP').textContent=Math.max(0,maxConges.RP-cRP);
  gid('cRN').textContent=cRN;
}

/* DOCK */
qsa('.dock-btn[data-status]').forEach(function(btn){
  btn.addEventListener('click',function(){
    if(!selectedDate){toast("Sélectionnez un jour d'abord");return;}
    var s=btn.getAttribute('data-status');
    if(s==='conges'){openM('congesModal');return;}
    saveEntry(selectedDate,{status:s,ctype:null});
    toast(statusLbl(s)+' enregistré');
  });
});
gid('noteBtn').addEventListener('click',function(){if(!selectedDate){toast('Sélectionnez un jour');return;}openNoteModal();});
gid('otherBtn').addEventListener('click',function(){if(!selectedDate){toast('Sélectionnez un jour');return;}openM('otherModal');});
gid('clearBtn').addEventListener('click',function(){if(!selectedDate){toast('Sélectionnez un jour');return;}saveEntry(selectedDate,{status:null,note:'',ctype:null});toast('Jour effacé');});

/* CONGÉS */
gid('closeConges').addEventListener('click',function(){closeM('congesModal');});
gid('cancelConges').addEventListener('click',function(){closeM('congesModal');});
qsa('[data-ctype]').forEach(function(btn){
  btn.addEventListener('click',function(){
    if(!selectedDate)return;
    var ct=btn.getAttribute('data-ctype');
    saveEntry(selectedDate,{status:'conges',ctype:ct});
    closeM('congesModal'); toast('Congé '+ct+' enregistré');
  });
});

/* NOTES */
function openNoteModal(){var e=entries[selectedDate]||{};gid('noteText').value=e.note||'';openM('noteModal');}
function deleteNote(){var e=Object.assign({},entries[selectedDate]||{});delete e.note;saveEntry(selectedDate,e);toast('Note supprimée');}
window.openNoteModal=openNoteModal; window.deleteNote=deleteNote;
gid('saveNoteBtn').addEventListener('click',function(){var note=gid('noteText').value.trim();saveEntry(selectedDate,{note:note});closeM('noteModal');toast('Note sauvegardée');});
gid('closeNote').addEventListener('click',function(){closeM('noteModal');});
gid('cancelNote').addEventListener('click',function(){closeM('noteModal');});

/* AUTRE */
gid('closeOther').addEventListener('click',function(){closeM('otherModal');});
gid('cancelOther').addEventListener('click',function(){closeM('otherModal');});
(function(){
  var g=gid('customCodes'); g.innerHTML='';
  CUSTOM_CODES.forEach(function(code){
    var b=document.createElement('button'); b.className='code-btn'; b.textContent=code;
    b.addEventListener('click',function(){if(!selectedDate)return;saveEntry(selectedDate,{status:code.toLowerCase(),ctype:null});closeM('otherModal');toast(code+' enregistré');});
    g.appendChild(b);
  });
})();

/* SETTINGS */
gid('settingsBtn').addEventListener('click',function(){gid('rateBase').value=rates.base;gid('rateJour').value=rates.jour;gid('rateNuit').value=rates.nuit;gid('rateMN').value=rates.mn;gid('maxCA').value=maxConges.CA;gid('maxRU').value=maxConges.RU;gid('maxRP').value=maxConges.RP;openM('settingsModal');});
gid('saveSettingsBtn').addEventListener('click',function(){rates.base=parseFloat(gid('rateBase').value)||BASE_RATE;rates.jour=parseFloat(gid('rateJour').value)||35;rates.nuit=parseFloat(gid('rateNuit').value)||82;rates.mn=parseFloat(gid('rateMN').value)||15;maxConges.CA=parseInt(gid('maxCA').value)||24;maxConges.RU=parseInt(gid('maxRU').value)||12;maxConges.RP=parseInt(gid('maxRP').value)||12;updateMonthStats();updateStats();if(selectedDate)selectDay(selectedDate);closeM('settingsModal');toast('Paramètres sauvegardés');});
gid('closeSettings').addEventListener('click',function(){closeM('settingsModal');});
gid('cancelSettings').addEventListener('click',function(){closeM('settingsModal');});

/* IMPORT */
gid('importBtn').addEventListener('click',function(){gid('fileInput').click();});
gid('fileInput').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];if(f)handleImport(f);e.target.value='';});
function handleImport(file){
  file.arrayBuffer().then(function(ab){
    var wb=XLSX.read(ab,{type:'array'});
    var ws=wb.Sheets[wb.SheetNames[0]];
    var rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    var list=applyMNLogic(extractSchedule(rows)); var count=0;
    list.forEach(function(item){saveEntry(item.date,{status:item.status,ctype:item.ctype||null});count++;});
    toast(count+' entrées importées');
  }).catch(function(){toast('Impossible de lire ce fichier');});
}
function extractSchedule(rows){
  var best=-1,bscore=-1;
  for(var i=0;i<rows.length;i++){var sc=0,row=rows[i]||[];for(var j=0;j<row.length;j++){if(/[A-Z]{1,3}\d{1,3}|^(J|N|MN|R|CA|RU|RP|RN)$/i.test(String(row[j])))sc++;}if(sc>bscore){bscore=sc;best=i;}}
  if(best<0)return[];
  var row=rows[best]||[], hdr=rows[Math.max(0,best-1)]||[];
  var dates=hdr.map(function(c){var m=String(c).match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);if(!m)return null;var y=m[3]?(m[3].length===2?2000+ +m[3]: +m[3]):currentYear;return keyOf(y,+m[2]-1,+m[1]);});
  var res=[];
  row.forEach(function(cell,idx){
    var v=String(cell).trim().toUpperCase(),s=null,ct=null;
    if(/^N\d*$/.test(v)||v==='NUIT')s='nuit';
    else if(/^J\d*$/.test(v)||v==='JOUR')s='jour';
    else if(/^MN/.test(v))s='mn';
    else if(/^R(EPOS)?$/.test(v))s='repos';
    else if(v==='CA'){s='conges';ct='CA';}else if(v==='RU'){s='conges';ct='RU';}
    else if(v==='RP'){s='conges';ct='RP';}else if(v==='RN'){s='conges';ct='RN';}
    else if(/^CONG/.test(v))s='conges';
    if(s&&dates[idx])res.push({date:dates[idx],status:s,ctype:ct});
  });
  return res;
}
function applyMNLogic(list){
  var m={};list.forEach(function(e){m[e.date]=e;});
  var d=Object.keys(m).sort();
  d.forEach(function(dk,i){
    if(m[dk].status!=='nuit')return;
    var cur=parseDK(dk); if(cur.getDay()===0)return;
    var nd=d[i+1]; if(nd&&!m[nd+'_x'])m[nd]={date:nd,status:'mn',ctype:null};
  });
  return Object.values(m);
}

/* SAVE + SYNC */
function saveEntry(dk,patch){
  var prev=entries[dk]||{}, next=Object.assign({},prev,patch);
  if(!next.status&&!next.note&&!next.ctype)delete entries[dk]; else entries[dk]=next;
  renderCalendar(); if(selectedDate===dk)selectDay(dk); updateStats();
  syncEntry(dk,next);
}
function syncEntry(dk,entry){
  if(!sb||!currentUser)return;
  var payload={user_id:currentUser.id,date:dk,status:entry.status||null,note:entry.note||null,ctype:entry.ctype||null,imported:true};
  sb.from('shifts').upsert(payload,{onConflict:'user_id,date'}).then(function(r){
    if(r.error){var fb={user_id:currentUser.id,date:dk,status:entry.status||null,note:entry.note||null};sb.from('shifts').upsert(fb,{onConflict:'user_id,date'}).catch(function(){});}
  }).catch(function(){});
}
function loadAllEntries(){
  if(!sb||!currentUser)return Promise.resolve();
  return sb.from('shifts').select('*').eq('user_id',currentUser.id).then(function(res){
    if(!res.error&&res.data)res.data.forEach(function(row){if(row.date)entries[row.date]={status:row.status||null,note:row.note||null,ctype:row.ctype||null};});
  }).catch(function(){});
}


/* ═══════════════════════════════════════════
   EXPORT EXCEL MENSUEL
═══════════════════════════════════════════ */
gid('exportBtn').addEventListener('click', function() { exportMonthExcel(); });

function exportMonthExcel() {
  var monthName = MONTHS[currentMonth];
  var year      = currentYear;
  var dim       = new Date(year, currentMonth + 1, 0).getDate();

  // En-têtes
  var headers = ['Date', 'Jour', 'Statut', 'Type Congé', 'Gain Jour (€)', 'Note', 'Salaire Base (€)', 'Total Estimé (€)'];
  var rows    = [headers];

  var totalSal = rates.base;
  var countJ = 0, countN = 0, countMN = 0;

  for (var d = 1; d <= dim; d++) {
    var dk     = keyOf(year, currentMonth, d);
    var date   = new Date(year, currentMonth, d);
    var entry  = entries[dk] || {};
    var status = entry.status || '';
    var sal    = daySal(status);
    totalSal  += sal;
    if (status === 'jour') countJ++;
    if (status === 'nuit') countN++;
    if (status === 'mn')   countMN++;

    var dateStr = date.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long' });
    rows.push([
      dateStr,
      d,
      statusLbl(status, entry.ctype) || 'LIBRE',
      entry.ctype || '',
      sal > 0 ? sal.toFixed(2) : '',
      entry.note || '',
      d === 1 ? rates.base.toFixed(2) : '',
      d === dim ? totalSal.toFixed(2) : ''
    ]);
  }

  // Ligne récap
  rows.push([]);
  rows.push(['RÉCAPITULATIF', '', '', '', '', '', '', '']);
  rows.push(['Jours travaillés', countJ, 'Nuits', countN, 'MN', countMN, 'Total estimé', totalSal.toFixed(2) + ' €']);

  // Créer le workbook avec SheetJS
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(rows);

  // Largeurs colonnes
  ws['!cols'] = [
    { wch: 28 }, { wch: 6 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, monthName + ' ' + year);
  XLSX.writeFile(wb, 'MyShift_' + monthName + '_' + year + '.xlsx');
  toast('Export ' + monthName + ' ' + year + ' téléchargé ✓');
}

/* ═══════════════════════════════════════════
   NOTIFICATIONS PUSH (vendredi rappel)
═══════════════════════════════════════════ */
gid('notifBtn').addEventListener('click', function() { setupNotifications(); });

function setupNotifications() {
  if (!('Notification' in window)) {
    toast('Notifications non supportées sur ce navigateur');
    return;
  }
  if (Notification.permission === 'granted') {
    scheduleWeeklyReminder();
    toast('Notifications activées ✓ (rappel chaque vendredi)');
  } else if (Notification.permission === 'denied') {
    toast('Notifications bloquées — autorisez-les dans les réglages');
  } else {
    Notification.requestPermission().then(function(perm) {
      if (perm === 'granted') {
        scheduleWeeklyReminder();
        toast('Notifications activées ✓ (rappel chaque vendredi)');
      } else {
        toast('Permission refusée');
      }
    });
  }
}

function scheduleWeeklyReminder() {
  // Calcul du prochain vendredi à 18h
  var now  = new Date();
  var day  = now.getDay(); // 0=dim … 5=ven
  var diff = (5 - day + 7) % 7 || 7; // jours jusqu'au prochain vendredi
  var next = new Date(now);
  next.setDate(now.getDate() + diff);
  next.setHours(18, 0, 0, 0);
  var delay = next.getTime() - now.getTime();

  // Première notification dans X ms, puis toutes les semaines
  clearTimeout(scheduleWeeklyReminder._t);
  scheduleWeeklyReminder._t = setTimeout(function fireReminder() {
    sendReminderNotif();
    scheduleWeeklyReminder._t = setTimeout(fireReminder, 7 * 24 * 60 * 60 * 1000);
  }, delay);

  // Persister l'activation dans localStorage
  localStorage.setItem('ms_notif', 'on');
  updateNotifBtn(true);
}

function sendReminderNotif() {
  if (Notification.permission !== 'granted') return;
  var stats = getNextWeekStats();
  new Notification('MyShift AI — Planning semaine', {
    body: stats,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><text y="36" font-size="36">📅</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><text y="36" font-size="36">📅</text></svg>'
  });
}

function getNextWeekStats() {
  var now   = new Date();
  var lines = [];
  for (var i = 1; i <= 7; i++) {
    var d   = new Date(now);
    d.setDate(now.getDate() + i);
    var dk  = keyOf(d.getFullYear(), d.getMonth(), d.getDate());
    var e   = entries[dk] || {};
    var lbl = statusLbl(e.status, e.ctype) || 'Libre';
    var day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
    lines.push(day + ' : ' + lbl);
  }
  return lines.join('\n');
}

function updateNotifBtn(active) {
  var btn = gid('notifBtn');
  btn.textContent = active ? '🔔' : '🔕';
  btn.title = active ? 'Notifications actives (cliquer pour désactiver)' : 'Activer les notifications';
  if (active) {
    btn.style.color = 'var(--cyan)';
    btn.style.borderColor = 'rgba(61,217,255,.4)';
  } else {
    btn.style.color = '';
    btn.style.borderColor = '';
  }
}

// Réactiver les notifications au démarrage si elles étaient activées
(function checkSavedNotif() {
  if (localStorage.getItem('ms_notif') === 'on' && Notification.permission === 'granted') {
    scheduleWeeklyReminder();
    updateNotifBtn(true);
  }
})();

/* START */
(function(){
  var saved=localStorage.getItem('ms_theme');
  applyTheme(saved||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
  initSB();
  if(sb){
    sb.auth.getSession().then(function(res){
      if(res.data&&res.data.session&&res.data.session.user){currentUser=res.data.session.user;enterApp();}
    }).catch(function(){});
  }
})();
