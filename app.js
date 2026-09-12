/* BATU-KUNCI-BUILD-16 */
/* ============================================================
   BATU KUNCI — app.js
   Login + seluruh tampilan anggota, nyambung ke Firebase
   (Auth + Firestore, real-time). Ditambah layer UI/UX: dark
   mode, skeleton loading, animasi, confetti pas nandain selesai.
   Logic Firebase-nya SAMA kayak sebelumnya, gak ada yang diubah.

   WAJIB DIISI SEBELUM DIPAKAI: 6 baris firebaseConfig di bawah.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBoAiVpGp_QBa_FQYOQefflFwqKv8Pbry0",
  authDomain: "mediacreativeut262b.firebaseapp.com",
  projectId: "mediacreativeut262b",
  storageBucket: "mediacreativeut262b.firebasestorage.app",
  messagingSenderId: "263094318099",
  appId: "1:263094318099:web:363c0cd981b82060cebbe6",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* Link Web App Google Apps Script yang dipasang di akun Drive tim —
   dipakai fitur "Upload Langsung ke Drive" & "Ganti Foto" biar upload
   jalan TANPA login Google sama sekali (baca PANDUAN-SETUP-UPLOAD.md
   buat cara masangnya). Kosongin ("") kalau belum di-setup — tombolnya
   otomatis kasih tau minta pake cara manual dulu, gak bikin error. */
const UPLOAD_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzs7uwNHRDkNYboBhfv-rBvJa2yEenNPZivKN8YpXyfAaWkR9sjLR1iwJqsKF65tZhalg/exec";
const UPLOAD_SECRET = "mdc262"; // HARUS SAMA PERSIS kayak SHARED_SECRET di Apps Script
let pendingUploadRowId = null;
let pendingAkunEmail = null;

function emailFor(id) { return id + '@batukunci.app'; }
function idFromEmail(email) { return (email || '').split('@')[0]; }

let currentUser = null;
let activeTab = 'belum';
let expandedProjectId = null;
let uploadAssignees = [];
let uploadStatus = 'belum';
let uploadAsetRows = [];
let asetRowSeq = 0;
let unsubProjects = null, unsubDrive = null, unsubGallery = null, unsubAlbums = null;
let projectsFirstLoadDone = false;
let teamLoadPromise = null;

const BG_THEMES = { default: null, dusk: '#EDF1F5', sage: '#EEF3EE', brass: '#F8F1E2', rose: '#F7ECE9' };

const THEME_PALETTES = {
  light: {
    atelier: { name: 'Atelier', stone: '#F5F4F0', dim: '#EAE8E1', card: '#FFFFFF', ink: '#172033', soft: '#687181', line: '#DFDDD5', dusk: '#173B63', brass: '#B98536', brassSoft: '#F0E0BA', sage: '#4C7A5E', terracotta: '#B85C48' },
    mist: { name: 'Mist Blue', stone: '#F1F4F8', dim: '#E3E9F0', card: '#FFFFFF', ink: '#17263A', soft: '#64748B', line: '#D8E0EA', dusk: '#245B91', brass: '#B88942', brassSoft: '#F1E5CA', sage: '#4D8069', terracotta: '#B85C48' },
    sage: { name: 'Sage Studio', stone: '#F0F4F0', dim: '#E2EAE3', card: '#FFFFFF', ink: '#1D2B24', soft: '#66756C', line: '#D7E0D8', dusk: '#315A4B', brass: '#A98545', brassSoft: '#EFE4C9', sage: '#3F745B', terracotta: '#A95C4C' },
    brass: { name: 'Brass Editorial', stone: '#F8F3E8', dim: '#EEE5D2', card: '#FFFDF8', ink: '#29251E', soft: '#776F62', line: '#E4D9C3', dusk: '#263E5B', brass: '#A87325', brassSoft: '#EED9A9', sage: '#55705D', terracotta: '#A85B49' },
    rose: { name: 'Rose Paper', stone: '#F8F1F0', dim: '#EDE0DE', card: '#FFFCFB', ink: '#302225', soft: '#796C70', line: '#E5D8D6', dusk: '#4B3A57', brass: '#B18A4A', brassSoft: '#F0E3C8', sage: '#557463', terracotta: '#A95752' }
  },
  dark: {
    obsidian: { name: 'Obsidian Chrome', stone: '#05070D', dim: '#0D111B', card: '#0C1018', ink: '#F2F4F8', soft: '#99A4B5', line: '#202837', dusk: '#5C8FE0', brass: '#D8AA55', brassSoft: '#302617', sage: '#69B58D', terracotta: '#DE806D' },
    midnight: { name: 'Midnight', stone: '#070B18', dim: '#10182B', card: '#0D1424', ink: '#F2F5FB', soft: '#9BA9C2', line: '#222E46', dusk: '#6B9DE5', brass: '#D5B36B', brassSoft: '#322A1A', sage: '#6FB795', terracotta: '#DD8571' },
    graphite: { name: 'Graphite', stone: '#0A0D11', dim: '#151A20', card: '#11161C', ink: '#F0F1F2', soft: '#9AA1AA', line: '#292F38', dusk: '#7A9AB9', brass: '#C8A35E', brassSoft: '#302919', sage: '#6CA887', terracotta: '#D47A68' },
    indigo: { name: 'Indigo Glass', stone: '#090718', dim: '#15122A', card: '#100D20', ink: '#F4F2FF', soft: '#AAA4C3', line: '#2B2547', dusk: '#8A7BE5', brass: '#D4AB62', brassSoft: '#332917', sage: '#70AE9A', terracotta: '#D98272' },
    bronze: { name: 'Bronze Night', stone: '#0C0A08', dim: '#191511', card: '#15110D', ink: '#F5F0E8', soft: '#A99F91', line: '#30271D', dusk: '#7191B4', brass: '#D0A15A', brassSoft: '#382B19', sage: '#769A7C', terracotta: '#D17A62' }
  }
};

function initTheme() {
  let mode = null, paletteLight = null, paletteDark = null;
  try {
    mode = localStorage.getItem('bk-theme-mode');
    paletteLight = localStorage.getItem('bk-theme-light');
    paletteDark = localStorage.getItem('bk-theme-dark');
  } catch (e) {}
  if (!mode) {
    try { mode = localStorage.getItem('bk-theme'); } catch (e) {}
  }
  mode = mode || ((window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
  if (!THEME_PALETTES.light[paletteLight]) paletteLight = 'atelier';
  if (!THEME_PALETTES.dark[paletteDark]) paletteDark = 'obsidian';
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-palette', mode === 'dark' ? paletteDark : paletteLight);
  applyThemeVars();
}

function applyThemeVars() {
  const root = document.documentElement;
  const mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  let key = root.getAttribute('data-palette');
  if (!THEME_PALETTES[mode][key]) key = mode === 'dark' ? 'obsidian' : 'atelier';
  root.setAttribute('data-palette', key);
  const t = THEME_PALETTES[mode][key];
  const vars = { '--stone': t.stone, '--stone-dim': t.dim, '--card': t.card, '--ink': t.ink, '--ink-soft': t.soft, '--line': t.line, '--dusk': t.dusk, '--brass': t.brass, '--brass-soft': t.brassSoft, '--sage': t.sage, '--terracotta': t.terracotta, '--brass-ink': t.brass, '--sage-soft': mode === 'dark' ? '#173126' : '#DDE9E0', '--terracotta-soft': mode === 'dark' ? '#36201B' : '#F2DDD7' };
  Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
  root.style.setProperty('--brass-gradient', `linear-gradient(135deg, color-mix(in srgb, ${t.brass} 72%, white), ${t.brass})`);
  root.style.setProperty('--dusk-gradient', `linear-gradient(135deg, color-mix(in srgb, ${t.dusk} 78%, white), ${t.dusk})`);
  updateThemePicker();
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  setThemeMode(next);
}

function setThemeMode(mode) {
  if (!THEME_PALETTES[mode]) return;
  let palette = 'atelier';
  try { palette = localStorage.getItem(mode === 'dark' ? 'bk-theme-dark' : 'bk-theme-light') || palette; } catch (e) {}
  if (!THEME_PALETTES[mode][palette]) palette = mode === 'dark' ? 'obsidian' : 'atelier';
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-palette', palette);
  try { localStorage.setItem('bk-theme-mode', mode); localStorage.setItem('bk-theme', mode); } catch (e) {}
  applyThemeVars();
  applyUserBg();
}

function setThemePalette(key) {
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (!THEME_PALETTES[mode][key]) return;
  document.documentElement.setAttribute('data-palette', key);
  try { localStorage.setItem(mode === 'dark' ? 'bk-theme-dark' : 'bk-theme-light', key); } catch (e) {}
  applyThemeVars();
}

function applyUserBg() {
  // Legacy user background remains supported as a subtle light-mode override.
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const key = currentUser?.bg;
  const color = !isDark && key ? BG_THEMES[key] : null;
  if (color) document.documentElement.style.setProperty('--stone-user', color);
  else document.documentElement.style.removeProperty('--stone-user');
}

function updateThemePicker() {
  const wrap = document.getElementById('theme-palette-grid');
  if (!wrap) return;
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const current = document.documentElement.getAttribute('data-palette') || (mode === 'dark' ? 'obsidian' : 'atelier');
  const themes = THEME_PALETTES[mode];
  wrap.innerHTML = Object.entries(themes).map(([key, t]) => `
    <button type="button" class="theme-palette-card ${key === current ? 'selected' : ''}" onclick="setThemePalette('${key}')" aria-label="Pilih ${t.name}">
      <span class="theme-preview" style="--preview-bg:${t.stone};--preview-card:${t.card};--preview-accent:${t.brass};--preview-dusk:${t.dusk};">
        <i></i><b></b><em></em>
      </span>
      <span class="theme-palette-name">${t.name}</span>
      <span class="theme-palette-check">✓</span>
    </button>`).join('');
  const label = document.getElementById('theme-palette-current');
  if (label) label.textContent = themes[current]?.name || '';
  document.querySelectorAll('.theme-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
}

let musicBlobUrl = null;

async function setupMusic() {
  const btn = document.getElementById('music-toggle');
  const link = currentUser?.music;
  const m = (link || '').match(/\/d\/([a-zA-Z0-9_-]{10,})/) || (link || '').match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  const fileId = m ? m[1] : null;

  if (musicBlobUrl) { URL.revokeObjectURL(musicBlobUrl); musicBlobUrl = null; }
  const audio = document.getElementById('music-audio');
  audio.pause();
  document.getElementById('music-play-btn').textContent = '▶';

  if (!fileId) {
    btn.classList.add('hidden');
    document.getElementById('music-panel').classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');

  // Coba player custom (fetch langsung pake Drive API resmi) — kalau API key
  // masih dibatasin "Firebase-only", ini bakal gagal & OTOMATIS jatuh ke
  // player embed sederhana yang udah kebukti jalan, gak sampe blank/rusak.
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('status ' + res.status);
    const blob = await res.blob();
    musicBlobUrl = URL.createObjectURL(blob);
    audio.src = musicBlobUrl;
    audio.volume = 0.4;
    document.getElementById('music-player-custom').classList.remove('hidden');
    document.getElementById('music-frame').classList.add('hidden');
    document.getElementById('music-frame').src = '';
  } catch (e) {
    console.warn('Player custom gagal, fallback ke embed Drive:', e);
    document.getElementById('music-frame').src = driveEmbedUrl(link) || '';
    document.getElementById('music-frame').classList.remove('hidden');
    document.getElementById('music-player-custom').classList.add('hidden');
  }
}

function toggleMusicPanel() {
  document.getElementById('music-panel').classList.toggle('hidden');
}

function toggleMusicPlay() {
  const audio = document.getElementById('music-audio');
  const btn = document.getElementById('music-play-btn');
  if (audio.paused) { audio.play().catch(() => showToast('Gagal muter — coba lagi')); btn.textContent = '⏸'; }
  else { audio.pause(); btn.textContent = '▶'; }
}

/* ---------- Login (Firebase Auth) ---------- */

async function loadTeamForLogin() {
  try {
    const snap = await db.collection('users').get();
    TEAM = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Gagal load daftar anggota', e);
  }
  document.getElementById('login-name').innerHTML =
    TEAM.map(u => `<option value="${u.id}">${u.name}</option>`).join('')
    || `<option value="">(belum ada data — seed dulu lewat seed.html)</option>`;
}

async function doLogin() {
  const id = document.getElementById('login-name').value;
  const pass = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!id || !pass) { errEl.textContent = 'Pilih nama & isi password dulu.'; return; }
  try {
    await auth.signInWithEmailAndPassword(emailFor(id), pass);
  } catch (e) {
    errEl.textContent = 'Login gagal, cek lagi nama & password (' + e.code + ')';
  }
}

function doLogout() {
  closeMenu();
  auth.signOut();
}

auth.onAuthStateChanged(async user => {
  if (user) {
    if (teamLoadPromise) await teamLoadPromise; // pastiin TEAM udah keisi dulu, biar nama gak balik jadi versi email
    currentUser = findUser(idFromEmail(user.email)) || { id: idFromEmail(user.email), name: idFromEmail(user.email) };
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    projectsFirstLoadDone = false;
    applyUserBg();
    setupMusic();
    startLiveData();
    showView('home');
  } else {
    stopLiveData();
    currentUser = null;
    expandedProjectId = null;
    document.documentElement.style.removeProperty('--stone');
    if (musicBlobUrl) { URL.revokeObjectURL(musicBlobUrl); musicBlobUrl = null; }
    document.getElementById('music-audio').pause();
    document.getElementById('music-audio').removeAttribute('src');
    document.getElementById('music-frame').src = '';
    document.getElementById('music-panel').classList.add('hidden');
    document.getElementById('music-toggle').classList.add('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-password').value = '';
  }
});

/* ---------- Live data (Firestore real-time) ---------- */

function startLiveData() {
  unsubProjects = db.collection('projects').onSnapshot(snap => {
    PROJECTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    projectsFirstLoadDone = true;
    renderHome();
  }, e => console.error('projects listener', e));

  unsubDrive = db.collection('driveAccounts').onSnapshot(snap => {
    DRIVE_ACCOUNTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSettings();
  }, e => console.error('driveAccounts listener', e));

  unsubGallery = db.collection('gallery').onSnapshot(snap => {
    GALLERY = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGallery();
  }, e => console.error('gallery listener', e));

  unsubAlbums = db.collection('albums').onSnapshot(snap => {
    ALBUMS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGallery();
  }, e => console.error('albums listener', e));
}

function stopLiveData() {
  unsubProjects && unsubProjects();
  unsubDrive && unsubDrive();
  unsubGallery && unsubGallery();
  unsubAlbums && unsubAlbums();
}

/* ---------- Menu & navigasi ---------- */

function toggleMenu() { document.getElementById('dropdown-menu').classList.toggle('hidden'); }
function closeMenu() { document.getElementById('dropdown-menu').classList.add('hidden'); }

function showView(view) {
  closeMenu();
  ['home', 'upload', 'gallery', 'settings'].forEach(v =>
    document.getElementById('view-' + v).classList.toggle('hidden', v !== view)
  );
  if (view === 'home') renderHome();
  if (view === 'upload') renderUploadForm();
  if (view === 'gallery') renderGallery();
  if (view === 'settings') renderSettings();

  const el = document.getElementById('view-' + view);
  el.classList.remove('view-enter');
  void el.offsetWidth; // restart animasi
  el.classList.add('view-enter');
}

function openViewMode() {
  closeMenu();
  window.open('view.html', '_blank');
}

/* ---------- Home ---------- */

function setTab(tab) {
  activeTab = tab;
  document.getElementById('tab-belum').classList.toggle('active', tab === 'belum');
  document.getElementById('tab-arsip').classList.toggle('active', tab === 'arsip');
  const indicator = document.getElementById('tab-indicator');
  if (indicator) indicator.style.transform = tab === 'arsip' ? 'translateX(100%)' : 'translateX(0)';
  renderHome();
}

function renderHome() {
  const greet = document.getElementById('home-greeting');
  if (greet) greet.textContent = currentUser ? `Halo, ${currentUser.name}` : '';

  const list = document.getElementById('project-list');

  if (!projectsFirstLoadDone) {
    list.innerHTML = Array.from({ length: 3 }).map(() =>
      `<div class="project-card skeleton"><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div></div>`
    ).join('');
    return;
  }

  const items = PROJECTS.filter(p => activeTab === 'arsip' ? p.status === 'selesai' : p.status !== 'selesai');

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">${archMarkSvg()}<p>${
      activeTab === 'arsip' ? 'Belum ada project yang selesai.' : 'Belum ada project. Tambah lewat menu titik tiga.'
    }</p></div>`;
    return;
  }
  list.innerHTML = items.map(projectCardHtml).join('');
}

function projectCardHtml(p) {
  const isExpanded = expandedProjectId === p.id;
  const assignedUsers = (p.assignedTo || []).map(id => findUser(id)).filter(Boolean);
  const names = assignedUsers.map(u => u.name);
  const dLeft = daysUntil(p.deadline);
  const urgent = p.status !== 'selesai' && dLeft <= 3;

  let detail = '';
  if (isExpanded) {
    const asetList = p.aset || [];
    const asetHtml = asetList.length === 0
      ? `<div class="aset-empty">Belum ada aset ditambahkan.</div>`
      : asetList.map(a => {
          const url = driveEmbedUrl(a.link);
          return `<div class="aset-preview">
            <div class="aset-preview-label">${escapeHtml(a.label || 'Aset')}${a.akun ? ' · ' + escapeHtml(a.akun) : ''}</div>
            ${url ? `<iframe src="${url}" loading="lazy"></iframe>` : `<div class="aset-empty">Link belum diisi / belum valid.</div>`}
          </div>`;
        }).join('');

    detail = `<div class="project-detail" onclick="event.stopPropagation()">
      <div class="project-brief">${escapeHtml(p.brief || 'Belum ada brief.')}</div>
      ${asetHtml}
      <div class="detail-actions">
        ${p.status !== 'proses' ? `<button class="btn btn-ghost btn-sm" onclick="setStatus('${p.id}','proses',this)">Tandai Proses</button>` : ''}
        ${p.status !== 'selesai'
          ? `<button class="btn btn-primary btn-sm" onclick="setStatus('${p.id}','selesai',this)">Tandai Selesai</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="setStatus('${p.id}','proses',this)">Buka Lagi</button>`}
        <button class="btn btn-danger btn-sm" onclick="deleteProject('${p.id}')">🗑 Hapus</button>
      </div>
    </div>`;
  }

  return `<div class="project-card" onclick="toggleExpand('${p.id}')">
    <div class="project-card-top">
      <div>
        <p class="project-name">${escapeHtml(p.nama)}</p>
        <div class="project-meta">
          <span class="pill pill-${p.status}">${statusLabel(p.status)}</span>
          <span class="deadline-tag ${urgent ? 'urgent' : ''}">${formatTanggal(p.deadline)}${urgent ? ` · ${dLeft <= 0 ? 'lewat!' : dLeft + ' hari lagi'}` : ''}</span>
        </div>
      </div>
      <div class="avatars">${assignedUsers.slice(0, 3).map(u => avatarHtml(u)).join('')}</div>
    </div>
    <div class="assignee-names">${names.join(', ')}</div>
    ${detail}
  </div>`;
}

function toggleExpand(id) {
  expandedProjectId = expandedProjectId === id ? null : id;
  renderHome();
}

async function setStatus(id, status, btnEl) {
  expandedProjectId = null;
  try {
    await db.collection('projects').doc(id).update({ status });
    if (status === 'selesai') {
      await addProjectAsetsToGallery(id);
      if (btnEl) celebrate(btnEl);
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      setTab('arsip');
    } else {
      renderHome();
    }
    showToast(status === 'selesai' ? 'Project dipindah ke Arsip + Gallery ✓' : 'Status diupdate');
  } catch (e) {
    showToast('Gagal update: ' + e.message);
  }
}

// Aset dari project yang baru "Selesai" otomatis nyusul ke Gallery — link yang
// udah pernah ada di Gallery dilewatin, biar gak dobel kalau ke-selesai-in 2x.
async function addProjectAsetsToGallery(projectId) {
  const p = PROJECTS.find(x => x.id === projectId);
  const validAset = (p?.aset || []).filter(a => a.link);
  for (const a of validAset) {
    try {
      const existing = await db.collection('gallery').where('link', '==', a.link).limit(1).get();
      if (existing.empty) {
        await db.collection('gallery').add({ label: a.label || p.nama, link: a.link, akun: a.akun || '' });
      }
    } catch (e) {
      console.error('gagal auto-tambah gallery', e);
    }
  }
}

function statusLabel(s) {
  return { belum: 'Belum Mulai', proses: 'Proses', selesai: 'Selesai' }[s] || s;
}

async function deleteProject(id) {
  if (!confirm('Yakin mau hapus project ini? Aset & datanya ikut hilang, gak bisa dibalikin.')) return;
  try {
    await db.collection('projects').doc(id).delete();
    expandedProjectId = null;
    showToast('Project dihapus');
  } catch (e) {
    showToast('Gagal hapus: ' + e.message);
  }
}

/* ---------- Upload Project ---------- */

function renderUploadForm() {
  document.getElementById('upload-nama').value = '';
  document.getElementById('upload-deadline').value = '';
  document.getElementById('upload-brief').value = '';
  uploadAssignees = [];
  uploadStatus = 'belum';
  uploadAsetRows = [];
  asetRowSeq = 0;

  document.getElementById('assign-chips').innerHTML = TEAM.map(u =>
    `<button type="button" class="chip-option" data-id="${u.id}" onclick="toggleAssignee('${u.id}')">${u.name}</button>`
  ).join('');

  document.getElementById('status-select').innerHTML = ['belum', 'proses', 'selesai'].map(s =>
    `<button type="button" class="status-option ${s === 'belum' ? 'selected' : ''}" data-s="${s}" onclick="pickStatus('${s}')">${statusLabel(s)}</button>`
  ).join('');

  document.getElementById('aset-rows').innerHTML = '';
  addAsetRow();
}

function toggleAssignee(id) {
  const i = uploadAssignees.indexOf(id);
  if (i === -1) uploadAssignees.push(id); else uploadAssignees.splice(i, 1);
  document.querySelectorAll('#assign-chips .chip-option').forEach(b =>
    b.classList.toggle('selected', uploadAssignees.includes(b.dataset.id))
  );
}

function pickStatus(s) {
  uploadStatus = s;
  document.querySelectorAll('#status-select .status-option').forEach(b =>
    b.classList.toggle('selected', b.dataset.s === s)
  );
}

function addAsetRow() {
  const rowId = 'aset-' + (asetRowSeq++);
  uploadAsetRows.push(rowId);
  const div = document.createElement('div');
  div.className = 'aset-row';
  div.id = rowId;
  div.innerHTML = `
    <input type="text" placeholder="Label aset (mis. Poster final PNG)" class="aset-label">
    <select class="aset-akun">
      <option value="">Disimpen di akun mana?</option>
      ${DRIVE_ACCOUNTS.map(a => `<option value="${a.email}">${a.email} (${a.kelompok}${a.persen >= 85 ? ' · hampir penuh' : ''})</option>`).join('')}
      <option value="pribadi">Akun pribadi (bukan salah satu di atas)</option>
    </select>
    <button type="button" class="btn btn-primary btn-sm aset-upload-btn" onclick="startDirectUpload('${rowId}')">⬆ Upload Langsung ke Drive</button>
    <p class="aset-or">atau tempel link manual</p>
    <input type="text" placeholder="Link Google Drive (Anyone with the link)" class="aset-link" oninput="previewAsetRow('${rowId}')">
    <div class="aset-link-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="openAsetDriveFolder('${rowId}')">Buka Drive ↗</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="pasteFromClipboard('${rowId}')">📋 Tempel Link</button>
    </div>
    <div class="aset-row-preview"></div>
    <button type="button" class="aset-row-remove" onclick="removeAsetRow('${rowId}')">Hapus baris ini</button>
  `;
  document.getElementById('aset-rows').appendChild(div);
}

function removeAsetRow(rowId) {
  document.getElementById(rowId)?.remove();
  uploadAsetRows = uploadAsetRows.filter(r => r !== rowId);
}

function previewAsetRow(rowId) {
  const row = document.getElementById(rowId);
  const url = driveEmbedUrl(row.querySelector('.aset-link').value);
  row.querySelector('.aset-row-preview').innerHTML = url ? `<iframe src="${url}" loading="lazy"></iframe>` : '';
}

async function pasteFromClipboard(rowId) {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.includes('drive.google.com')) {
      showToast('Clipboard bukan link Drive — copy link-nya dulu di Drive');
      return;
    }
    const row = document.getElementById(rowId);
    row.querySelector('.aset-link').value = text;
    previewAsetRow(rowId);
    showToast('Link ditempel ✓');
  } catch (e) {
    showToast('Gagal baca clipboard — tempel manual aja di field-nya');
  }
}

function startDirectUpload(rowId) {
  if (!UPLOAD_SCRIPT_URL) {
    showToast('Upload langsung belum aktif (UPLOAD_SCRIPT_URL belum diisi) — pake cara manual dulu');
    return;
  }
  const row = document.getElementById(rowId);
  const akunEmail = row.querySelector('.aset-akun').value;
  if (!akunEmail) { showToast('Pilih akun Drive-nya dulu di dropdown'); return; }
  if (akunEmail === 'pribadi') {
    showToast('Buat "Akun pribadi", upload otomatis belum bisa — pake "Buka Drive" + "Tempel Link" buat opsi ini');
    return;
  }
  pendingUploadRowId = rowId;
  pendingAkunEmail = akunEmail;
  const input = document.getElementById('drive-upload-input');
  input.accept = '';
  input.click();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function driveFolderIdFromLink(link) {
  if (!link) return null;
  const m = link.match(/\/folders\/([a-zA-Z0-9_-]+)/) || link.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

async function handleDriveFilePicked(e) {
  const file = e.target.files[0];
  const rowId = pendingUploadRowId;
  if (!file || !rowId) return;

  const MAX_SIZE = 15 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    showToast('File kegedean buat upload otomatis (maks 15MB) — pake cara manual aja');
    e.target.value = '';
    return;
  }

  const isGallery = rowId === 'GALLERY';
  const isProfile = rowId === 'PROFILE';
  const row = (isGallery || isProfile) ? null : document.getElementById(rowId);
  const btn = isGallery ? document.getElementById('gallery-upload-btn')
    : isProfile ? document.getElementById('profile-photo-btn')
    : row?.querySelector('.aset-upload-btn');
  const btnLabel = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Uploading...'; }

  try {
    let folderId = null;
    if (!isProfile) {
      const acc = DRIVE_ACCOUNTS.find(a => a.email === pendingAkunEmail);
      folderId = driveFolderIdFromLink(acc?.folderLink);
      if (!folderId) throw new Error('Link folder upload buat akun ini belum di-set di Settings');
    }

    const fileData = await fileToBase64(file);
    const res = await fetch(UPLOAD_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret: UPLOAD_SECRET,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileData,
        folderId,
      }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'upload gagal');

    if (isProfile) {
      const photoUrl = `https://lh3.googleusercontent.com/d/${result.fileId}=w200-h200`;
      await db.collection('users').doc(currentUser.id).set({ photo: photoUrl }, { merge: true });
      currentUser.photo = photoUrl;
      renderProfileHeader();
      showToast('Foto profil diupdate ✓');
    } else if (isGallery) {
      document.getElementById('gallery-link').value = result.viewLink;
      if (!document.getElementById('gallery-label').value) document.getElementById('gallery-label').value = file.name;
      previewGalleryLink();
      showToast('Upload beres — tap "Tambah ke Gallery" buat nyimpen ✓');
    } else {
      row.querySelector('.aset-link').value = result.viewLink;
      if (!row.querySelector('.aset-label').value) row.querySelector('.aset-label').value = file.name;
      previewAsetRow(rowId);
      showToast('Upload beres ✓');
    }
  } catch (err) {
    showToast('Upload gagal (' + err.message + ') — coba cara manual aja');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
    e.target.value = '';
  }
}

async function submitUpload() {
  const nama = document.getElementById('upload-nama').value.trim();
  const deadline = document.getElementById('upload-deadline').value;
  if (!nama || !deadline) { showToast('Nama project & deadline wajib diisi'); return; }

  const brief = document.getElementById('upload-brief').value.trim();
  const aset = uploadAsetRows.map(rowId => {
    const row = document.getElementById(rowId);
    if (!row) return null;
    return {
      label: row.querySelector('.aset-label').value.trim(),
      link: row.querySelector('.aset-link').value.trim(),
      akun: row.querySelector('.aset-akun').value,
    };
  }).filter(a => a && (a.label || a.link));

  try {
    await db.collection('projects').add({
      nama, deadline, brief,
      assignedTo: [...uploadAssignees],
      status: uploadStatus,
      aset,
    });
    showToast('Project ditambahkan ✓');
    showView('home');
  } catch (e) {
    showToast('Gagal simpan: ' + e.message);
  }
}

/* ---------- Gallery ---------- */

function renderGallery() {
  const akunSel = document.getElementById('gallery-akun');
  if (akunSel) {
    akunSel.innerHTML = '<option value="">Disimpen di akun mana?</option>' +
      DRIVE_ACCOUNTS.map(a => `<option value="${a.email}">${a.email} (${a.kelompok}${a.persen >= 85 ? ' · hampir penuh' : ''})</option>`).join('') +
      '<option value="pribadi">Akun pribadi (bukan salah satu di atas)</option>';
  }

  const albumSel = document.getElementById('gallery-album');
  if (albumSel) {
    albumSel.innerHTML = '<option value="">Belum Dikategorikan</option>' +
      ALBUMS.map(a => `<option value="${a.id}">${escapeHtml(a.nama)}</option>`).join('');
  }

  const chips = document.getElementById('album-chips');
  if (chips) {
    chips.innerHTML = ALBUMS.map(a =>
      `<button type="button" class="chip-option" onclick="renameAlbum('${a.id}', ${JSON.stringify(a.nama)})">${escapeHtml(a.nama)} <span class="chip-x" onclick="event.stopPropagation();deleteAlbum('${a.id}')">✕</span></button>`
    ).join('') + `<button type="button" class="chip-option" onclick="createAlbum()">＋ Album Baru</button>`;
  }

  const grid = document.getElementById('gallery-grid');
  if (GALLERY.length === 0) {
    grid.innerHTML = `<div class="empty-state">${archMarkSvg()}<p>Gallery masih kosong. Tambah lewat form di bawah.</p></div>`;
    return;
  }

  const groups = [...ALBUMS.map(a => ({ id: a.id, nama: a.nama })), { id: '', nama: 'Belum Dikategorikan' }]
    .map(g => ({ ...g, items: GALLERY.filter(it => (it.albumId || '') === g.id) }))
    .filter(g => g.items.length > 0);

  grid.innerHTML = groups.length === 0
    ? `<div class="empty-state">${archMarkSvg()}<p>Belum ada aset di Gallery.</p></div>`
    : groups.map(g => `<div class="gallery-album-group">
        <div class="gallery-album-heading">${escapeHtml(g.nama)} <span class="deadline-tag">${g.items.length}</span></div>
        <div class="gallery-grid-inner">${g.items.map(galleryItemHtml).join('')}</div>
      </div>`).join('');
}

function galleryItemHtml(g) {
  const url = driveEmbedUrl(g.link);
  return `<div class="gallery-item">
    ${url ? `<iframe src="${url}" loading="lazy"></iframe>` : `<div class="aset-empty">Link belum valid</div>`}
    <div class="gallery-item-label"><span>${escapeHtml(g.label)}</span><button class="gallery-item-delete" onclick="deleteGalleryItem('${g.id}')" aria-label="Hapus">🗑</button></div>
    <select class="gallery-item-album-select" onchange="reassignAlbum('${g.id}', this.value)">
      <option value="" ${!g.albumId ? 'selected' : ''}>Belum Dikategorikan</option>
      ${ALBUMS.map(a => `<option value="${a.id}" ${g.albumId === a.id ? 'selected' : ''}>${escapeHtml(a.nama)}</option>`).join('')}
    </select>
  </div>`;
}

async function createAlbum() {
  const nama = prompt('Nama album baru:');
  if (!nama || !nama.trim()) return;
  try {
    await db.collection('albums').add({ nama: nama.trim() });
    showToast('Album dibuat ✓');
  } catch (e) { showToast('Gagal buat album: ' + e.message); }
}

async function renameAlbum(id, oldName) {
  const nama = prompt('Ganti nama album:', oldName);
  if (!nama || !nama.trim() || nama.trim() === oldName) return;
  try {
    await db.collection('albums').doc(id).update({ nama: nama.trim() });
    showToast('Nama album diupdate ✓');
  } catch (e) { showToast('Gagal update: ' + e.message); }
}

async function deleteAlbum(id) {
  if (!confirm('Hapus album ini? Isinya gak ikut kehapus, cuma balik jadi "Belum Dikategorikan".')) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection('albums').doc(id));
    const items = await db.collection('gallery').where('albumId', '==', id).get();
    items.forEach(doc => batch.update(doc.ref, { albumId: '' }));
    await batch.commit();
    showToast('Album dihapus');
  } catch (e) { showToast('Gagal hapus album: ' + e.message); }
}

async function reassignAlbum(itemId, albumId) {
  try {
    await db.collection('gallery').doc(itemId).update({ albumId });
    showToast('Dipindah ✓');
  } catch (e) { showToast('Gagal pindah album: ' + e.message); }
}

async function addGalleryItem() {
  const label = document.getElementById('gallery-label').value.trim();
  const link = document.getElementById('gallery-link').value.trim();
  const akun = document.getElementById('gallery-akun').value;
  const albumId = document.getElementById('gallery-album').value;
  if (!label || !link) { showToast('Isi label & link dulu'); return; }
  try {
    await db.collection('gallery').add({ label, link, akun, albumId });
    document.getElementById('gallery-label').value = '';
    document.getElementById('gallery-link').value = '';
    document.getElementById('gallery-akun').value = '';
    document.getElementById('gallery-album').value = '';
    document.getElementById('gallery-link-preview').innerHTML = '';
    showToast('Ditambahkan ke Gallery ✓');
  } catch (e) {
    showToast('Gagal simpan: ' + e.message);
  }
}

async function deleteGalleryItem(id) {
  if (!confirm('Yakin mau hapus dari Gallery?')) return;
  try {
    await db.collection('gallery').doc(id).delete();
    showToast('Dihapus dari Gallery');
  } catch (e) {
    showToast('Gagal hapus: ' + e.message);
  }
}

function previewGalleryLink() {
  const url = driveEmbedUrl(document.getElementById('gallery-link').value);
  document.getElementById('gallery-link-preview').innerHTML = url ? `<iframe src="${url}" loading="lazy"></iframe>` : '';
}

async function pasteGalleryFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.includes('drive.google.com')) {
      showToast('Clipboard bukan link Drive — copy link-nya dulu di Drive');
      return;
    }
    document.getElementById('gallery-link').value = text;
    previewGalleryLink();
    showToast('Link ditempel ✓');
  } catch (e) {
    showToast('Gagal baca clipboard — tempel manual aja di field-nya');
  }
}

function startGalleryUpload() {
  if (!UPLOAD_SCRIPT_URL) { showToast('Upload langsung belum aktif — pake cara manual dulu'); return; }
  const akunEmail = document.getElementById('gallery-akun').value;
  if (!akunEmail) { showToast('Pilih akun Drive-nya dulu'); return; }
  if (akunEmail === 'pribadi') {
    showToast('Buat "Akun pribadi", upload otomatis belum bisa — pake "Buka Drive" + "Tempel Link" buat opsi ini');
    return;
  }
  pendingUploadRowId = 'GALLERY';
  pendingAkunEmail = akunEmail;
  const input = document.getElementById('drive-upload-input');
  input.accept = '';
  input.click();
}

function startProfilePhotoUpload() {
  if (!UPLOAD_SCRIPT_URL) { showToast('Upload foto belum aktif — coba lagi nanti'); return; }
  pendingUploadRowId = 'PROFILE';
  pendingAkunEmail = null;
  const input = document.getElementById('drive-upload-input');
  input.accept = 'image/*';
  input.click();
}

/* ---------- Settings ---------- */

function renderProfileHeader() {
  document.getElementById('profile-avatar-wrap').innerHTML = currentUser ? avatarHtml(currentUser, 'lg') : '';
  document.getElementById('profile-name-display').textContent = currentUser ? currentUser.name : '';
}

function renderSettings() {
  renderProfileHeader();
  document.getElementById('profile-name-input').value = currentUser?.name || '';
  document.getElementById('profile-bio-input').value = currentUser?.bio || '';
  document.getElementById('profile-music').value = currentUser?.music || '';
  renderBgSwatches();

  document.getElementById('drive-list').innerHTML = DRIVE_ACCOUNTS.map(a => `
    <div class="drive-row">
      <div class="drive-row-top">
        <span class="drive-email">${a.email}</span>
        <span class="drive-tag">${a.kelompok}</span>
      </div>
      <div class="drive-bar"><div class="drive-bar-fill ${a.persen >= 85 ? 'warn' : ''}" style="width:${a.persen}%"></div></div>
      <div class="drive-percent-row">
        <input type="number" min="0" max="100" value="${a.persen}" onchange="updateDrivePersen('${a.id}', this.value)"> % terpakai
      </div>
      <input type="text" class="drive-folder-input" placeholder="Link folder upload (Anyone with link — Editor)" value="${a.folderLink || ''}" onchange="updateDriveFolder('${a.id}', this.value)">
    </div>
  `).join('');
}

async function updateDriveFolder(id, link) {
  try {
    await db.collection('driveAccounts').doc(id).update({ folderLink: link.trim() });
    showToast('Link folder disimpan ✓');
  } catch (e) {
    showToast('Gagal simpan: ' + e.message);
  }
}

function openAsetDriveFolder(rowId) {
  const row = document.getElementById(rowId);
  const email = row.querySelector('.aset-akun').value;
  const acc = DRIVE_ACCOUNTS.find(a => a.email === email);
  window.open(acc?.folderLink || 'https://drive.google.com', '_blank');
}

function openGalleryDriveFolder() {
  const email = document.getElementById('gallery-akun').value;
  const acc = DRIVE_ACCOUNTS.find(a => a.email === email);
  window.open(acc?.folderLink || 'https://drive.google.com', '_blank');
}

async function updateDrivePersen(id, val) {
  const persen = Math.max(0, Math.min(100, Number(val) || 0));
  try {
    await db.collection('driveAccounts').doc(id).update({ persen });
  } catch (e) {
    showToast('Gagal update: ' + e.message);
  }
}

async function saveProfile() {
  const name = document.getElementById('profile-name-input').value.trim();
  const bio = document.getElementById('profile-bio-input').value.trim();
  const music = document.getElementById('profile-music').value.trim();
  if (!currentUser || !name) return;
  try {
    await db.collection('users').doc(currentUser.id).set({ name, bio, music }, { merge: true });
    currentUser.name = name; currentUser.bio = bio; currentUser.music = music;
    renderProfileHeader();
    setupMusic();
    showToast('Profil disimpan ✓');
  } catch (e) {
    showToast('Gagal simpan: ' + e.message);
  }
}

function renderBgSwatches() {
  const wrap = document.getElementById('bg-swatches');
  if (!wrap) return;
  const current = currentUser?.bg || 'default';
  wrap.innerHTML = Object.keys(BG_THEMES).map(key =>
    `<button type="button" class="bg-swatch ${key === current ? 'selected' : ''}" style="background:${BG_THEMES[key] || '#F4F3EF'}" onclick="pickBg('${key}')" aria-label="${key}"></button>`
  ).join('');
}

async function pickBg(key) {
  if (!currentUser) return;
  currentUser.bg = key;
  applyUserBg();
  renderBgSwatches();
  try {
    await db.collection('users').doc(currentUser.id).set({ bg: key }, { merge: true });
  } catch (e) {
    showToast('Gagal simpan warna: ' + e.message);
  }
}

async function pasteMusicFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.includes('drive.google.com')) {
      showToast('Clipboard bukan link Drive — copy link-nya dulu di Drive');
      return;
    }
    document.getElementById('profile-music').value = text;
    showToast('Link ditempel ✓ — tap Simpan Profil buat aktifin');
  } catch (e) {
    showToast('Gagal baca clipboard — tempel manual aja di field-nya');
  }
}

async function changePassword() {
  const p1 = document.getElementById('profile-newpass').value;
  const p2 = document.getElementById('profile-newpass-confirm').value;
  if (!p1 || p1 !== p2) { showToast('Password baru & konfirmasi harus sama'); return; }
  try {
    await auth.currentUser.updatePassword(p1);
    document.getElementById('profile-newpass').value = '';
    document.getElementById('profile-newpass-confirm').value = '';
    showToast('Password diganti ✓');
  } catch (e) {
    showToast('Gagal ganti password, coba logout-login ulang dulu (' + e.code + ')');
  }
}

/* ---------- Utils ---------- */

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function celebrate(originEl) {
  const rect = originEl.getBoundingClientRect();
  const colors = ['var(--brass)', 'var(--dusk)', 'var(--sage)'];
  for (let i = 0; i < 14; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (rect.left + rect.width / 2) + 'px';
    piece.style.top = rect.top + 'px';
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--dx', (Math.random() * 150 - 75) + 'px');
    piece.style.setProperty('--rot', (Math.random() * 360) + 'deg');
    piece.style.animationDelay = (Math.random() * 0.1) + 's';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1000);
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function archMarkSvg() {
  return `<svg class="arch-mark" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="arch-body" d="M6 42V22C6 11 14 4 24 4C34 4 42 11 42 22V42H33V22C33 16 29 13 24 13C19 13 15 16 15 22V42H6Z"/>
    <path class="arch-key" d="M20 4H28L26 12H22L20 4Z"/>
  </svg>`;
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('dropdown-menu');
  const btn = document.getElementById('menu-btn');
  if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== btn) {
    closeMenu();
  }
});

initTheme();
teamLoadPromise = loadTeamForLogin();

document.getElementById('music-audio').addEventListener('timeupdate', function () {
  const fill = document.getElementById('music-bar-fill');
  if (fill && this.duration) fill.style.width = (this.currentTime / this.duration * 100) + '%';
});
