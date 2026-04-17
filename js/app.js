// ═══════════════════════════════════════════════════════════
//  MyShift AI — app.js
//  Vanilla JS ES6 Module | Supabase Auth/DB | SheetJS XLSX
// ═══════════════════════════════════════════════════════════

// ── Config Supabase ──────────────────────────────────────
const SUPABASE_URL     = 'https://thfxuliapdacxwdpbnca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZnh1bGlhcGRhY3h3ZHBibmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzAwMzQsImV4cCI6MjA5MjAwNjAzNH0.iIB_0t8SSF3pR3f-4rcUtYJz6cbS892LBpPdh_7wDuM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── État global ─────────────────────────────────────────
let currentUser  = null;
let selectedDate = null;          // "YYYY-MM-DD"
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let shiftsCache  = {};            // { "YYYY-MM-DD": { status, note } }
let settings     = {
  name: '', matricule: '',
  rateJour: 35, rateNuit: 82, rateNuitSeule: 41, rateMN: 15,
  base: 2093.06
};

// ── Codes personnalisés ──────────────────────────────────
const CUSTOM_CODES = [
  { code: 'OCP',       label: 'OCP',        emoji: '🔧' },
  { code: 'FERIE',     label: 'Férié',      emoji: '🎉' },
  { code: 'FORMATION', label: 'Formation',  emoji: '📚' },
  { code: 'AM',        label: 'Arrêt Maladie', emoji: '🏥' },
  { code: 'TP',        label: 'Tps Partiel', emoji: '⏱️' },
  { code: 'RC',        label: 'Récup.',     emoji: '🔄' },
];

// ── Noms locaux ──────────────────────────────────────────
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                   'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const NIGHT_HEADERS = ['DI/LU','LU/MA','MA/ME','ME/JE','JE/VE','VE/SA','SA/DI'];

// ── Utilitaires ──────────────────────────────────────────
function fmt(date) {
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  return date;
}

function parseDate(str) {
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

function toast(msg, type = 'info', duration = 2400) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; }, duration);
  setTimeout(() => t.remove(), duration + 400);
}

function showLoading(msg = 'Chargement...') {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay'; el.className = 'loading-overlay';
    el.innerHTML = `<div class="spinner"></div><div class="loading-text">${msg}</div>`;
    document.body.appendChild(el);
  }
  el.querySelector('.loading-text').textContent = msg;
  el.classList.remove('hidden');
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

// ── Auth ─────────────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; showApp(); }
  else          { showAuth(); }
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) { currentUser = session.user; showApp(); }
    else         { currentUser = null; showAuth(); }
  });
}

function showAuth() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

async function showApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('header-username').textContent = currentUser.email.split('@')[0];
  loadSettings();
  await loadMonth();
  renderCalendar();
}

// Login
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pwd   = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  if (!email || !pwd) { errEl.textContent = 'Veuillez remplir tous les champs.'; errEl.classList.remove('hidden'); return; }
  showLoading('Connexion...');
  const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
  hideLoading();
  if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
  else errEl.classList.add('hidden');
});

// Register
document.getElementById('btn-register').addEventListener('click', async () => {
  const email = document.getElementById('reg-email').value.trim();
  const pwd   = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  if (!email || !pwd) { errEl.textContent = 'Veuillez remplir tous les champs.'; errEl.classList.remove('hidden'); return; }
  showLoading('Création du compte...');
  const { error } = await sb.auth.signUp({ email, password: pwd });
  hideLoading();
  if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
  else { toast('Compte créé ! Vérifiez votre email.', 'success', 4000); }
});

document.getElementById('link-register').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('auth-login-form').classList.add('hidden');
  document.getElementById('auth-register-form').classList.remove('hidden');
});
document.getElementById('link-login').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('auth-register-form').classList.add('hidden');
  document.getElementById('auth-login-form').classList.remove('hidden');
});

// ── Paramètres ───────────────────────────────────────────
function loadSettings() {
  const raw = sessionStorage.getItem('myshift_settings');
  if (raw) { try { settings = { ...settings, ...JSON.parse(raw) }; } catch(e) {} }
  document.getElementById('settings-name').value      = settings.name || '';
  document.getElementById('settings-matricule').value = settings.matricule || '';
  document.getElementById('rate-jour').value          = settings.rateJour;
  document.getElementById('rate-nuit').value          = settings.rateNuit;
  document.getElementById('rate-nuit-seule').value    = settings.rateNuitSeule;
  document.getElementById('rate-mn').value            = settings.rateMN;
  document.getElementById('settings-base').value      = settings.base;
}

function saveSettingsLocal() {
  settings.name          = document.getElementById('settings-name').value.trim();
  settings.matricule     = document.getElementById('settings-matricule').value.trim();
  settings.rateJour      = parseFloat(document.getElementById('rate-jour').value) || 35;
  settings.rateNuit      = parseFloat(document.getElementById('rate-nuit').value) || 82;
  settings.rateNuitSeule = parseFloat(document.getElementById('rate-nuit-seule').value) || 41;
  settings.rateMN        = parseFloat(document.getElementById('rate-mn').value) || 15;
  settings.base          = parseFloat(document.getElementById('settings-base').value) || 2093.06;
  try { sessionStorage.setItem('myshift_settings', JSON.stringify(settings)); } catch(e) {}
  toast('Paramètres sauvegardés', 'success');
  closeModal('modal-settings');
  updateMonthlySummary();
}

document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));
document.getElementById('save-settings-btn').addEventListener('click', saveSettingsLocal);
document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut(); shiftsCache = {}; selectedDate = null;
});
document.getElementById('close-settings-modal').addEventListener('click', () => closeModal('modal-settings'));

// ── Données Supabase ────────────────────────────────────
async function loadMonth() {
  if (!currentUser) return;
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay  = new Date(currentYear, currentMonth+1, 0);
  // Charger un peu plus large pour les MN inter-mois
  const from = fmt(new Date(currentYear, currentMonth-1, 20));
  const to   = fmt(new Date(currentYear, currentMonth+1, 10));

  const { data, error } = await sb
    .from('shifts')
    .select('date, status, note')
    .eq('user_id', currentUser.id)
    .gte('date', from)
    .lte('date', to);

  if (!error && data) {
    data.forEach(r => { shiftsCache[r.date] = { status: r.status, note: r.note || '' }; });
  }
}

// saveEntry avec fallback si colonne manquante
async function saveEntry(dateStr, status, note = null, imported = false) {
  if (!currentUser) return;
  // Mise à jour UI immédiate (Local-First)
  if (!shiftsCache[dateStr]) shiftsCache[dateStr] = {};
  if (status !== null) shiftsCache[dateStr].status = status;
  if (note !== null)   shiftsCache[dateStr].note   = note;

  const payload = {
    user_id: currentUser.id,
    date: dateStr,
    status: shiftsCache[dateStr].status || null,
    note:   shiftsCache[dateStr].note   || null,
    imported: imported,
  };

  let { error } = await sb.from('shifts').upsert(payload, { onConflict: 'user_id,date' });

  // Fallback : si erreur à cause d'une colonne manquante (imported)
  if (error && error.code === 'PGRST204') {
    const { imported: _drop, ...payloadRetry } = payload;
    ({ error } = await sb.from('shifts').upsert(payloadRetry, { onConflict: 'user_id,date' }));
  }
  if (error) console.warn('saveEntry error:', error.message);
}

async function deleteEntry(dateStr) {
  if (!currentUser) return;
  delete shiftsCache[dateStr];
  await sb.from('shifts').delete()
    .eq('user_id', currentUser.id).eq('date', dateStr);
}

// ── Calendrier ────────────────────────────────────────────
function renderCalendar() {
  document.getElementById('cal-month-name').textContent = MONTHS_FR[currentMonth];
  document.getElementById('cal-year').textContent       = currentYear;

  const headersEl = document.getElementById('cal-headers');
  const daysEl    = document.getElementById('cal-days');
  headersEl.innerHTML = '<div class="cal-header-cell">SEM</div>';
  NIGHT_HEADERS.forEach(h => {
    const d = document.createElement('div');
    d.className = 'cal-header-cell'; d.textContent = h;
    headersEl.appendChild(d);
  });

  daysEl.innerHTML = '';
  const first = new Date(currentYear, currentMonth, 1);
  // Décalage : lundi = 0
  let startDow = first.getDay(); // 0=dim
  startDow = (startDow === 0) ? 6 : startDow - 1;

  const totalDays = new Date(currentYear, currentMonth+1, 0).getDate();
  const totalCells = Math.ceil((startDow + totalDays) / 7) * 7;

  const today = fmt(new Date());
  let weekNum = getWeekNumber(new Date(currentYear, currentMonth, 1 - startDow));

  for (let i = 0; i < totalCells; i++) {
    // Numéro de semaine en début de ligne
    if (i % 7 === 0) {
      const wn = document.createElement('div');
      wn.className = 'cal-week-num';
      wn.textContent = weekNum;
      weekNum++;
      daysEl.appendChild(wn);
    }

    const dayOffset = i - startDow;
    const date = new Date(currentYear, currentMonth, dayOffset + 1);
    const dateStr = fmt(date);

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (date.getMonth() !== currentMonth) cell.classList.add('other-month');
    if (dateStr === today)                cell.classList.add('today');
    if (dateStr === selectedDate)         cell.classList.add('selected');

    const shift = shiftsCache[dateStr];
    let statusClass = '';
    let statusLabel = '';
    if (shift?.status) {
      const s = shift.status.toLowerCase();
      if (s === 'jour')   { statusClass = 's-jour';   statusLabel = 'JOUR'; }
      else if (s === 'nuit')  { statusClass = 's-nuit';   statusLabel = 'NUIT'; }
      else if (s === 'mn')    { statusClass = 's-mn';     statusLabel = 'MN'; }
      else if (s === 'repos') { statusClass = 's-repos';  statusLabel = 'REPOS'; }
      else if (s === 'conges'){ statusClass = 's-conges'; statusLabel = 'CONGÉS'; }
      else                    { statusClass = 's-custom'; statusLabel = shift.status.toUpperCase().slice(0,5); }
    }
    if (statusClass) cell.classList.add(statusClass);

    cell.innerHTML = `
      <span class="day-num">${date.getDate()}</span>
      ${statusLabel ? `<span class="day-status-label">${statusLabel}</span>` : ''}
      ${shift?.note ? '<div class="note-dot" aria-label="Note présente"></div>' : ''}
    `;

    cell.addEventListener('click', () => selectDay(dateStr));
    daysEl.appendChild(cell);
  }

  updateMonthlySummary();
  updateStatsPanel();
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

// ── Navigation ───────────────────────────────────────────
document.getElementById('btn-prev-month').addEventListener('click', async () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await loadMonth(); renderCalendar();
});
document.getElementById('btn-next-month').addEventListener('click', async () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await loadMonth(); renderCalendar();
});

// ── Tabs ─────────────────────────────────────────────────
document.getElementById('tab-today').addEventListener('click', () => {
  document.getElementById('tab-today').classList.add('active');
  document.getElementById('tab-stats').classList.remove('active');
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('cal-grid').classList.remove('hidden');
  document.getElementById('monthly-summary').classList.remove('hidden');
  const today = fmt(new Date());
  const td = parseDate(today);
  if (td.getFullYear() !== currentYear || td.getMonth() !== currentMonth) {
    currentYear = td.getFullYear(); currentMonth = td.getMonth();
    loadMonth().then(renderCalendar);
  }
  selectDay(today);
});
document.getElementById('tab-stats').addEventListener('click', () => {
  document.getElementById('tab-stats').classList.add('active');
  document.getElementById('tab-today').classList.remove('active');
  document.getElementById('stats-panel').classList.remove('hidden');
  document.getElementById('cal-grid').classList.add('hidden');
  document.getElementById('monthly-summary').classList.add('hidden');
  updateStatsPanel();
});

// ── Sélection d'un jour ──────────────────────────────────
function selectDay(dateStr) {
  selectedDate = dateStr;
  // Re-render juste les sélections
  document.querySelectorAll('.cal-day').forEach(cell => cell.classList.remove('selected'));
  const cells = document.querySelectorAll('.cal-day');
  cells.forEach(cell => {
    // trouver la cellule par son texte de jour
  });
  renderCalendar(); // on re-rend pour mettre la sélection à jour simplement

  const date   = parseDate(dateStr);
  const shift  = shiftsCache[dateStr];
  const status = shift?.status || null;
  const note   = shift?.note   || '';

  // Label date
  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const label = `${dayNames[date.getDay()]} ${date.getDate()} ${MONTHS_FR[date.getMonth()]}`;
  document.getElementById('detail-date-label').textContent = label;

  // Badge statut
  renderStatusBadge(status);

  // Calcul salaire
  const salaryInfo = calcDaySalary(dateStr);

  // Corps de la zone
  const body = document.getElementById('detail-body');
  body.innerHTML = `
    <div class="detail-salary-line">
      <span class="detail-salary-amount">${salaryInfo.total.toFixed(2)} €</span>
      <span class="detail-salary-breakdown">${salaryInfo.breakdown}</span>
    </div>
    <div class="detail-note-section">
      <div class="detail-note-label">📝 NOTE</div>
      ${note
        ? `<div class="detail-note-text" id="detail-note-content">${escapeHtml(note)}</div>
           <div class="detail-note-actions">
             <button class="note-action-btn" id="btn-edit-note">Modifier</button>
             <button class="note-action-btn delete" id="btn-delete-note">Supprimer</button>
           </div>`
        : `<div class="detail-note-none">Aucune note — <a href="#" id="link-add-note" style="color:var(--blue);text-decoration:none;">+ Ajouter</a></div>`
      }
    </div>
  `;

  // Listeners inline
  const editBtn   = document.getElementById('btn-edit-note');
  const deleteBtn = document.getElementById('btn-delete-note');
  const addLink   = document.getElementById('link-add-note');
  if (editBtn)   editBtn.addEventListener('click', () => openNoteModal(note));
  if (deleteBtn) deleteBtn.addEventListener('click', deleteNote);
  if (addLink)   addLink.addEventListener('click', e => { e.preventDefault(); openNoteModal(''); });
}

function renderStatusBadge(status) {
  const badge = document.getElementById('detail-status-badge');
  badge.className = 'detail-status-badge';
  if (!status) { badge.textContent = 'LIBRE'; badge.classList.add('badge-libre'); return; }
  const s = status.toLowerCase();
  const map = { jour:'JOUR', nuit:'NUIT', mn:'MN', repos:'REPOS', conges:'CONGÉS' };
  badge.textContent = map[s] || status.toUpperCase();
  badge.classList.add(`badge-${map[s] ? s : 'custom'}`);
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ── Calcul salaire ───────────────────────────────────────
function calcDaySalary(dateStr) {
  const shift = shiftsCache[dateStr];
  if (!shift?.status) return { total: 0, breakdown: 'Aucun service' };

  const s = shift.status.toLowerCase();
  let total = 0; let parts = [];

  if (s === 'jour') {
    total = settings.rateJour;
    parts.push(`Jour: ${settings.rateJour}€`);
  } else if (s === 'nuit') {
    total = settings.rateNuit;
    parts.push(`Nuit: ${settings.rateNuit}€`);
    // Vérifier si une MN s'applique
    if (hasMN(dateStr)) {
      total += settings.rateMN;
      parts.push(`MN: ${settings.rateMN}€`);
    }
  } else if (s === 'mn') {
    total = settings.rateMN;
    parts.push(`MN: ${settings.rateMN}€`);
  } else if (s === 'repos' || s === 'conges') {
    total = 0;
    parts.push(s === 'conges' ? 'Congés' : 'Repos');
  } else {
    total = 0; parts.push(shift.status);
  }

  return { total, breakdown: parts.join(' + ') };
}

// Une MN s'applique si :
// - La nuit précédente est un Dimanche → PAS de MN
// - Sinon → MN
function hasMN(nightDateStr) {
  const d = parseDate(nightDateStr);
  const prevDay = new Date(d); prevDay.setDate(prevDay.getDate() - 1);
  // Si la nuit commence un Dimanche soir (donc dateStr = lundi), le prev est dimanche
  return prevDay.getDay() !== 0; // 0 = dimanche
}

// ── Résumé mensuel ───────────────────────────────────────
function updateMonthlySummary() {
  let jours = 0, nuits = 0, repos = 0, total = settings.base;

  for (let d = 1; d <= new Date(currentYear, currentMonth+1, 0).getDate(); d++) {
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const shift = shiftsCache[dateStr];
    if (!shift?.status) continue;
    const s = shift.status.toLowerCase();
    if (s === 'jour')  { jours++; total += settings.rateJour; }
    else if (s === 'nuit') {
      nuits++; total += settings.rateNuit;
      if (hasMN(dateStr)) total += settings.rateMN;
    } else if (s === 'mn') { total += settings.rateMN; }
    else if (s === 'repos') repos++;
  }

  document.getElementById('sum-jours').textContent  = jours;
  document.getElementById('sum-nuits').textContent  = nuits;
  document.getElementById('sum-repos').textContent  = repos;
  document.getElementById('sum-salary').textContent = total.toFixed(2) + ' €';
}

// ── Stats panel ──────────────────────────────────────────
function updateStatsPanel() {
  let jours = 0, nuits = 0, repos = 0, conges = 0, mn = 0, custom = 0;
  let totalSalary = settings.base;
  const days = new Date(currentYear, currentMonth+1, 0).getDate();

  for (let d = 1; d <= days; d++) {
    const ds = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const shift = shiftsCache[ds];
    if (!shift?.status) continue;
    const s = shift.status.toLowerCase();
    if (s === 'jour')   { jours++;   totalSalary += settings.rateJour; }
    else if (s === 'nuit')  { nuits++;   totalSalary += settings.rateNuit; if (hasMN(ds)) { mn++; totalSalary += settings.rateMN; } }
    else if (s === 'mn')    { mn++;      totalSalary += settings.rateMN; }
    else if (s === 'repos') { repos++; }
    else if (s === 'conges'){ conges++; }
    else { custom++; }
  }

  const worked = jours + nuits;
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-card"><div class="stat-card-title">☀️ Jours</div><div class="stat-card-value">${jours}</div></div>
    <div class="stat-card"><div class="stat-card-title">🌙 Nuits</div><div class="stat-card-value">${nuits}</div></div>
    <div class="stat-card"><div class="stat-card-title">🌄 MN</div><div class="stat-card-value">${mn}</div></div>
    <div class="stat-card"><div class="stat-card-title">🏖️ Congés</div><div class="stat-card-value">${conges}</div></div>
    <div class="stat-card"><div class="stat-card-title">🏠 Repos</div><div class="stat-card-value">${repos}</div></div>
    <div class="stat-card"><div class="stat-card-title">📅 Services</div><div class="stat-card-value">${worked}</div></div>
    <div class="stat-card" style="grid-column:span 2">
      <div class="stat-card-title">💰 Estimé brut</div>
      <div class="stat-card-value" style="color:var(--blue)">${totalSalary.toFixed(2)} €</div>
    </div>
  `;
}

// ── Dock actions ─────────────────────────────────────────
document.querySelectorAll('.dock-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (!selectedDate && action !== 'note' && action !== 'autre') {
      toast('Sélectionnez un jour d\'abord', 'info'); return;
    }
    handleAction(action);
  });
});

async function handleAction(action) {
  if (action === 'note')   { openNoteModal(shiftsCache[selectedDate]?.note || ''); return; }
  if (action === 'autre')  { openAutreModal(); return; }
  if (action === 'effacer') {
    await deleteEntry(selectedDate);
    renderCalendar();
    selectDay(selectedDate);
    toast('Effacé', 'info'); return;
  }
  // Statuts directs
  await saveEntry(selectedDate, action);
  // Si JOUR → note interne pause
  if (action === 'jour') {
    const existing = shiftsCache[selectedDate]?.note || '';
    if (!existing.includes('Pause 12h-13h')) {
      const newNote = existing ? existing + '\nPause 12h-13h' : 'Pause 12h-13h';
      await saveEntry(selectedDate, null, newNote);
    }
  }
  renderCalendar();
  selectDay(selectedDate);
  toast('Service enregistré ✓', 'success');
}

// ── Modale Note ──────────────────────────────────────────
function openNoteModal(currentNote = '') {
  if (!selectedDate) { toast('Sélectionnez un jour d\'abord', 'info'); return; }
  document.getElementById('note-textarea').value = currentNote;
  openModal('modal-note');
}

async function saveNote() {
  const text = document.getElementById('note-textarea').value.trim();
  await saveEntry(selectedDate, null, text);
  closeModal('modal-note');
  renderCalendar();
  selectDay(selectedDate);
  toast('Note sauvegardée ✓', 'success');
}

async function deleteNote() {
  await saveEntry(selectedDate, null, '');
  renderCalendar();
  selectDay(selectedDate);
  toast('Note supprimée', 'info');
}

document.getElementById('save-note-btn').addEventListener('click', saveNote);
document.getElementById('close-note-modal').addEventListener('click',   () => closeModal('modal-note'));
document.getElementById('close-note-modal-2').addEventListener('click', () => closeModal('modal-note'));

// ── Modale Autre ─────────────────────────────────────────
function openAutreModal() {
  if (!selectedDate) { toast('Sélectionnez un jour d\'abord', 'info'); return; }
  const grid = document.getElementById('code-grid');
  grid.innerHTML = '';
  CUSTOM_CODES.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'code-btn';
    btn.innerHTML = `<span class="code-emoji">${c.emoji}</span>${c.label}`;
    btn.addEventListener('click', async () => {
      await saveEntry(selectedDate, c.code);
      closeModal('modal-autre');
      renderCalendar();
      selectDay(selectedDate);
      toast(`${c.label} enregistré ✓`, 'success');
    });
    grid.appendChild(btn);
  });
  openModal('modal-autre');
}
document.getElementById('close-autre-modal').addEventListener('click', () => closeModal('modal-autre'));

// ── Utilitaires modales ──────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.addEventListener('click', function outsideClick(e) {
    if (e.target === el) { closeModal(id); el.removeEventListener('click', outsideClick); }
  });
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── Import Excel ─────────────────────────────────────────
document.getElementById('btn-import-trigger').addEventListener('click', () => {
  document.getElementById('file-import').click();
});

document.getElementById('file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  showLoading('Analyse du fichier…');
  try {
    const data = await readExcelFile(file);
    const results = analyzeData(data);
    if (!results || results.length === 0) {
      hideLoading(); toast('Aucune donnée détectée dans ce fichier', 'error'); return;
    }
    await importSchedule(results);
    hideLoading();
    await loadMonth();
    renderCalendar();
    toast(`${results.length} service(s) importé(s) ✓`, 'success');
  } catch(err) {
    hideLoading();
    console.error('Import error:', err);
    toast('Erreur lors de l\'import : ' + err.message, 'error');
  }
});

function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        resolve(rows);
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Lecture fichier impossible'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Algorithme de Data Mining ────────────────────────────
function analyzeData(rows) {
  if (!rows || rows.length === 0) return [];

  // 1. Construire dictionnaire légende (bas de fichier)
  const legend = buildLegend(rows);

  // 2. Trouver la ligne avec le meilleur score (ligne utilisateur)
  const userRowIdx = findUserRow(rows);
  if (userRowIdx === -1) return [];

  // 3. Trouver la ligne de dates (en-tête)
  const dateRowIdx = findDateRow(rows, userRowIdx);
  if (dateRowIdx === -1) return [];

  const dateRow = rows[dateRowIdx];
  const userRow = rows[userRowIdx];

  // 4. Extraire les associations date → code
  const results = [];
  for (let col = 0; col < dateRow.length; col++) {
    const rawDate = dateRow[col];
    const rawCode = userRow[col];
    if (!rawDate || !rawCode) continue;

    const date = parseExcelDate(rawDate);
    if (!date) continue;

    const code = String(rawCode).trim().toUpperCase();
    if (!code) continue;

    const status = resolveStatus(code, legend);
    if (status) results.push({ date: fmt(date), status, code });
  }

  // 5. Appliquer règles métier MN
  return applyBusinessRules(results);
}

function buildLegend(rows) {
  const legend = {};
  const keyWords = ['MEMO','CODE','CODES','N°','LÉGENDE','LEGENDE'];
  let legendStart = -1;

  // Chercher depuis le bas
  for (let i = rows.length - 1; i >= Math.max(0, rows.length - 30); i--) {
    const rowStr = rows[i].join(' ').toUpperCase();
    if (keyWords.some(k => rowStr.includes(k))) { legendStart = i; break; }
  }

  const scanStart = legendStart >= 0 ? legendStart : Math.max(0, rows.length - 20);
  for (let i = scanStart; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < row.length - 1; j++) {
      const cell = String(row[j]).trim();
      const next = String(row[j+1]).trim().toLowerCase();
      if (!cell || !next) continue;
      const status = guessStatusFromLabel(next);
      if (status) legend[cell.toUpperCase()] = status;
    }
  }

  return legend;
}

function guessStatusFromLabel(label) {
  const l = label.toLowerCase();
  if (l.includes('nuit') || l.includes('night')) return 'nuit';
  if (l.includes('jour') || l.includes('day') || l.includes('matin')) return 'jour';
  if (l.includes('repos') || l.includes('rest')) return 'repos';
  if (l.includes('congé') || l.includes('conge') || l.includes('vacance')) return 'conges';
  if (l.includes('montée') || l.includes('mn ') || l === 'mn') return 'mn';
  return null;
}

function resolveStatus(code, legend) {
  // Vérifier légende d'abord
  if (legend[code]) return legend[code];

  // Heuristique sur le code
  const c = code.toLowerCase();
  if (c === 'n' || c.startsWith('n') && /n\d/.test(c)) return 'nuit';
  if (c === 'j' || c.startsWith('j') && /j\d/.test(c)) return 'jour';
  if (c === 'r' || c === 'rep') return 'repos';
  if (c === 'c' || c.includes('cong')) return 'conges';
  if (c.includes('nuit') || c.includes('nct')) return 'nuit';
  if (c.includes('jour') || c.includes('jou')) return 'jour';
  if (c.includes('repos')) return 'repos';
  if (c.includes('mn') || c.includes('mat')) return 'mn';
  // Codes alphanumériques standard ex: N28, J12, 36IND...
  if (/^[NJ]\d+/.test(code)) return code.startsWith('N') ? 'nuit' : 'jour';
  return null;
}

function findUserRow(rows) {
  let bestScore = 0, bestIdx = -1;
  const codePattern = /^[A-Z]{1,4}\d{0,4}$/;

  for (let i = 0; i < rows.length; i++) {
    let score = 0;
    rows[i].forEach(cell => {
      const s = String(cell).trim().toUpperCase();
      if (codePattern.test(s) && s.length >= 1 && s.length <= 6) score++;
    });
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestScore >= 3 ? bestIdx : -1;
}

function findDateRow(rows, userRowIdx) {
  // Chercher dans les lignes autour de la ligne utilisateur
  for (let delta = 1; delta <= 5; delta++) {
    for (const sign of [-1, 1]) {
      const idx = userRowIdx + sign * delta;
      if (idx < 0 || idx >= rows.length) continue;
      const row = rows[idx];
      let dateCount = 0;
      row.forEach(cell => { if (parseExcelDate(cell)) dateCount++; });
      if (dateCount >= 15) return idx;
    }
  }
  return -1;
}

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val;
  // Nombre Excel (jours depuis 1900)
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d)) return d;
  }
  // String date
  const s = String(val).trim();
  const patterns = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{4})-(\d{2})-(\d{2})$/,   // YYYY-MM-DD
    /^(\d{2})-(\d{2})-(\d{4})$/,   // DD-MM-YYYY
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      let y, mo, d;
      if (p.source.startsWith('^(\\d{4})')) { [,y,mo,d] = m; }
      else { [,d,mo,y] = m; }
      const dt = new Date(+y, +mo-1, +d);
      if (!isNaN(dt)) return dt;
    }
  }
  return null;
}

function applyBusinessRules(entries) {
  // Indexer par date
  const byDate = {};
  entries.forEach(e => { byDate[e.date] = e; });

  const result = [...entries];

  entries.forEach(e => {
    if (e.status === 'nuit') {
      const d = parseDate(e.date);
      // MN = lendemain matin si la nuit ne débute pas un Dimanche
      if (d.getDay() !== 0) { // 0=dimanche
        const nextDay = new Date(d); nextDay.setDate(nextDay.getDate() + 1);
        const nextStr = fmt(nextDay);
        // Ajouter MN si rien n'est déjà sur ce jour
        if (!byDate[nextStr]) {
          const mnEntry = { date: nextStr, status: 'mn', code: 'MN_AUTO' };
          result.push(mnEntry);
          byDate[nextStr] = mnEntry;
        }
      }
    }
    // JOUR → note Pause
    if (e.status === 'jour') {
      e.note = 'Pause 12h-13h';
    }
  });

  return result;
}

async function importSchedule(entries) {
  const BATCH = 20;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(batch.map(e =>
      saveEntry(e.date, e.status, e.note || null, true)
    ));
  }
}

// ── Init ─────────────────────────────────────────────────
initAuth();
