/* ============================================================
   BATU KUNCI — view.js
   Read-only, publik, gaperlu login. Dipakai CUMA sama view.html.
   Firebase config di sini HARUS SAMA PERSIS kayak yang di app.js.
   Ditambah dark mode + skeleton loading biar konsisten sama app.js.
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
const db = firebase.firestore();

let viewExpandedId = null;
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
initTheme();

/* ---------- Data live ---------- */

db.collection('users').get().then(snap => {
  TEAM = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderViewHome();
}).catch(e => console.error('load users', e));

db.collection('projects').onSnapshot(snap => {
  PROJECTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  projectsFirstLoadDone = true;
  renderViewHome();
}, e => console.error('projects listener', e));

db.collection('gallery').onSnapshot(snap => {
  GALLERY = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderViewGallery();
}, e => console.error('gallery listener', e));

function renderViewHome() {
  const list = document.getElementById('view-project-list');
  if (!list) return;

  if (!projectsFirstLoadDone) {
    list.innerHTML = Array.from({ length: 3 }).map(() =>
      `<div class="project-card skeleton"><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div></div>`
    ).join('');
    return;
  }

  const active = PROJECTS.filter(p => p.status !== 'selesai');
  const labels = { belum: 'Belum Mulai', proses: 'Proses', selesai: 'Selesai' };

  if (active.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Belum ada project aktif.</p></div>`;
    return;
  }

  list.innerHTML = active.map(p => {
    const names = (p.assignedTo || []).map(id => findUser(id)?.name).filter(Boolean);
    const isExpanded = viewExpandedId === p.id;

    let detail = '';
    if (isExpanded) {
      const asetList = p.aset || [];
      const asetHtml = asetList.length === 0
        ? `<div class="aset-empty">Belum ada aset.</div>`
        : asetList.map(a => {
            const url = driveEmbedUrl(a.link);
            return `<div class="aset-preview">
              <div class="aset-preview-label">${esc(a.label || 'Aset')}</div>
              ${url ? `<iframe src="${url}" loading="lazy"></iframe>` : ''}
            </div>`;
          }).join('');
      detail = `<div class="project-detail" onclick="event.stopPropagation()">
        <div class="project-brief">${esc(p.brief || '')}</div>
        ${asetHtml}
      </div>`;
    }

    return `<div class="project-card" onclick="toggleViewExpand('${p.id}')">
      <div class="project-card-top">
        <div>
          <p class="project-name">${esc(p.nama)}</p>
          <div class="project-meta">
            <span class="pill pill-${p.status}">${labels[p.status] || p.status}</span>
            <span class="deadline-tag">${formatTanggal(p.deadline)}</span>
          </div>
        </div>
        <div class="avatars">${names.slice(0, 3).map(n => `<div class="avatar">${initials(n)}</div>`).join('')}</div>
      </div>
      <div class="assignee-names">${names.join(', ')}</div>
      ${detail}
    </div>`;
  }).join('');
}

function toggleViewExpand(id) {
  viewExpandedId = viewExpandedId === id ? null : id;
  renderViewHome();
}

function renderViewGallery() {
  const grid = document.getElementById('view-gallery-grid');
  if (!grid) return;
  if (GALLERY.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Gallery masih kosong.</p></div>`;
    return;
  }
  grid.innerHTML = GALLERY.map(g => {
    const url = driveEmbedUrl(g.link);
    return `<div class="gallery-item">
      ${url ? `<iframe src="${url}" loading="lazy"></iframe>` : ''}
      <div class="gallery-item-label">${esc(g.label)}</div>
    </div>`;
  }).join('');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
