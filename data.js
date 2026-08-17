/* ============================================================
   BATU KUNCI — data.js
   Sekarang murni data + fungsi bantu. Isi TEAM/PROJECTS/dst
   diisi otomatis dari Firestore lewat app.js / view.js — bukan
   hardcode lagi kayak versi contoh sebelumnya.
   ============================================================ */

let TEAM = [];
let PROJECTS = [];
let DRIVE_ACCOUNTS = [];
let GALLERY = [];

/* ---------- Helper ---------- */

// Ubah link Google Drive biasa jadi link embed preview (gaperlu API key)
function driveEmbedUrl(link) {
  if (!link) return null;
  const m = link.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || link.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}

function findUser(id) {
  return TEAM.find(u => u.id === id);
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// Avatar sebagai foto (kalau user.photo ada) dengan fallback otomatis ke inisial
// kalau fotonya gagal dimuat — dipakai bareng app.js & view.js.
function avatarHtml(user, sizeClass) {
  const cls = 'avatar' + (sizeClass ? ' ' + sizeClass : '');
  const name = (user && user.name) || '?';
  const safeName = name.replace(/"/g, '&quot;');
  if (user && user.photo) {
    const fallback = initials(name);
    return `<img class="${cls}" src="${user.photo}" alt="${safeName}" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls}',textContent:'${fallback}'}))">`;
  }
  return `<div class="${cls}">${initials(name)}</div>`;
}

function formatTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function daysUntil(iso) {
  const diff = new Date(iso + 'T00:00:00') - new Date(new Date().toDateString());
  return Math.round(diff / 86400000);
}
