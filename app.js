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
  appId: "1:263094318099:web:2ac146e842a16035cebbe6",
};
window.BK_FIREBASE_CONFIG = firebaseConfig;
firebase.initializeApp(firebaseConfig);

// App Check untuk Firebase AI Logic diinisialisasi di ai.js pada modular Firebase app.
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
let activeVoiceRecorder = null;
let activeVoiceChunks = [];
let activeVoiceMode = null;

/* Link Web App Google Apps Script yang dipasang di akun Drive tim —
   dipakai fitur "Upload Langsung ke Drive" & "Ganti Foto" biar upload
   jalan TANPA login Google sama sekali (baca PANDUAN-SETUP-UPLOAD.md
   buat cara masangnya). Kosongin ("") kalau belum di-setup — tombolnya
   otomatis kasih tau minta pake cara manual dulu, gak bikin error. */
// Firebase Cloud Messaging Web Push. Isi VAPID key dari Firebase Console > Project settings > Cloud Messaging > Web configuration.
// Tanpa VAPID key, prompt browser tetap bisa dipakai untuk notifikasi saat web aktif, tetapi push saat web ditutup belum bisa didaftarkan.
const FCM_VAPID_KEY = "";
let bkMessaging = null;
let bkMessagingRegistration = null;

const UPLOAD_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzs7uwNHRDkNYboBhfv-rBvJa2yEenNPZivKN8YpXyfAaWkR9sjLR1iwJqsKF65tZhalg/exec";
const UPLOAD_SECRET = "mdc262"; // HARUS SAMA PERSIS kayak SHARED_SECRET di Apps Script
const CHAT_MEDIA_FOLDER_ID = "1WBro6pIrdW_eVRrmT5bSdHt_7VP9n4Nb"; // servermdc2 — khusus media chat

// servermdc2 storage monitor — usage is fetched from the existing Apps Script bridge.
const CHAT_MEDIA_ACCOUNT_KEY = 'servermdc2';
const CHAT_MEDIA_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
let serverMdc2UsageRequest = null;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB','MB','GB','TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 1 : 2)} ${units[i]}`;
}

async function refreshServerMdc2Usage() {
  if (!UPLOAD_SCRIPT_URL || serverMdc2UsageRequest) return serverMdc2UsageRequest;
  serverMdc2UsageRequest = (async () => {
    try {
      const url = `${UPLOAD_SCRIPT_URL}?action=storageInfo&secret=${encodeURIComponent(UPLOAD_SECRET)}`;
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Gagal membaca storage');
      const used = Number(data.usedBytes) || 0;
      const limit = Number(data.limitBytes) || CHAT_MEDIA_STORAGE_LIMIT_BYTES;
      const pct = Math.max(0, Math.min(100, (used / limit) * 100));
      const acc = DRIVE_ACCOUNTS.find(a => String(a.email || '').toLowerCase().includes(CHAT_MEDIA_ACCOUNT_KEY));
      if (acc) {
        acc.persen = pct;
        acc.usedBytes = used;
        acc.limitBytes = limit;
        acc.storageAuto = true;
      }
      updateServerMdc2UsageUI({used, limit, pct});
      return {used, limit, pct};
    } catch (e) {
      console.warn('servermdc2 storage monitor:', e);
      updateServerMdc2UsageUI(null);
      return null;
    } finally {
      serverMdc2UsageRequest = null;
    }
  })();
  return serverMdc2UsageRequest;
}

function updateServerMdc2UsageUI(info) {
  const row = document.querySelector('[data-drive-account="servermdc2"]');
  if (!row) return;
  const bar = row.querySelector('.drive-bar-fill');
  const text = row.querySelector('.drive-auto-storage');
  if (!info) {
    if (text) text.textContent = 'Storage otomatis belum tersedia';
    return;
  }
  const pct = Math.round(info.pct * 10) / 10;
  if (bar) { bar.style.width = `${pct}%`; bar.classList.toggle('warn', pct >= 85); }
  if (text) text.textContent = `${formatBytes(info.used)} / ${formatBytes(info.limit)} · ${pct}% terpakai · otomatis`;
}
let pendingUploadRowId = null;
let pendingAkunEmail = null;

function emailFor(id) { return id + '@batukunci.app'; }
function idFromEmail(email) { return (email || '').split('@')[0]; }

const GROUP_OWNER_ID = 'muhammadfadlimustafidin-mdc.26.2';
let currentUser = null;
let activeTab = 'belum';
let expandedProjectId = null;
let uploadAssignees = [];
let uploadStatus = 'belum';
let uploadAsetRows = [];
let asetRowSeq = 0;
let unsubProjects = null, unsubDrive = null, unsubGallery = null, unsubAlbums = null, unsubNotifications = null, unsubChatMessages = null;
let projectsFirstLoadDone = false;
let teamLoadPromise = null;
let chatTab = 'comments';
let selectedCommentProjectId = null;
let selectedGroupId = null;
let selectedDmUserId = null;
let notificationCache = [];

const BG_THEMES = { default: null, dusk: '#EDF1F5', sage: '#EEF3EE', brass: '#F8F1E2', rose: '#F7ECE9' };

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('bk-theme'); } catch (e) {}
  const theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('bk-theme', next); } catch (e) {}
  applyUserBg();
}

function applyUserBg() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const key = currentUser?.bg;
  const color = !isDark && key ? BG_THEMES[key] : null;
  if (color) document.documentElement.style.setProperty('--stone', color);
  else document.documentElement.style.removeProperty('--stone');
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
    currentUser.authEmail = user.email;
    currentUser.authUid = user.uid;
    window.BK_AI_ALLOWED = true;
    document.getElementById('ai-fab')?.classList.remove('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    projectsFirstLoadDone = false;
    applyUserBg();
    setupMusic();
    await ensureDefaultGroup();
    startLiveData();
    showView('home');
    startNotifications();
    initNotificationSystem();
  } else {
    stopLiveData();
    stopChatMessages();
    stopNotifications();
    currentUser = null;
    window.BK_AI_ALLOWED = false;
    document.getElementById('ai-fab')?.classList.add('hidden');
    window.closeBatuKunciAI?.();
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

function toggleMenu() {
  const menu = document.getElementById('dropdown-menu');
  const btn = document.getElementById('menu-btn');
  if (!menu || !btn) return;
  const willOpen = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !willOpen);
  btn.setAttribute('aria-expanded', String(willOpen));
  btn.setAttribute('aria-label', willOpen ? 'Tutup menu' : 'Buka menu');
}
function closeMenu() {
  const menu = document.getElementById('dropdown-menu');
  const btn = document.getElementById('menu-btn');
  if (menu) menu.classList.add('hidden');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Buka menu');
  }
}

function toggleMobileNav() {
  const nav = document.querySelector('.mobile-bottom-nav');
  const btn = document.querySelector('.mobile-nav-collapse');
  if (!nav || !btn) return;
  const collapsed = !nav.classList.contains('is-collapsed');
  nav.classList.toggle('is-collapsed', collapsed);
  document.body.classList.toggle('mobile-nav-collapsed', collapsed);
  btn.textContent = collapsed ? '⌃' : '⌄';
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Tampilkan navigasi bawah' : 'Sembunyikan navigasi bawah');
}

function showView(view) {
  closeMenu();
  ['home', 'upload', 'gallery', 'chat', 'settings'].forEach(v =>
    document.getElementById('view-' + v).classList.toggle('hidden', v !== view)
  );
  if (view === 'home') renderHome();
  if (view === 'upload') renderUploadForm();
  if (view === 'gallery') renderGallery();
  if (view === 'settings') renderSettings();
  if (view === 'chat') renderChat();

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === view);
  });

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

  const activeProjects = PROJECTS.filter(p => p.status !== 'selesai').length;
  const processProjects = PROJECTS.filter(p => p.status === 'proses').length;
  const albumTotal = ALBUMS.length;
  const activeEl = document.getElementById('stat-active-projects');
  const processEl = document.getElementById('stat-process-projects');
  const albumEl = document.getElementById('stat-albums');
  if (activeEl) activeEl.textContent = activeProjects;
  if (processEl) processEl.textContent = processProjects;
  if (albumEl) albumEl.textContent = albumTotal;

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
      <div class="project-comments-mini"><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openProjectComments('${p.id}')">💬 Komentar</button></div>
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
      createdBy: currentUser?.id || '',
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
  updateNotificationPermissionUI();

  document.getElementById('drive-list').innerHTML = DRIVE_ACCOUNTS.map(a => {
    const isChatDrive = String(a.email || '').toLowerCase().includes(CHAT_MEDIA_ACCOUNT_KEY);
    return `
    <div class="drive-row" ${isChatDrive ? 'data-drive-account="servermdc2"' : ''}>
      <div class="drive-row-top">
        <span class="drive-email">${a.email}</span>
        <span class="drive-tag">${a.kelompok}</span>
      </div>
      <div class="drive-bar"><div class="drive-bar-fill ${a.persen >= 85 ? 'warn' : ''}" style="width:${Number(a.persen)||0}%"></div></div>
      ${isChatDrive
        ? `<div class="drive-auto-storage">${a.usedBytes ? `${formatBytes(a.usedBytes)} / ${formatBytes(a.limitBytes || CHAT_MEDIA_STORAGE_LIMIT_BYTES)} · ${Number(a.persen).toFixed(1)}% terpakai · otomatis` : 'Mengambil penggunaan storage…'}</div>`
        : `<div class="drive-percent-row"><input type="number" min="0" max="100" value="${a.persen}" onchange="updateDrivePersen('${a.id}', this.value)"> % terpakai</div>`}
      <input type="text" class="drive-folder-input" placeholder="Link folder upload (Anyone with link — Editor)" value="${a.folderLink || ''}" onchange="updateDriveFolder('${a.id}', this.value)">
    </div>`;
  }).join('');
  refreshServerMdc2Usage();
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


/* ---------- Browser Push Notifications ---------- */
function notificationPreferenceKey() { return currentUser ? `bk-notifications-${currentUser.id}` : 'bk-notifications'; }
function getNotificationPreference() {
  try {
    const v = localStorage.getItem(notificationPreferenceKey());
    return v === null ? true : v === '1';
  } catch(e) { return true; }
}
function updateNotificationPermissionUI() {
  const toggle = document.getElementById('notification-setting-toggle');
  const title = document.getElementById('notification-permission-title');
  const text = document.getElementById('notification-permission-text');
  const box = document.getElementById('notification-permission-box');
  if (toggle) toggle.checked = getNotificationPreference();
  if (!title || !text) return;
  if (!('Notification' in window)) {
    title.textContent = 'Status: browser tidak mendukung';
    text.textContent = 'Browser ini tidak menyediakan Web Notification.';
    return;
  }
  const p = Notification.permission;
  if (p === 'granted') {
    title.textContent = 'Status: aktif ✓';
    text.textContent = 'Notifikasi browser sudah diizinkan di perangkat ini.';
    if (box) box.classList.remove('needs-permission');
  } else if (p === 'denied') {
    title.textContent = 'Status: diblokir';
    text.textContent = 'Chrome memblokir notifikasi. Aktifkan lagi dari pengaturan izin situs Chrome.';
    if (box) box.classList.add('needs-permission');
  } else {
    title.textContent = 'Status: menunggu izin';
    text.textContent = 'Saat diizinkan, Batu Kunci dapat menampilkan reminder dan pesan baru sebagai notifikasi Chrome.';
    if (box) box.classList.add('needs-permission');
  }
}
async function setNotificationPreference(enabled) {
  try { localStorage.setItem(notificationPreferenceKey(), enabled ? '1' : '0'); } catch(e) {}
  if (enabled) await requestNotificationPermission(false);
  updateNotificationPermissionUI();
}
async function requestNotificationPermission(force = false) {
  if (!('Notification' in window)) { updateNotificationPermissionUI(); return 'unsupported'; }
  if (!force && !getNotificationPreference()) return Notification.permission;
  try {
    const permission = await Notification.requestPermission();
    updateNotificationPermissionUI();
    if (permission === 'granted') await registerFirebasePush();
    return permission;
  } catch (e) {
    console.warn('Notification permission:', e);
    updateNotificationPermissionUI();
    return 'error';
  }
}
async function registerFirebasePush() {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    bkMessagingRegistration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    if (!FCM_VAPID_KEY || !window.firebase.messaging) {
      console.info('Batu Kunci: Web Push FCM belum didaftarkan karena VAPID key belum diisi.');
      return;
    }
    bkMessaging = firebase.messaging();
    const token = await bkMessaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: bkMessagingRegistration });
    if (token && currentUser) {
      await db.collection('users').doc(currentUser.id).set({ notificationEnabled: true, fcmToken: token, fcmTokenUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    bkMessaging.onMessage(payload => {
      if (!getNotificationPreference()) return;
      const title = payload.notification?.title || payload.data?.title || 'Batu Kunci';
      const body = payload.notification?.body || payload.data?.body || 'Ada pembaruan baru.';
      try { new Notification(title, { body, icon: './icon-192.png', tag: payload.data?.tag || 'batukunci' }); } catch(e) {}
    });
  } catch (e) { console.warn('Batu Kunci FCM registration:', e); }
}
function initNotificationSystem() {
  updateNotificationPermissionUI();
  if (getNotificationPreference() && 'Notification' in window && Notification.permission === 'default') {
    // Delay sedikit supaya prompt tidak muncul sebelum halaman selesai dirender.
    setTimeout(() => requestNotificationPermission(false), 1400);
  } else if (getNotificationPreference() && Notification.permission === 'granted') {
    registerFirebasePush();
  }
}

/* ---------- Notifications & Chat ---------- */

function startNotifications() {
  if (!currentUser) return;
  stopNotifications();
  unsubNotifications = db.collection('notifications')
    .where('userId', '==', currentUser.id)
    .limit(30)
    .onSnapshot(snap => {
      notificationCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      notificationCache.sort((a,b) => ((b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      renderNotifications();
    }, e => console.warn('notifications listener', e));
  setTimeout(checkDeadlineReminders, 700);
}
function stopNotifications() { if (unsubNotifications) { unsubNotifications(); unsubNotifications = null; } notificationCache = []; renderNotifications(); }
function renderNotifications() {
  const list = document.getElementById('notification-list');
  const count = document.getElementById('notification-count');
  if (!list) return;
  const unread = notificationCache.filter(n => !n.read).length;
  if (count) { count.textContent = unread > 9 ? '9+' : unread; count.classList.toggle('hidden', unread === 0); }
  list.innerHTML = notificationCache.length ? notificationCache.map(n => `<button class="notification-item ${n.read ? '' : 'unread'}" onclick="openNotification('${n.id}', '${escapeAttr(n.projectId || '')}')"><span class="notification-dot"></span><span><strong>${escapeHtml(n.title || 'Notifikasi')}</strong><small>${escapeHtml(n.body || '')}</small></span></button>`).join('') : '<div class="notification-empty">Belum ada notifikasi.</div>';
}
function toggleNotifications() { const p = document.getElementById('notification-panel'); if (!p) return; p.classList.toggle('hidden'); }
async function markNotificationsRead() { if (!currentUser) return; const unread = notificationCache.filter(n => !n.read).slice(0, 20); try { const batch = db.batch(); unread.forEach(n => batch.update(db.collection('notifications').doc(n.id), { read: true })); await batch.commit(); } catch(e) { console.warn(e); } }
async function openNotification(id, projectId) { try { await db.collection('notifications').doc(id).set({read:true}, {merge:true}); } catch(e){} document.getElementById('notification-panel')?.classList.add('hidden'); if (projectId) { expandedProjectId = projectId; activeTab = 'belum'; showView('home'); } }
function requestBrowserNotifications() { if ('Notification' in window && Notification.permission === 'default') { setTimeout(() => Notification.requestPermission().catch(()=>{}), 1200); } }
async function checkDeadlineReminders() {
  if (!currentUser) return;
  const today = new Date(); today.setHours(0,0,0,0);
  for (const p of PROJECTS) {
    if (!p.deadline || p.status === 'selesai') continue;
    const left = daysUntil(p.deadline);
    if (left < 0 || left > 3) continue;
    const key = `${currentUser.id}_${p.id}_${p.deadline}_h3`.replace(/[^a-zA-Z0-9_-]/g,'_');
    const title = left === 0 ? 'Deadline hari ini' : `Deadline H-${left}`;
    const body = `Project “${p.nama}” belum selesai dan deadline ${formatTanggal(p.deadline)}.`;
    try {
      const ref = db.collection('notifications').doc(key);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({userId: currentUser.id, projectId: p.id, type:'deadline', title, body, read:false, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
        if (getNotificationPreference() && 'Notification' in window && Notification.permission === 'granted') new Notification(title, {body, tag:`deadline-${p.id}`});
      }
    } catch (e) { console.warn('deadline reminder', e); }
  }
}

function escapeAttr(s) { return String(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }
function setChatTab(tab) {
  chatTab = tab;
  document.querySelectorAll('.chat-tab').forEach(b => b.classList.toggle('active', b.dataset.chatTab === tab));
  ['comments','groups','dm'].forEach(x => document.getElementById('chat-'+x+'-panel')?.classList.toggle('hidden', x !== tab));
  renderChat();
}
function renderChat() {
  if (!document.getElementById('view-chat')) return;
  if (chatTab === 'comments') renderCommentPicker();
  if (chatTab === 'groups') renderGroups();
  if (chatTab === 'dm') renderDms();
}
function renderCommentPicker() {
  const sel = document.getElementById('comment-project-select'); if (!sel) return;
  if (!PROJECTS.length) { sel.innerHTML = '<option value="">Belum ada project</option>'; document.getElementById('project-comments').innerHTML='<div class="chat-empty">Belum ada project untuk dikomentari.</div>'; return; }
  if (!selectedCommentProjectId || !PROJECTS.some(p=>p.id===selectedCommentProjectId)) selectedCommentProjectId = PROJECTS[0].id;
  sel.innerHTML = PROJECTS.map(p=>`<option value="${p.id}" ${p.id===selectedCommentProjectId?'selected':''}>${escapeHtml(p.nama)}</option>`).join('');
  loadProjectComments(selectedCommentProjectId);
}
function selectCommentProject(id) { selectedCommentProjectId=id; loadProjectComments(id); }
function openProjectComments(id) { selectedCommentProjectId=id; showView('chat'); setChatTab('comments'); }
function loadProjectComments(projectId) {
  if (unsubChatMessages) { unsubChatMessages(); unsubChatMessages=null; }
  const box=document.getElementById('project-comments'); if (!box || !projectId) return;
  unsubChatMessages = db.collection('projects').doc(projectId).collection('comments').orderBy('createdAt','asc').onSnapshot(snap=>{
    box.innerHTML = snap.empty ? '<div class="chat-empty">Belum ada komentar. Mulai obrolannya.</div>' : snap.docs.map(d=>messageHtml({id:d.id,...d.data()})).join(''); box.scrollTop=box.scrollHeight;
  }, e=>{ box.innerHTML='<div class="chat-empty">Komentar belum bisa dimuat.</div>'; console.warn(e); });
}
async function sendProjectComment(e) { e.preventDefault(); const input=document.getElementById('project-comment-input'); const text=(input?.value||'').trim(); if(!text||!selectedCommentProjectId||!currentUser)return; input.value=''; await db.collection('projects').doc(selectedCommentProjectId).collection('comments').add({senderId:currentUser.id,senderName:currentUser.name,text,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); }
function chatUsername(user){
  if(!user) return '';
  const raw=String(user.username||user.userName||user.handle||user.id||user.name||'').trim();
  return raw.replace(/^@+/,'').replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,32) || 'user';
}
function groupMentionCandidates(group){
  if(!group) return [];
  return groupMemberIds(group).map(id=>findUser(id)).filter(Boolean);
}
function escapeRegex(s){return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function renderChatText(text, mentions=[], mentionAll=false){
  let out=escapeHtml(text||'');
  if(mentionAll) out=out.replace(/(^|\s)@all(?=\s|$)/gi,'$1<span class="chat-mention all">@all</span>');
  (mentions||[]).forEach(id=>{
    const u=findUser(id); if(!u)return;
    const handle=chatUsername(u); if(!handle)return;
    const re=new RegExp('(^|\\s)@'+escapeRegex(handle)+'(?=\\s|$)','gi');
    out=out.replace(re,(match,prefix)=>prefix+'<span class="chat-mention">@'+handle+'</span>');
  });
  return `<div class="chat-text">${out}</div>`;
}
function messageHtml(m) {
  const mine=m.senderId===currentUser?.id;
  const attachment=m.attachment ? renderChatAttachment(m.attachment) : '';
  const text=m.text ? renderChatText(m.text,m.mentions,m.mentionAll) : '';
  return `<div class="chat-message ${mine?'mine':''}"><div class="chat-avatar">${initials(m.senderName||findUser(m.senderId)?.name||'?')}</div><div><div class="chat-message-meta"><strong>${escapeHtml(m.senderName||findUser(m.senderId)?.name||'Anggota')}</strong><small>${formatChatTime(m.createdAt)}</small></div><div class="chat-bubble">${attachment}${text}</div></div></div>`;
}
function chatDriveUrls(a){
  const fileId = String(a?.fileId || '').trim();
  const viewLink = String(a?.driveViewLink || a?.url || '').trim();
  if (!fileId) return { view:viewLink, download:viewLink, thumbnail:viewLink };
  return {
    view: viewLink || `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`,
    download: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    thumbnail: `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`
  };
}
function renderChatAttachment(a){
  if(!a)return '';
  const u=chatDriveUrls(a);
  const name=escapeHtml(a.name||'Lampiran');
  if(a.type==='image'){
    return `<div class="chat-media-wrap image"><a class="chat-media image" href="${escapeAttr(u.view)}" target="_blank" rel="noopener"><img src="${escapeAttr(u.thumbnail)}" alt="Foto" loading="lazy" onerror="this.onerror=null;this.src='${escapeAttr(u.view)}';"></a><a class="chat-media-open" href="${escapeAttr(u.view)}" target="_blank" rel="noopener">Buka foto</a></div>`;
  }
  if(a.type==='video'){
    return `<div class="chat-media-wrap video"><video class="chat-media video" controls preload="none" playsinline src="${escapeAttr(u.download)}"></video><a class="chat-media-open" href="${escapeAttr(u.view)}" target="_blank" rel="noopener">Buka video</a></div>`;
  }
  if(a.type==='audio'){
    return `<div class="chat-audio"><span>🎙️ VN</span><audio controls preload="none" src="${escapeAttr(u.download)}"></audio><a class="chat-media-open" href="${escapeAttr(u.view)}" target="_blank" rel="noopener">Buka VN</a></div>`;
  }
  return `<a class="chat-file" href="${escapeAttr(u.view)}" target="_blank" rel="noopener">📎 ${name}</a>`;
}
function formatChatTime(ts) { const d=ts?.toDate?ts.toDate():new Date(); return d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}); }
function groupIsAdmin(group) { return !!(group && currentUser && Array.isArray(group.adminEmails) && group.adminEmails.includes(currentUser.authEmail)); }
function groupMemberIds(group) { return Array.isArray(group?.memberIds) ? group.memberIds : []; }
function groupMemberEmails(ids) { return (ids || []).map(id => id + '@batukunci.app'); }
function groupAdminIds(group) { return groupMemberIds(group).filter(id => (group.adminEmails || []).includes(id + '@batukunci.app')); }
async function ensureDefaultGroup() {
  if (!currentUser) return;
  const ref = db.collection('chats').doc('team-media-kreatif');
  try {
    const snap = await ref.get();
    const memberIds = TEAM.map(u=>u.id);
    const base = { type:'group', name:'Tim Media Kreatif', memberIds, memberEmails:groupMemberEmails(memberIds), updatedAt:firebase.firestore.FieldValue.serverTimestamp() };
    if (!snap.exists) {
      if (currentUser.id !== GROUP_OWNER_ID) return;
      await ref.set({...base, createdBy:GROUP_OWNER_ID, adminEmails:[GROUP_OWNER_ID+'@batukunci.app'], createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    } else if (currentUser.id === GROUP_OWNER_ID && !(snap.data()?.adminEmails || []).length) {
      await ref.set({adminEmails:[GROUP_OWNER_ID+'@batukunci.app'], memberEmails:groupMemberEmails(snap.data()?.memberIds||TEAM.map(u=>u.id))},{merge:true});
    }
    // Migrasi satu kali: grup lama tanpa admin menjadi milik Fadli.
    if (currentUser.id === GROUP_OWNER_ID) {
      const all = await db.collection('chats').where('type','==','group').get();
      const batch = db.batch(); let count = 0;
      all.docs.forEach(d => { const g=d.data(); if (!(g.adminEmails||[]).length || !(g.memberEmails||[]).length) { batch.set(d.ref,{adminEmails:(g.adminEmails&&g.adminEmails.length)?g.adminEmails:[GROUP_OWNER_ID+'@batukunci.app'], memberEmails:groupMemberEmails(g.memberIds||[]), updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); count++; } });
      if (count) await batch.commit();
    }
  } catch (e) { console.warn('group migration', e); }
}
async function renderGroups() {
  const list=document.getElementById('group-list'); if(!list)return;
  const snap=await db.collection('chats').where('memberEmails','array-contains',currentUser.authEmail).get();
  const groups=snap.docs.map(d=>({id:d.id,...d.data()})).filter(g=>g.type==='group' && groupMemberIds(g).includes(currentUser?.id));
  if(selectedGroupId && !groups.some(g=>g.id===selectedGroupId)) selectedGroupId=null;
  if(!selectedGroupId && groups[0]) selectedGroupId=groups[0].id;
  list.innerHTML=groups.length?groups.map(g=>`<button class="chat-list-item ${g.id===selectedGroupId?'active':''}" onclick="selectGroup('${g.id}')"><strong>${escapeHtml(g.name)}</strong><small>${groupMemberIds(g).length} anggota${groupIsAdmin(g)?' · Admin':''}</small></button>`).join(''):'<div class="chat-empty">Belum ada grup.</div>';
  if(selectedGroupId) loadGroupMessages(selectedGroupId);
}
function selectGroup(id){selectedGroupId=id;renderGroups();}
async function getSelectedGroup(){ if(!selectedGroupId)return null; const d=await db.collection('chats').doc(selectedGroupId).get(); return d.exists?{id:d.id,...d.data()}:null; }
function renderGroupAdminActions(group){
  const admin=groupIsAdmin(group);
  const btn=document.getElementById('group-edit-btn');
  const leaveBtn=document.getElementById('group-leave-btn');
  if(btn) btn.classList.toggle('hidden', !admin);
  if(leaveBtn) leaveBtn.classList.toggle('hidden', !group || !groupMemberIds(group).includes(currentUser?.id));
  const label=document.getElementById('group-chat-admin-label');
  if(label) label.textContent=admin?'Admin grup':'Anggota grup';
}
async function loadGroupMessages(id){
  if(unsubChatMessages){unsubChatMessages();unsubChatMessages=null;}
  const box=document.getElementById('group-messages'); const title=document.getElementById('group-chat-title'); if(!box)return;
  const d=await db.collection('chats').doc(id).get(); const group=d.exists?{id:d.id,...d.data()}:null;
  if(title) title.textContent=group?.name||'Grup'; renderGroupAdminActions(group);
  unsubChatMessages=db.collection('chats').doc(id).collection('messages').orderBy('createdAt','asc').onSnapshot(s=>{box.innerHTML=s.empty?'<div class="chat-empty">Belum ada pesan.</div>':s.docs.map(d=>messageHtml({id:d.id,...d.data()})).join('');box.scrollTop=box.scrollHeight;});
}
async function sendGroupMessage(e){
  e.preventDefault();
  const i=document.getElementById('group-message-input'); const text=(i?.value||'').trim();
  if(!text||!selectedGroupId)return;
  const group=await getSelectedGroup();
  if(!group||!groupMemberIds(group).includes(currentUser.id))return showToast('Anda bukan anggota grup ini.');
  i.value=''; hideMentionPicker();
  await sendChatText(selectedGroupId,text,collectMentions(text,group));
}
function collectMentions(text,group){
  const mentions=[]; const mentionAll=/(^|\s)@all(?=\s|$)/i.test(text);
  groupMentionCandidates(group).forEach(u=>{
    const h=chatUsername(u); if(h && new RegExp('(^|\\s)@'+escapeRegex(h)+'(?=\\s|$)','i').test(text)) mentions.push(u.id);
  });
  return {mentions:[...new Set(mentions)],mentionAll};
}
async function sendChatText(chatId,text,meta={mentions:[],mentionAll:false}){
  await db.collection('chats').doc(chatId).collection('messages').add({senderId:currentUser.id,senderName:currentUser.name,text,mentions:meta.mentions||[],mentionAll:!!meta.mentionAll,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  await db.collection('chats').doc(chatId).set({updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}
function hideMentionPicker(){const el=document.getElementById('group-mention-picker');if(el)el.classList.add('hidden');}
function getMentionQuery(input){
  const pos=input.selectionStart ?? input.value.length; const before=input.value.slice(0,pos);
  const m=before.match(/(^|\s)@([a-zA-Z0-9._-]*)$/); return m?{query:m[2].toLowerCase(),start:pos-m[2].length-1,end:pos}:null;
}
async function updateMentionPicker(){
  const input=document.getElementById('group-message-input'); const picker=document.getElementById('group-mention-picker'); if(!input||!picker)return;
  const q=getMentionQuery(input); if(!q){hideMentionPicker();return;}
  const group=await getSelectedGroup(); if(!group){hideMentionPicker();return;}
  const candidates=[{id:'__all__',name:'Semua anggota',handle:'all',all:true},...groupMentionCandidates(group).map(u=>({id:u.id,name:u.name,handle:chatUsername(u)}))].filter(x=>x.handle.toLowerCase().startsWith(q.query));
  if(!candidates.length){hideMentionPicker();return;}
  picker.innerHTML=candidates.map(x=>`<button type="button" class="chat-mention-option" onclick="insertGroupMention('${escapeAttr(x.handle)}')"><span class="chat-mention-at">@</span><span><strong>${escapeHtml(x.handle)}</strong><small>${escapeHtml(x.all?'Semua anggota':x.name)}</small></span></button>`).join('');
  picker.classList.remove('hidden');
}
function insertGroupMention(handle){
  const input=document.getElementById('group-message-input'); if(!input)return; const q=getMentionQuery(input); if(!q)return;
  const before=input.value.slice(0,q.start), after=input.value.slice(q.end); input.value=before+'@'+handle+' '+after; const pos=(before+'@'+handle+' ').length; input.focus(); input.setSelectionRange(pos,pos); hideMentionPicker();
}
document.addEventListener('input',e=>{if(e.target?.id==='group-message-input')updateMentionPicker();});
document.addEventListener('click',e=>{if(!e.target.closest('#group-message-input')&&!e.target.closest('#group-mention-picker'))hideMentionPicker();});
async function handleChatMediaSelected(input,mode){
  const file=input?.files?.[0]; input.value=''; if(!file)return;
  const chatId=mode==='group'?selectedGroupId:(selectedDmUserId?dmChatId(currentUser.id,selectedDmUserId):null);
  if(!chatId)return showToast('Pilih chat dulu.');
  if(file.size>50*1024*1024)return showToast('File maksimal 50 MB.');
  try{
    showToast('Mengunggah lampiran ke Drive…');
    const type=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':'file';
    const fileData=await fileToBase64(file);
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const res=await fetch(UPLOAD_SCRIPT_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({
        secret:UPLOAD_SECRET,
        fileName:`chat_${chatId}_${Date.now()}_${safeName}`,
        mimeType:file.type||'application/octet-stream',
        fileData,
        folderId:CHAT_MEDIA_FOLDER_ID
      })
    });
    const result=await res.json();
    if(!result.success)throw new Error(result.error||'upload gagal');
    const url=type==='image'
      ? `https://drive.google.com/uc?export=view&id=${result.fileId}`
      : `https://drive.google.com/uc?export=download&id=${result.fileId}`;
    await db.collection('chats').doc(chatId).collection('messages').add({
      senderId:currentUser.id,
      senderName:currentUser.name,
      text:'',
      attachment:{type,url,name:file.name,size:file.size,mime:file.type,fileId:result.fileId,driveViewLink:result.viewLink||''},
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('chats').doc(chatId).set({updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    showToast(type==='image'?'Foto terkirim ✓':type==='video'?'Video terkirim ✓':'File terkirim ✓');
  }catch(err){console.error(err);showToast('Gagal mengunggah: '+(err?.message||err));}
}
async function toggleVoiceRecording(mode){
  if(activeVoiceRecorder){ if(activeVoiceMode===mode) activeVoiceRecorder.stop(); return; }
  const chatId=mode==='group'?selectedGroupId:(selectedDmUserId?dmChatId(currentUser.id,selectedDmUserId):null);
  if(!chatId)return showToast('Pilih chat dulu.');
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return showToast('Browser ini belum mendukung rekaman suara.');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x))||'';
    activeVoiceChunks=[]; activeVoiceMode=mode; activeVoiceRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    activeVoiceRecorder.ondataavailable=e=>{if(e.data?.size)activeVoiceChunks.push(e.data);};
    activeVoiceRecorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(activeVoiceChunks,{type:activeVoiceRecorder.mimeType||'audio/webm'}); const currentMode=activeVoiceMode;
      activeVoiceRecorder=null; activeVoiceChunks=[]; activeVoiceMode=null; updateVoiceButtons(false,currentMode);
      if(blob.size>10*1024*1024)return showToast('VN terlalu besar.');
      try{
        showToast('Mengunggah VN ke Drive…'); const ext=blob.type.includes('mp4')?'m4a':'webm';
        const fileData=await fileToBase64(new File([blob],`voice_${Date.now()}.${ext}`,{type:blob.type}));
        const res=await fetch(UPLOAD_SCRIPT_URL,{
          method:'POST',
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          body:JSON.stringify({
            secret:UPLOAD_SECRET,
            fileName:`chat_${chatId}_${Date.now()}_voice.${ext}`,
            mimeType:blob.type||'audio/webm',
            fileData,
            folderId:CHAT_MEDIA_FOLDER_ID
          })
        });
        const result=await res.json();
        if(!result.success)throw new Error(result.error||'upload gagal');
        const url=`https://drive.google.com/uc?export=download&id=${result.fileId}`;
        await db.collection('chats').doc(chatId).collection('messages').add({senderId:currentUser.id,senderName:currentUser.name,text:'',attachment:{type:'audio',url,name:'Voice Note',size:blob.size,mime:blob.type,fileId:result.fileId,driveViewLink:result.viewLink||''},createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        await db.collection('chats').doc(chatId).set({updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); showToast('VN terkirim ✓');
      }catch(err){console.error(err);showToast('Gagal mengirim VN: '+(err?.message||err));}
    };
    activeVoiceRecorder.start(); updateVoiceButtons(true,mode); showToast('Merekam VN… tekan tombol merah lagi untuk selesai.');
  }catch(err){showToast('Izin mikrofon ditolak atau tidak tersedia.');}
}
function updateVoiceButtons(recording,mode){
  const id=mode==='group'?'group':'dm'; const btn=document.querySelector(`#${id}-message-input`)?.closest('.chat-composer')?.querySelector('.chat-attach-btn.voice');
  if(btn){btn.classList.toggle('recording',recording);btn.textContent=recording?'■':'●';btn.title=recording?'Hentikan rekaman':'Rekam VN';}
}
function renderDms(){const list=document.getElementById('dm-list');if(!list)return;const users=TEAM.filter(u=>u.id!==currentUser?.id);if(!selectedDmUserId&&users[0])selectedDmUserId=users[0].id;list.innerHTML=users.map(u=>`<button class="chat-list-item ${u.id===selectedDmUserId?'active':''}" onclick="selectDm('${u.id}')">${avatarHtml(u,'avatar-sm')}<span><strong>${escapeHtml(u.name)}</strong><small>Pesan pribadi</small></span></button>`).join('');if(selectedDmUserId)loadDmMessages(selectedDmUserId);}
function dmChatId(a,b){return ['dm',... [a,b].sort()].join('__');}
function selectDm(id){selectedDmUserId=id;renderDms();}
async function loadDmMessages(otherId){const box=document.getElementById('dm-messages');const title=document.getElementById('dm-chat-title');const u=findUser(otherId);if(title)title.textContent=u?.name||'Japri';if(unsubChatMessages){unsubChatMessages();unsubChatMessages=null;}const id=dmChatId(currentUser.id,otherId);const otherEmail=u?.authEmail||'';await db.collection('chats').doc(id).set({type:'dm',memberIds:[currentUser.id,otherId],memberEmails:[currentUser.authEmail,otherEmail].filter(Boolean)},{merge:true});unsubChatMessages=db.collection('chats').doc(id).collection('messages').orderBy('createdAt','asc').onSnapshot(s=>{box.innerHTML=s.empty?'<div class="chat-empty">Belum ada pesan. Kirim yang pertama.</div>':s.docs.map(d=>messageHtml({id:d.id,...d.data()})).join('');box.scrollTop=box.scrollHeight;});}
async function sendDirectMessage(e){e.preventDefault();const i=document.getElementById('dm-message-input');const text=(i?.value||'').trim();if(!text||!selectedDmUserId)return;i.value='';const id=dmChatId(currentUser.id,selectedDmUserId);await db.collection('chats').doc(id).set({type:'dm',memberIds:[currentUser.id,selectedDmUserId],memberEmails:[currentUser.authEmail,findUser(selectedDmUserId)?.authEmail||''],updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});await sendChatText(id,text);}
function stopChatMessages(){if(unsubChatMessages){unsubChatMessages();unsubChatMessages=null;}}
function openCreateGroup(){
  openGroupEditor(null);
}
async function openGroupEditor(groupId){
  let group=null;
  if(groupId){ const d=await db.collection('chats').doc(groupId).get(); if(!d.exists)return; group={id:d.id,...d.data()}; if(!groupIsAdmin(group)){showToast('Hanya admin yang bisa mengedit grup.');return;} }
  const modal=document.getElementById('group-editor-modal'); if(!modal)return;
  document.getElementById('group-editor-title').textContent=group?'Edit Grup':'Buat Grup';
  document.getElementById('group-editor-name').value=group?.name||'';
  const memberIds=new Set(group?.memberIds||[currentUser.id]);
  memberIds.add(currentUser.id);
  const admins=new Set(group?.adminEmails||[currentUser.authEmail]);
  const wrap=document.getElementById('group-member-picker');
  wrap.innerHTML=TEAM.map(u=>{const checked=memberIds.has(u.id);const isAdmin=admins.has(u.id+'@batukunci.app');return `<label class="group-member-row"><span class="group-member-main">${avatarHtml(u,'avatar-sm')}<span><strong>${escapeHtml(u.name)}</strong><small>${u.id===currentUser.id?'Anda':''}</small></span></span><span class="group-member-actions"><label class="mini-check"><input type="checkbox" class="group-member-check" value="${u.id}" ${checked?'checked':''} onchange="syncAdminCheckboxes()"><span>Anggota</span></label><label class="mini-check"><input type="checkbox" class="group-admin-check" value="${u.id}" ${isAdmin?'checked':''} ${checked?'':'disabled'}><span>Admin</span></label></span></label>`;}).join('');
  modal.dataset.groupId=groupId||'';
  const delBtn=document.getElementById('group-delete-btn'); if(delBtn) delBtn.classList.toggle('hidden', !group);
  const countEl=document.getElementById('group-picker-count'); if(countEl) countEl.textContent=`${memberIds.size} anggota`;
  modal.classList.remove('hidden'); document.body.classList.add('modal-open'); syncAdminCheckboxes();
}
function syncAdminCheckboxes(){let count=0;document.querySelectorAll('.group-member-row').forEach(row=>{const member=row.querySelector('.group-member-check');const admin=row.querySelector('.group-admin-check');if(member?.checked)count++;if(admin){admin.disabled=!member.checked;if(!member.checked)admin.checked=false;}});const countEl=document.getElementById('group-picker-count');if(countEl)countEl.textContent=`${count} anggota`;}
function closeGroupEditor(){const m=document.getElementById('group-editor-modal');if(m)m.classList.add('hidden');document.body.classList.remove('modal-open');}
async function saveGroupEditor(){
  const modal=document.getElementById('group-editor-modal'); const groupId=modal.dataset.groupId||''; const name=(document.getElementById('group-editor-name').value||'').trim();
  if(!name){showToast('Nama grup belum diisi.');return;}
  const memberIds=[...document.querySelectorAll('.group-member-check:checked')].map(x=>x.value);
  if(!memberIds.includes(currentUser.id)){memberIds.push(currentUser.id);}
  const adminEmails=[...document.querySelectorAll('.group-admin-check:checked')].map(x=>x.value+'@batukunci.app');
  if(!adminEmails.includes(currentUser.authEmail))adminEmails.push(currentUser.authEmail);
  try{
    if(groupId){
      const ref=db.collection('chats').doc(groupId); const snap=await ref.get(); if(!snap.exists||!groupIsAdmin({id:snap.id,...snap.data()})){showToast('Akses ditolak: hanya admin.');return;}
      await ref.update({name,memberIds,memberEmails:groupMemberEmails(memberIds),adminEmails,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); selectedGroupId=groupId; showToast('Info grup diperbarui ✓');
    }else{
      const ref=await db.collection('chats').add({type:'group',name,memberIds,memberEmails:groupMemberEmails(memberIds),adminEmails,createdBy:currentUser.id,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); selectedGroupId=ref.id; showToast('Grup dibuat ✓');
    }
    closeGroupEditor(); await renderGroups();
  }catch(e){showToast('Gagal menyimpan grup: '+e.message);}
}
async function deleteSelectedGroup(){
  if(!selectedGroupId)return; const snap=await db.collection('chats').doc(selectedGroupId).get(); if(!snap.exists)return; const group={id:snap.id,...snap.data()};
  if(!groupIsAdmin(group)){showToast('Hanya admin yang bisa menghapus grup.');return;}
  if(!confirm(`Hapus grup “${group.name}”? Riwayat pesan grup juga tidak akan bisa diakses lagi.`))return;
  try{await db.collection('chats').doc(selectedGroupId).delete();selectedGroupId=null;stopChatMessages();document.getElementById('group-chat-title').textContent='Pilih grup';document.getElementById('group-messages').innerHTML='<div class="chat-empty">Pilih grup untuk mulai chat.</div>';document.getElementById('group-edit-btn')?.classList.add('hidden');showToast('Grup dihapus.');await renderGroups();}catch(e){showToast('Gagal menghapus grup: '+e.message);}
}
async function leaveSelectedGroup(){
  if(!selectedGroupId || !currentUser)return;
  const snap=await db.collection('chats').doc(selectedGroupId).get();
  if(!snap.exists)return;
  const group={id:snap.id,...snap.data()};
  if(!groupMemberIds(group).includes(currentUser.id)){showToast('Anda sudah bukan anggota grup ini.');return;}
  const admins=Array.isArray(group.adminEmails)?group.adminEmails:[];
  const isAdmin=groupIsAdmin(group);
  const otherAdmins=admins.filter(email=>email!==currentUser.authEmail);
  if(isAdmin && otherAdmins.length===0){
    showToast('Anda admin terakhir. Tetapkan admin lain sebelum keluar.');
    return;
  }
  if(!confirm(`Keluar dari grup “${group.name}”? Anda tidak akan menerima pesan grup ini lagi.`))return;
  try{
    const memberIds=groupMemberIds(group).filter(id=>id!==currentUser.id);
    const memberEmails=(group.memberEmails||[]).filter(email=>email!==currentUser.authEmail);
    const adminEmails=isAdmin ? otherAdmins : admins;
    await db.collection('chats').doc(selectedGroupId).update({memberIds,memberEmails,adminEmails,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    selectedGroupId=null;
    stopChatMessages();
    document.getElementById('group-chat-title').textContent='Pilih grup';
    document.getElementById('group-messages').innerHTML='<div class=\'chat-empty\'>Pilih grup untuk mulai chat.</div>';
    document.getElementById('group-edit-btn')?.classList.add('hidden');
    document.getElementById('group-leave-btn')?.classList.add('hidden');
    showToast('Anda keluar dari grup.');
    await renderGroups();
  }catch(e){showToast('Gagal keluar dari grup: '+(e?.message||e));}
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
  if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
    closeMenu();
  }
});

initTheme();
teamLoadPromise = loadTeamForLogin();

document.getElementById('music-audio').addEventListener('timeupdate', function () {
  const fill = document.getElementById('music-bar-fill');
  if (fill && this.duration) fill.style.width = (this.currentTime / this.duration * 100) + '%';
});
