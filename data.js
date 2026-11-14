/* BATU-KUNCI-BUILD-16 */
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
let ALBUMS = [];

/* ---------- Helper ---------- */

// Deteksi tipe media untuk aset Project dan Gallery.
// Mendukung metadata type/mimeType serta URL video langsung.
function mediaKind(item) {
  if (!item || typeof item !== 'object') return 'image';
  const declared = String(item.type || item.mediaType || item.kind || item.mimeType || item.mime_type || '').toLowerCase();
  if (declared === 'video' || declared.startsWith('video/')) return 'video';
  if (declared === 'image' || declared.startsWith('image/')) return 'image';
  const link = String(item.link || item.url || item.src || '');
  return /\\.(mp4|m4v|webm|mov|ogv)(?:$|[?#])/i.test(link) ? 'video' : 'image';
}

// Hanya URL file video langsung yang layak diberikan ke elemen <video>.
// URL Google Drive tetap memakai preview iframe agar tidak menganggap halaman Drive sebagai stream.
function isDirectVideoUrl(value) {
  try {
    const u = new URL(String(value || ''), window.location.href);
    if (/drive\\.google\\.com$/i.test(u.hostname) || /googleusercontent\\.com$/i.test(u.hostname)) return false;
    return /\\.(mp4|m4v|webm|mov|ogv)$/i.test(u.pathname);
  } catch (_) {
    return false;
  }
}

// URL embed Drive untuk pemutar video. Mengembalikan null bila bukan link Drive yang dikenali.
function driveVideoPreviewUrl(link) {
  const embed = driveEmbedUrl(link);
  return embed || null;
}

// Ubah link Google Drive biasa jadi link embed preview (gaperlu API key)
function driveEmbedUrl(link) {
  if (!link) return null;
  const m = link.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || link.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}

// Versi gambar langsung (bukan iframe) — dipakai buat cover album di carousel,
// biar scroll-nya ringan & mulus (banyak iframe sekaligus bikin lag).
function driveImageUrl(link, size) {
  if (!link) return null;
  const m = link.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || link.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w${size || 400}-h${size || 400}` : null;
}

function normalizePhotoUrl(url, size = 200) {
  if (!url) return '';
  const raw = String(url).trim();
  const id = (raw.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^#]*?id=)([a-zA-Z0-9_-]+)/)
    || raw.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/))?.[1];
  if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`;
  return raw;
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
    const photoUrl = normalizePhotoUrl(user.photo);
    const fallbackJson = JSON.stringify(fallback).replace(/</g, '\\u003c');
    return `<img class="${cls}" src="${photoUrl}" alt="${safeName}" referrerpolicy="no-referrer" loading="lazy" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls}',textContent:${fallbackJson}}))">`;
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
