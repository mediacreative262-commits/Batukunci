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

function emailFor(id) { return id + '@batukunci.app'; }
function idFromEmail(email) { return (email || '').split('@')[0]; }

let currentUser = null;
let activeTab = 'belum';
let expandedProjectId = null;
let uploadAssignees = [];
let uploadStatus = 'belum';
let uploadAsetRows = [];
let asetRowSeq = 0;
let unsubProjects = null, unsubDrive = null, unsubGallery = null;
let projectsFirstLoadDone = false;

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

auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = findUser(idFromEmail(user.email)) || { id: idFromEmail(user.email), name: idFromEmail(user.email) };
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    projectsFirstLoadDone = false;
    startLiveData();
    showView('home');
  } else {
    stopLiveData();
    currentUser = null;
    expandedProjectId = null;
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
}

function stopLiveData() {
  unsubProjects && unsubProjects();
  unsubDrive && unsubDrive();
  unsubGallery && unsubGallery();
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
  const names = (p.assignedTo || []).map(id => findUser(id)?.name).filter(Boolean);
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
      <div class="avatars">${names.slice(0, 3).map(n => `<div class="avatar">${initials(n)}</div>`).join('')}</div>
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
      if (btnEl) celebrate(btnEl);
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      setTab('arsip');
    } else {
      renderHome();
    }
    showToast(status === 'selesai' ? 'Project dipindah ke Arsip ✓' : 'Status diupdate');
  } catch (e) {
    showToast('Gagal update: ' + e.message);
  }
}

function statusLabel(s) {
  return { belum: 'Belum Mulai', proses: 'Proses', selesai: 'Selesai' }[s] || s;
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
    <input type="text" placeholder="Link Google Drive (Anyone with the link)" class="aset-link" oninput="previewAsetRow('${rowId}')">
    <select class="aset-akun">
      <option value="">Disimpen di akun mana?</option>
      ${DRIVE_ACCOUNTS.map(a => `<option value="${a.email}">${a.email} (${a.kelompok}${a.persen >= 85 ? ' · hampir penuh' : ''})</option>`).join('')}
    </select>
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
  const grid = document.getElementById('gallery-grid');
  if (GALLERY.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${archMarkSvg()}<p>Gallery masih kosong. Tambah lewat form di bawah.</p></div>`;
    return;
  }
  grid.innerHTML = GALLERY.map(g => {
    const url = driveEmbedUrl(g.link);
    return `<div class="gallery-item">
      ${url ? `<iframe src="${url}" loading="lazy"></iframe>` : `<div class="aset-empty">Link belum valid</div>`}
      <div class="gallery-item-label">${escapeHtml(g.label)}</div>
    </div>`;
  }).join('');
}

async function addGalleryItem() {
  const label = document.getElementById('gallery-label').value.trim();
  const link = document.getElementById('gallery-link').value.trim();
  if (!label || !link) { showToast('Isi label & link dulu'); return; }
  try {
    await db.collection('gallery').add({ label, link });
    document.getElementById('gallery-label').value = '';
    document.getElementById('gallery-link').value = '';
    showToast('Ditambahkan ke Gallery ✓');
  } catch (e) {
    showToast('Gagal simpan: ' + e.message);
  }
}

/* ---------- Settings ---------- */

function renderProfileHeader() {
  document.getElementById('profile-avatar').textContent = currentUser ? initials(currentUser.name) : '';
  document.getElementById('profile-name-display').textContent = currentUser ? currentUser.name : '';
}

function renderSettings() {
  renderProfileHeader();
  document.getElementById('profile-name-input').value = currentUser?.name || '';
  document.getElementById('profile-bio-input').value = currentUser?.bio || '';

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
    </div>
  `).join('');
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
  if (!currentUser || !name) return;
  try {
    await db.collection('users').doc(currentUser.id).set({ name, bio }, { merge: true });
    currentUser.name = name; currentUser.bio = bio;
    renderProfileHeader();
    showToast('Profil disimpan ✓');
  } catch (e) {
    showToast('Gagal simpan: ' + e.message);
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
loadTeamForLogin();
