/* BATU-KUNCI-BUILD-15 */
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

db.collection('albums').get().then(snap => {
  ALBUMS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderViewGallery();
}).catch(e => console.error('load albums', e));

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
    const assignedUsers = (p.assignedTo || []).map(id => findUser(id)).filter(Boolean);
    const names = assignedUsers.map(u => u.name);
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
        <div class="avatars">${assignedUsers.slice(0, 3).map(u => avatarHtml(u)).join('')}</div>
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

let activeAlbumId = null;

function renderViewGallery() {
  if (activeAlbumId !== null) { renderAlbumDetail(); return; }

  const wrap = document.getElementById('album-carousel');
  const emptyEl = document.getElementById('view-gallery-empty');
  if (!wrap) return;

  try {
    const groups = [...ALBUMS.map(a => ({ id: a.id, nama: a.nama })), { id: '', nama: 'Lainnya' }]
      .map(g => ({ ...g, items: GALLERY.filter(it => (it.albumId || '') === g.id) }))
      .filter(g => g.items.length > 0);

    document.getElementById('album-carousel-view').classList.toggle('hidden', groups.length === 0);
    emptyEl.classList.toggle('hidden', groups.length !== 0);
    if (groups.length === 0) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = groups.map(g => {
      const cover = driveImageUrl(g.items[0].link, 400);
      return `<div class="album-card" onclick="openAlbum('${g.id}')">
        <div class="album-cover">${cover ? `<img src="${cover}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '🖼'}</div>
        <div class="album-name">${esc(g.nama)}</div>
        <div class="album-count">${g.items.length} item</div>
      </div>`;
    }).join('');

    initAlbumCarousel();
  } catch (err) {
    console.error('renderViewGallery error:', err);
    emptyEl.classList.add('hidden');
    document.getElementById('album-carousel-view').classList.remove('hidden');
    wrap.innerHTML = `<div class="empty-state"><p style="color:var(--terracotta)">Debug: ${esc(err.message)}</p></div>`;
  }
}

function initAlbumCarousel() {
  const wrap = document.getElementById('album-carousel');
  if (!wrap) return;
  let ticking = false;
  const update = () => {
    const rect = wrap.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    [...wrap.children].forEach(card => {
      const cRect = card.getBoundingClientRect();
      const dist = Math.abs(center - (cRect.left + cRect.width / 2));
      const t = Math.max(0, 1 - dist / (rect.width / 2));
      card.style.transform = `scale(${(0.72 + t * 0.33).toFixed(3)})`;
      card.style.opacity = (0.45 + t * 0.55).toFixed(2);
      card.style.zIndex = Math.round(t * 100);
    });
    ticking = false;
  };
  wrap.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  requestAnimationFrame(() => {
    const first = wrap.children[0];
    if (first) wrap.scrollLeft = first.offsetLeft - (wrap.clientWidth - first.clientWidth) / 2;
    update();
  });
}

function openAlbum(id) {
  activeAlbumId = id;
  document.getElementById('album-carousel-view').classList.add('hidden');
  document.getElementById('view-gallery-empty').classList.add('hidden');
  document.getElementById('album-detail-view').classList.remove('hidden');
  renderAlbumDetail();
}

function closeAlbum() {
  activeAlbumId = null;
  document.getElementById('album-detail-view').classList.add('hidden');
  renderViewGallery();
}

function renderAlbumDetail() {
  const album = ALBUMS.find(a => a.id === activeAlbumId) || { nama: 'Lainnya' };
  const items = GALLERY.filter(it => (it.albumId || '') === activeAlbumId);
  document.getElementById('album-detail-title').textContent = album.nama;
  document.getElementById('album-detail-grid').innerHTML = items.map(g => {
    const url = driveEmbedUrl(g.link);
    return `<div class="gallery-item">
      ${url ? `<iframe src="${url}" loading="lazy"></iframe>` : ''}
      <div class="gallery-item-label"><span>${esc(g.label)}</span></div>
    </div>`;
  }).join('');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
