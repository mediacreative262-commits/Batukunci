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

/* GANTI dengan OAuth Client ID dari Google Cloud Console (buat fitur
   "Upload Langsung ke Drive"). Kalau belum diisi, tombolnya kasih
   tau minta pake cara manual dulu — gak bikin error, cuma nonaktif. */
const GOOGLE_CLIENT_ID = "263094318099-vuhh3e927sscov459ao800u5bf2ecofa.apps.googleusercontent.com";
let tokenClient = null;
let pendingUploadRowId = null;

function initGoogleAuth() {
  if (!window.google || !google.accounts) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: onDriveAuthGranted,
  });
}
window.addEventListener('load', initGoogleAuth);

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

/* ---------- Tema (dark mode) ---------- */

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
  if (!tokenClient) {
    showToast('Upload langsung belum aktif (GOOGLE_CLIENT_ID belum diisi) — pake cara manual dulu');
    return;
  }
  const row = document.getElementById(rowId);
  const akunEmail = row.querySelector('.aset-akun').value;
  if (!akunEmail) { showToast('Pilih akun Drive-nya dulu di dropdown'); return; }
  pendingUploadRowId = rowId;
  // "hint" cuma nyaranin akun yang bener di popup Google — kalau meleset,
  // orangnya masih bisa pilih akun lain sendiri secara manual di situ.
  tokenClient.requestAccessToken({ hint: akunEmail });
}

function onDriveAuthGranted(resp) {
  if (resp.error) {
    showToast('Login Drive gagal/dibatalkan (' + resp.error + ')');
    return;
  }
  const input = document.getElementById('drive-upload-input');
  input.dataset.token = resp.access_token;
  input.dataset.rowId = pendingUploadRowId;
  input.click();
}

async function handleDriveFilePicked(e) {
  const file = e.target.files[0];
  const token = e.target.dataset.token;
  const rowId = e.target.dataset.rowId;
  if (!file || !rowId) return;

  const isGallery = rowId === 'GALLERY';
  const isProfile = rowId === 'PROFILE';
  const row = (isGallery || isProfile) ? null : document.getElementById(rowId);
  const btn = isGallery ? document.getElementById('gallery-upload-btn')
    : isProfile ? document.getElementById('profile-photo-btn')
    : row?.querySelector('.aset-upload-btn');
  const btnLabel = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Uploading...'; }

  try {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: file.name })], { type: 'application/json' }));
    form.append('file', file);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: form,
    });
    const uploaded = await uploadRes.json();
    if (!uploaded.id) throw new Error(uploaded.error?.message || 'upload gagal');

    await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    if (isProfile) {
      const photoUrl = `https://lh3.googleusercontent.com/d/${uploaded.id}=w200-h200`;
      await db.collection('users').doc(currentUser.id).set({ photo: photoUrl }, { merge: true });
      currentUser.photo = photoUrl;
      renderProfileHeader();
      showToast('Foto profil diupdate ✓');
    } else if (isGallery) {
      document.getElementById('gallery-link').value = `https://drive.google.com/file/d/${uploaded.id}/view`;
      if (!document.getElementById('gallery-label').value) document.getElementById('gallery-label').value = file.name;
      previewGalleryLink();
      showToast('Upload beres — tap "Tambah ke Gallery" buat nyimpen ✓');
    } else {
      row.querySelector('.aset-link').value = `https://drive.google.com/file/d/${uploaded.id}/view`;
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
  if (!tokenClient) { showToast('Upload langsung belum aktif — pake cara manual dulu'); return; }
  const akunEmail = document.getElementById('gallery-akun').value;
  if (!akunEmail) { showToast('Pilih akun Drive-nya dulu'); return; }
  pendingUploadRowId = 'GALLERY';
  tokenClient.requestAccessToken({ hint: akunEmail });
}

function startProfilePhotoUpload() {
  if (!tokenClient) { showToast('Upload foto belum aktif — coba lagi nanti'); return; }
  pendingUploadRowId = 'PROFILE';
  tokenClient.requestAccessToken({}); // gak dikasih hint, bebas pake akun Google mana aja
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
