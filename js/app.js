const SUPABASE_URL = 'https://thfxuliapdacxwdpbnca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZnh1bGlhcGRhY3h3ZHBibmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzAwMzQsImV4cCI6MjA5MjAwNjAzNH0.iIB_0t8SSF3pR3f-4rcUtYJz6cbS892LBpPdh_7wDuM';
const BASE_RATE = 2093.06;
const DEFAULT_RATES = { jour: 35, nuit: 82, mn: 15 };
const WEEKDAYS = ['DI/LU','LU/MA','MA/ME','ME/JE','JE/VE','VE/SA','SA/DI'];
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const CUSTOM_CODES = ['OCP','Férié','Formation','Stage','Maladie','Grève'];

const state = {
  client: null,
  user: null,
  selectedDate: null,
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  theme: 'dark',
  settings: { ...DEFAULT_RATES, base: BASE_RATE },
  entries: new Map(),
  notes: new Map(),
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const keyOf = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const fmtMoney = (n) => `${n.toFixed(2).replace('.', ',')} €`;
const parseDateKey = (k) => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };

function showToast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(showToast._t); showToast._t = setTimeout(() => t.classList.remove('show'), 2200); }
function openModal(id){ document.getElementById(id).showModal(); }
function closeModal(id){ const d = document.getElementById(id); if (d.open) d.close(); }

function applyTheme(theme){ state.theme = theme; document.documentElement.dataset.theme = theme; $('#themeToggle').textContent = theme === 'dark' ? '◐' : '◑'; }
function initTheme(){ applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); $('#themeToggle').addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark')); }


function startupDiagnostics(){
  const missing = [];
  if (!window.supabase) missing.push('supabase-js');
  if (!window.XLSX) missing.push('sheetjs');
  if (missing.length) showToast('Librairies manquantes: ' + missing.join(', '));
}

function initSupabase(){
  const configured = SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('YOUR_SUPABASE') && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  if (window.supabase?.createClient && configured) {
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

async function login(){
  if (!state.client) return showToast('Supabase indisponible ou non chargé');
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) return showToast('Email et mot de passe requis');
  const { data, error } = await state.client.auth.signInWithPassword({ email, password });
  if (error) return $('#authMsg').textContent = error.message;
  state.user = data.user; $('#authScreen').classList.add('hidden'); $('#appScreen').classList.remove('hidden'); await bootstrapApp();
}

async function register(){
  if (!state.client) return showToast('Supabase indisponible ou non chargé');
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) return showToast('Email et mot de passe requis');
  const { error } = await state.client.auth.signUp({ email, password });
  if (error) return $('#authMsg').textContent = error.message;
  $('#authMsg').textContent = 'Compte créé. Vérifiez votre email.';
}

function renderWeekdayHeader(){ $('#weekdayHeader').innerHTML = WEEKDAYS.map(d => `<div>${d}</div>`).join(''); }

function getMonthMatrix(year, month){
  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(year, month + 1, 0).getDate();
  const grid = [];
  let cur = 1 - start;
  for (let r=0; r<6; r++){
    const row = [];
    for (let c=0; c<7; c++, cur++) row.push(cur);
    grid.push(row);
  }
  return { grid, days };
}

function statusLabel(status){
  return ({ jour:'JOUR', nuit:'NUIT', mn:'MN', repos:'REPOS', conges:'CONGÉS' })[status] || String(status || '');
}

function renderCalendar(){
  $('#monthName').textContent = MONTHS[state.month];
  $('#monthYear').textContent = String(state.year);
  $('#monthTitle').textContent = `${MONTHS[state.month]} ${state.year}`;
  const { grid, days } = getMonthMatrix(state.year, state.month);
  const cal = $('#calendarGrid'); cal.innerHTML = '';
  const today = new Date();
  for (const row of grid){
    for (const dayNum of row){
      const cell = document.createElement('div');
      cell.className = 'day';
      if (dayNum < 1 || dayNum > days) { cell.classList.add('muted'); cell.innerHTML = '<button tabindex="-1"></button>'; cal.appendChild(cell); continue; }
      const dateKey = keyOf(state.year, state.month, dayNum);
      const entry = state.entries.get(dateKey) || {};
      const date = new Date(state.year, state.month, dayNum);
      if (dayNum === today.getDate() && state.month === today.getMonth() && state.year === today.getFullYear()) cell.classList.add('today');
      if (state.selectedDate === dateKey) cell.classList.add('selected');
      const inner = document.createElement('button');
      inner.type = 'button';
      inner.innerHTML = `<span class="num">${dayNum}</span>${entry.note ? '<span class="note">📝</span>' : ''}${entry.status ? `<span class="status">${statusLabel(entry.status)}</span>` : ''}`;
      inner.addEventListener('click', () => selectDay(dateKey));
      cell.appendChild(inner);
      cal.appendChild(cell);
    }
  }
  updateMonthStats();
}

function computeMonthSalary(){
  let total = state.settings.base, j=0, n=0, mn=0;
  for (const [key, entry] of state.entries){
    const d = parseDateKey(key);
    if (d.getMonth() !== state.month || d.getFullYear() !== state.year) continue;
    if (entry.status === 'jour') { total += state.settings.jour; j++; }
    if (entry.status === 'nuit') { total += state.settings.nuit; n++; }
    if (entry.status === 'mn') { total += state.settings.mn; mn++; }
  }
  return { total, j, n, mn };
}

function updateMonthStats(){
  const s = computeMonthSalary();
  $('#countJ').textContent = s.j;
  $('#countN').textContent = s.n;
  $('#countMN').textContent = s.mn;
  $('#monthSalary').textContent = fmtMoney(s.total);
}

function daySalary(status){
  if (status === 'jour') return state.settings.jour;
  if (status === 'nuit') return state.settings.nuit;
  if (status === 'mn') return state.settings.mn;
  return 0;
}

function selectDay(dateKey){
  state.selectedDate = dateKey;
  const date = parseDateKey(dateKey);
  const entry = state.entries.get(dateKey) || {};
  const todayLabel = date.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  $('#detailDate').textContent = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);
  $('#detailStatus').textContent = statusLabel(entry.status || 'libre') || 'LIBRE';
  const salary = daySalary(entry.status);
  $('#detailContent').innerHTML = `
    <div class="salary-row"><span>Calcul du jour</span><strong>${fmtMoney(salary)}</strong></div>
    ${entry.note ? `<div class="note-card"><div><strong>Note</strong><p class="muted" style="white-space:pre-wrap">${escapeHtml(entry.note)}</p></div><div class="note-actions"><button class="btn btn-ghost" id="editNoteInline">Modifier</button><button class="btn btn-ghost" id="deleteNoteInline">Supprimer</button></div></div>` : '<div class="note-card"><div><strong>Aucune note</strong><p class="muted">Ajoutez une note liée à ce jour.</p></div><div class="note-actions"><button class="btn btn-primary" id="addNoteInline">+ Ajouter</button></div></div>'}
    <div class="note-card"><div><strong>Détail salaire</strong><p class="muted">Base + variables Jour / Nuit / MN.</p></div><div class="salary-row"><span>Total estimé</span><strong>${fmtMoney(state.settings.base + salary)}</strong></div></div>
  `;
  $('#editNoteInline')?.addEventListener('click', openNoteModal);
  $('#deleteNoteInline')?.addEventListener('click', deleteNote);
  $('#addNoteInline')?.addEventListener('click', openNoteModal);
  renderCalendar();
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function saveEntry(dateKey, patch){
  const prev = state.entries.get(dateKey) || {};
  const next = { ...prev, ...patch };
  state.entries.set(dateKey, next);
  if (state.selectedDate === dateKey) selectDay(dateKey); else renderCalendar();
  syncEntry(dateKey, next).catch(() => {});
}

async function syncEntry(dateKey, entry){
  if (!state.client || !state.user) return;
  const payload = {
    user_id: state.user.id,
    date: dateKey,
    status: entry.status || null,
    note: entry.note || null,
    imported: true,
    has_mn: !!entry.has_mn,
  };
  try {
    const r = await state.client.from('shifts').upsert(payload, { onConflict: 'user_id,date' });
    if (r.error) throw r.error;
  } catch (err) {
    const fallback = { ...payload };
    delete fallback.imported;
    delete fallback.has_mn;
    await state.client.from('shifts').upsert(fallback, { onConflict: 'user_id,date' });
  }
}

function applyStatus(status){
  if (!state.selectedDate) return showToast('Sélectionnez un jour');
  saveEntry(state.selectedDate, { status, imported: true });
  showToast(`Statut ${statusLabel(status)} appliqué`);
}

function openNoteModal(){
  if (!state.selectedDate) return showToast('Sélectionnez un jour');
  $('#noteText').value = (state.entries.get(state.selectedDate)?.note) || '';
  openModal('noteModal');
}
function saveNote(){
  if (!state.selectedDate) return;
  saveEntry(state.selectedDate, { note: $('#noteText').value.trim() });
  showToast('Note enregistrée');
}
function deleteNote(){
  if (!state.selectedDate) return;
  const e = state.entries.get(state.selectedDate) || {};
  delete e.note; state.entries.set(state.selectedDate, e);
  selectDay(state.selectedDate);
  syncEntry(state.selectedDate, e).catch(()=>{});
  showToast('Note supprimée');
}

function setupDock(){
  $$('.dock-btn[data-status]').forEach(btn => btn.addEventListener('click', () => applyStatus(btn.dataset.status)));
  $('#noteBtn').addEventListener('click', openNoteModal);
  $('#otherBtn').addEventListener('click', () => openModal('otherModal'));
  $('#clearBtn').addEventListener('click', () => { if (!state.selectedDate) return; saveEntry(state.selectedDate, { status: null, note: '' }); showToast('Jour effacé'); });
}

function setupModals(){
  $('#saveNoteBtn').addEventListener('click', (e) => { e.preventDefault(); saveNote(); closeModal('noteModal'); });
  $('#saveSettingsBtn').addEventListener('click', (e) => { e.preventDefault(); state.settings.base = parseFloat($('#rateBase').value) || BASE_RATE; state.settings.jour = parseFloat($('#rateJour').value) || DEFAULT_RATES.jour; state.settings.nuit = parseFloat($('#rateNuit').value) || DEFAULT_RATES.nuit; state.settings.mn = parseFloat($('#rateMN').value) || DEFAULT_RATES.mn; updateMonthStats(); if (state.selectedDate) selectDay(state.selectedDate); closeModal('settingsModal'); });
  $('#customCodes').innerHTML = CUSTOM_CODES.map(code => `<button class="code-btn" type="button" data-code="${code}">${code}</button>`).join('');
  $('#customCodes').addEventListener('click', e => { const b = e.target.closest('[data-code]'); if (!b || !state.selectedDate) return; saveEntry(state.selectedDate, { status: b.dataset.code.toLowerCase() }); closeModal('otherModal'); showToast(`${b.dataset.code} enregistré`); });
}

function setupNavigation(){
  $('#prevMonth').addEventListener('click', () => { state.month--; if (state.month < 0) { state.month = 11; state.year--; } state.selectedDate = null; renderCalendar(); $('#detailDate').textContent = 'Aucun jour'; $('#detailStatus').textContent = '—'; $('#detailContent').innerHTML = '<p class="muted">Touchez une case du calendrier.</p>'; });
  $('#nextMonth').addEventListener('click', () => { state.month++; if (state.month > 11) { state.month = 0; state.year++; } state.selectedDate = null; renderCalendar(); $('#detailDate').textContent = 'Aucun jour'; $('#detailStatus').textContent = '—'; $('#detailContent').innerHTML = '<p class="muted">Touchez une case du calendrier.</p>'; });
  $('#importBtn').addEventListener('click', () => $('#fileInput').click());
  $('#settingsBtn').addEventListener('click', () => openModal('settingsModal'));
}

function loadNote(dateKey){ return state.entries.get(dateKey)?.note || ''; }
function saveNoteToState(dateKey, note){ saveEntry(dateKey, { note }); }
function deleteNoteFromState(dateKey){ const e = state.entries.get(dateKey) || {}; delete e.note; saveEntry(dateKey, e); }

function analyzeData(rows){
  let best = { row: -1, score: -1 };
  for (let i=0;i<rows.length;i++){
    const row = rows[i] || [];
    const score = row.reduce((acc, v) => acc + ((String(v).match(/[A-Z]{0,3}\d{1,4}|(J|N|MN|R|CA|RTT|RP)/i) ? 1 : 0)), 0);
    if (score > best.score) best = { row: i, score };
  }
  const legend = {};
  rows.slice(Math.max(0, rows.length - 20)).flat().forEach(cell => {
    const v = String(cell).toUpperCase();
    if (/NUIT|N/.test(v)) legend[v] = 'nuit';
    if (/JOUR|J/.test(v)) legend[v] = 'jour';
    if (/MN/.test(v)) legend[v] = 'mn';
    if (/REPOS|R/.test(v)) legend[v] = 'repos';
    if (/CONG|CA/.test(v)) legend[v] = 'conges';
  });
  return { bestRow: best.row, legend };
}

function extractSchedule(rows){
  const mined = analyzeData(rows);
  const row = rows[mined.bestRow] || [];
  const header = rows[Math.max(0, mined.bestRow - 1)] || [];
  const result = [];
  let dates = header.map(c => {
    const s = String(c).match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
    if (!s) return null;
    const y = s[3] ? (s[3].length === 2 ? 2000 + Number(s[3]) : Number(s[3])) : state.year;
    return keyOf(y, Number(s[2])-1, Number(s[1]));
  });
  row.forEach((cell, i) => {
    const v = String(cell).trim().toUpperCase();
    let status = mined.legend[v] || null;
    if (!status) {
      if (/^N\d*/.test(v)) status = 'nuit';
      else if (/^J\d*/.test(v)) status = 'jour';
      else if (/^MN/.test(v)) status = 'mn';
      else if (/^R/.test(v)) status = 'repos';
      else if (/^C|CA/.test(v)) status = 'conges';
    }
    if (status && dates[i]) result.push({ date: dates[i], status });
  });
  return result;
}

function applyMNLogic(entries){
  const byDay = new Map(entries.map(e => [e.date, e]));
  const dates = [...byDay.keys()].sort();
  dates.forEach((d, idx) => {
    const cur = parseDateKey(d);
    const next = dates[idx + 1] ? parseDateKey(dates[idx + 1]) : null;
    if (!next) return;
    const isNight = byDay.get(d)?.status === 'nuit';
    const nextStatus = byDay.get(dates[idx + 1])?.status;
    if (isNight && nextStatus !== 'mn' && cur.getDay() !== 0) {
      const mnKey = dates[idx + 1];
      byDay.set(mnKey, { date: mnKey, status: 'mn' });
    }
  });
  return [...byDay.values()];
}

async function handleImport(file){
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let entries = applyMNLogic(extractSchedule(rows));
  for (const e of entries) { state.entries.set(e.date, { status: e.status, imported: true }); await syncEntry(e.date, { status: e.status, imported: true }); }
  renderCalendar(); if (state.selectedDate) selectDay(state.selectedDate); showToast(`${entries.length} lignes importées`);
}

async function bootstrapApp(){
  renderWeekdayHeader();
  setupDock();
  setupModals();
  setupNavigation();
  renderCalendar();
  $('#loginBtn').onclick = login;
  $('#registerBtn').onclick = register;
  $('#saveNoteBtn').onclick = (e) => { e.preventDefault(); saveNote(); };
  $('#fileInput').addEventListener('change', e => e.target.files[0] && handleImport(e.target.files[0]).catch(() => showToast('Import impossible')));
  if (!state.client) return;
  const { data } = await state.client.auth.getSession();
  state.user = data?.session?.user || state.user;
}

$('#saveNoteBtn').addEventListener('click', (e) => { e.preventDefault(); });

$('#loginBtn').addEventListener('click', login);
$('#registerBtn').addEventListener('click', register);
$('#fileInput').addEventListener('change', e => e.target.files[0] && handleImport(e.target.files[0]).catch(() => showToast('Import impossible')));
initTheme();
startupDiagnostics();
initSupabase();
bootstrapApp();
