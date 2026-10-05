/* BATU-KUNCI-VIEW-4 */
/* Public/read-only UI. Workspace logic stays in app.html/app.js. */

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
let activeAlbumId = null;
let projectFilter = 'all';
let projectSearch = '';

/* ---------- Theme ---------- */
function initTheme() {
  let saved = null, savedSkin = null;
  try {
    saved = localStorage.getItem('bk-theme');
    savedSkin = localStorage.getItem('bk-skin');
  } catch (e) {}
  const theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const skin = ['original','horror','cool','rich','genz','futuristic'].includes(savedSkin) ? savedSkin : 'original';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-skin', skin);
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('bk-theme', next); } catch (e) {}
}
initTheme();

/* ---------- Live data ---------- */
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
  const update = document.getElementById('view-last-update');
  if (update) update.textContent = 'Baru diperbarui';
  renderViewHome();
}, e => {
  console.error('projects listener', e);
  projectsFirstLoadDone = true;
  const list = document.getElementById('view-project-list');
  if (list) list.innerHTML = `<div class="empty-state"><p>Project belum bisa dimuat. Coba refresh halaman.</p></div>`;
});

db.collection('gallery').onSnapshot(snap => {
  GALLERY = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderViewGallery();
}, e => console.error('gallery listener', e));

/* ---------- Projects ---------- */
function renderViewHome() {
  const statProjects = document.getElementById('view-stat-projects');
  const statProcess = document.getElementById('view-stat-process');
  if (statProjects) statProjects.textContent = PROJECTS.filter(p => p.status !== 'selesai').length;
  if (statProcess) statProcess.textContent = PROJECTS.filter(p => p.status === 'proses').length;

  const list = document.getElementById('view-project-list');
  if (!list) return;

  if (!projectsFirstLoadDone) {
    list.innerHTML = Array.from({ length: 4 }).map(() => `
      <div class="view-project-card skeleton-card">
        <div class="skeleton-line w-35"></div><div class="skeleton-line w-80"></div><div class="skeleton-line w-55"></div>
      </div>`).join('');
    return;
  }

  const labels = { belum: 'Belum mulai', proses: 'Sedang proses', selesai: 'Selesai' };
  const statusProgress = { belum: 12, proses: 58, selesai: 100 };
  const active = PROJECTS.filter(p => p.status !== 'selesai');
  const filtered = active.filter(p => {
    const statusOk = projectFilter === 'all' || p.status === projectFilter;
    const haystack = `${p.nama || ''} ${p.brief || ''} ${p.tag || ''}`.toLowerCase();
    return statusOk && (!projectSearch || haystack.includes(projectSearch));
  });

  if (active.length === 0) {
    list.innerHTML = `<div class="view-empty-card"><div class="empty-icon">✓</div><strong>Belum ada project aktif</strong><p>Ruang ini akan otomatis menampilkan project baru saat tim mulai bekerja.</p></div>`;
    return;
  }
  if (filtered.length === 0) {
    list.innerHTML = `<div class="view-empty-card"><div class="empty-icon">⌕</div><strong>Project tidak ditemukan</strong><p>Coba ubah kata pencarian atau filter status.</p><button class="view-clear-filter" onclick="clearProjectFilter()">Reset filter</button></div>`;
    return;
  }

  list.innerHTML = filtered.map((p, index) => {
    const assignedUsers = (p.assignedTo || []).map(id => findUser(id)).filter(Boolean);
    const names = assignedUsers.map(u => u.name).filter(Boolean);
    const isExpanded = viewExpandedId === p.id;
    const progress = statusProgress[p.status] ?? 20;
    const dLeft = p.deadline ? daysUntil(p.deadline) : null;
    const urgent = p.deadline && p.status !== 'selesai' && dLeft <= 3;

    let detail = '';
    if (isExpanded) {
      const asetList = p.aset || [];
      const asetHtml = asetList.length === 0
        ? `<div class="aset-empty">Belum ada aset yang dipublikasikan.</div>`
        : asetList.map(a => {
            const url = driveEmbedUrl(a.link);
            return `<div class="aset-preview">
              <div class="aset-preview-label">${esc(a.label || 'Aset')}</div>
              ${url ? `<iframe src="${url}" loading="lazy" title="${esc(a.label || 'Preview aset')}"></iframe>` : '<div class="aset-missing">Preview tidak tersedia.</div>'}
            </div>`;
          }).join('');
      detail = `<div class="project-detail" onclick="event.stopPropagation()">
        <div class="project-detail-grid">
          <div>
            <span class="detail-label">Brief</span>
            <div class="project-brief">${esc(p.brief || 'Belum ada brief.')}</div>
          </div>
          <div>
            <span class="detail-label">Tim</span>
            <div class="detail-team">${names.length ? names.map(esc).join('<span>·</span>') : 'Belum ditentukan'}</div>
          </div>
        </div>
        ${asetList.length ? `<div class="detail-assets"><span class="detail-label">Aset</span>${asetHtml}</div>` : ''}
      </div>`;
    }

    return `<article class="view-project-card ${isExpanded ? 'is-open' : ''}" data-project-id="${esc(p.id)}" style="--delay:${Math.min(index * 45, 180)}ms">
      <button class="project-card-button" type="button" onclick="toggleViewExpand('${escJs(p.id)}')" aria-expanded="${isExpanded}">
        <div class="project-card-main">
          <div class="project-card-kicker"><span>${String(index + 1).padStart(2,'0')}</span>${p.tag ? `<b>#${esc(p.tag)}</b>` : '<b>MEDIA KREATIF</b>'}</div>
          <h3 class="project-name">${esc(p.nama || 'Untitled project')}</h3>
          <div class="project-card-meta">
            <span class="status-chip status-${esc(p.status)}"><i></i>${labels[p.status] || esc(p.status || 'Status')}</span>
            <span class="deadline-tag ${urgent ? 'urgent' : ''}">${p.deadline ? `${esc(formatTanggal(p.deadline))}${urgent ? ` · ${dLeft <= 0 ? 'deadline' : dLeft + ' hari'}` : ''}` : 'Tanpa deadline'}</span>
          </div>
        </div>
        <div class="project-card-side">
          <div class="view-avatars">${assignedUsers.slice(0,3).map(u => avatarHtml(u)).join('')}${assignedUsers.length > 3 ? `<span class="avatar avatar-more">+${assignedUsers.length - 3}</span>` : ''}</div>
          <span class="expand-icon" aria-hidden="true">${isExpanded ? '−' : '+'}</span>
        </div>
      </button>
      <div class="progress-line"><span style="width:${progress}%"></span></div>
      <div class="progress-caption"><span>${progress}% progress indikatif</span><span>${names.length ? names.length + ' anggota' : 'Belum ada anggota'}</span></div>
      ${detail}
    </article>`;
  }).join('');
}

function toggleViewExpand(id) {
  viewExpandedId = viewExpandedId === id ? null : id;
  renderViewHome();
  if (viewExpandedId) {
    requestAnimationFrame(() => document.querySelector(`[data-project-id="${cssEscape(viewExpandedId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }
}

function clearProjectFilter() {
  projectSearch = '';
  projectFilter = 'all';
  const input = document.getElementById('view-project-search');
  if (input) input.value = '';
  document.querySelectorAll('.view-filter button').forEach(b => b.classList.toggle('is-active', b.dataset.filter === 'all'));
  renderViewHome();
}

/* ---------- Gallery ---------- */
function renderViewGallery() {
  const statAlbums = document.getElementById('view-stat-albums');
  if (statAlbums) statAlbums.textContent = ALBUMS.length;
  if (activeAlbumId !== null) { renderAlbumDetail(); return; }

  const wrap = document.getElementById('album-carousel');
  const emptyEl = document.getElementById('view-gallery-empty');
  if (!wrap || !emptyEl) return;

  try {
    const groups = [...ALBUMS.map(a => ({ id: a.id, nama: a.nama })), { id: '', nama: 'Lainnya' }]
      .map(g => ({ ...g, items: GALLERY.filter(it => (it.albumId || '') === g.id) }))
      .filter(g => g.items.length > 0);

    document.getElementById('album-carousel-view').classList.toggle('hidden', groups.length === 0);
    emptyEl.classList.toggle('hidden', groups.length !== 0);
    if (groups.length === 0) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = groups.map((g, index) => {
      const cover = driveImageUrl(g.items[0].link, 700);
      const date = g.items.map(x => x.createdAt?.toDate ? x.createdAt.toDate() : null).filter(Boolean).sort((a,b) => b-a)[0];
      return `<button class="album-card" type="button" onclick="openAlbum('${escJs(g.id)}')" style="--delay:${Math.min(index * 55, 220)}ms">
        <span class="album-cover">${cover ? `<img src="${cover}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="album-placeholder">▧</span>'}<span class="album-open">Buka album <b>↗</b></span></span>
        <span class="album-card-copy"><strong>${esc(g.nama)}</strong><small>${g.items.length} item${date ? ` · ${date.toLocaleDateString('id-ID',{month:'short',year:'numeric'})}` : ''}</small></span>
      </button>`;
    }).join('');
  } catch (err) {
    console.error('renderViewGallery error:', err);
    emptyEl.classList.add('hidden');
    document.getElementById('album-carousel-view').classList.remove('hidden');
    wrap.innerHTML = `<div class="view-empty-card"><strong>Gallery belum bisa ditampilkan</strong><p>${esc(err.message)}</p></div>`;
  }
}

function openAlbum(id) {
  activeAlbumId = id;
  document.getElementById('album-carousel-view').classList.add('hidden');
  document.getElementById('view-gallery-empty').classList.add('hidden');
  document.getElementById('album-detail-view').classList.remove('hidden');
  renderAlbumDetail();
  document.getElementById('gallery-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAlbum() {
  activeAlbumId = null;
  document.getElementById('album-detail-view').classList.add('hidden');
  renderViewGallery();
}

function renderAlbumDetail() {
  const album = ALBUMS.find(a => a.id === activeAlbumId) || { nama: 'Lainnya' };
  const items = GALLERY.filter(it => (it.albumId || '') === activeAlbumId);
  const title = document.getElementById('album-detail-title');
  const grid = document.getElementById('album-detail-grid');
  if (title) title.textContent = album.nama;
  if (!grid) return;
  grid.innerHTML = items.length ? items.map((g, index) => {
    const image = driveImageUrl(g.link, 1000);
    const embed = driveEmbedUrl(g.link);
    return `<button class="gallery-item" type="button" onclick="openLightbox('${escJs(image || '')}','${escJs(g.label || album.nama)}')" style="--delay:${Math.min(index * 35, 200)}ms">
      ${image ? `<img src="${image}" alt="${esc(g.label || 'Foto')}" loading="lazy" referrerpolicy="no-referrer">` : (embed ? `<iframe src="${embed}" loading="lazy" title="${esc(g.label || 'Preview')}"></iframe>` : '<div class="gallery-placeholder">Preview tidak tersedia</div>')}
      <span class="gallery-item-label"><b>${esc(g.label || 'Tanpa judul')}</b><i>↗</i></span>
    </button>`;
  }).join('') : `<div class="view-empty-card"><strong>Album kosong</strong><p>Belum ada visual yang dipublikasikan ke album ini.</p></div>`;
}

/* ---------- Lightbox ---------- */
function openLightbox(src, label) {
  if (!src) return;
  const box = document.getElementById('view-lightbox');
  const img = document.getElementById('view-lightbox-img');
  const text = document.getElementById('view-lightbox-label');
  if (!box || !img) return;
  img.src = src;
  img.alt = label || 'Preview';
  if (text) text.textContent = label || '';
  box.classList.remove('hidden');
  box.setAttribute('aria-hidden','false');
  document.body.classList.add('lightbox-open');
}
function closeLightbox() {
  const box = document.getElementById('view-lightbox');
  const img = document.getElementById('view-lightbox-img');
  if (!box) return;
  box.classList.add('hidden');
  box.setAttribute('aria-hidden','true');
  if (img) img.removeAttribute('src');
  document.body.classList.remove('lightbox-open');
}

/* ---------- UI events ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('view-project-search');
  search?.addEventListener('input', e => {
    projectSearch = e.target.value.trim().toLowerCase();
    renderViewHome();
  });
  document.querySelectorAll('.view-filter button').forEach(btn => btn.addEventListener('click', () => {
    projectFilter = btn.dataset.filter || 'all';
    document.querySelectorAll('.view-filter button').forEach(b => b.classList.toggle('is-active', b === btn));
    renderViewHome();
  }));
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeLightbox();
    if (activeAlbumId !== null) closeAlbum();
  }
});

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function escJs(s) {
  return String(s == null ? '' : s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'\\r');
}
function cssEscape(s) {
  if (window.CSS?.escape) return CSS.escape(String(s));
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
