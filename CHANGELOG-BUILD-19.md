# Batu Kunci — Build 19

Update berdasarkan brainstorming 10 November 2026.

## Yang sudah diterapkan

- Home workspace kini menampilkan jadwal pengurus minggu berjalan.
  - Media dan Humas memakai rotasi 4 minggu.
  - Senin, 9 November 2026 ditetapkan sebagai MG 4; 16 November kembali ke MG 1.
  - Rotasi Manajerial 3 minggu ditampilkan, tetapi minggu aktif belum ditentukan karena anchor awal siklus belum dikonfirmasi.
- Galeri memiliki tombol hapus yang hanya tampil untuk admin workspace.
  - Ada konfirmasi sebelum penghapusan.
  - Untuk file di folder Drive terhubung, Apps Script akan menghapus file Drive secara permanen sebelum metadata Gallery dihapus.
  - Untuk file pribadi/link yang tidak bisa diverifikasi dari folder Drive, sistem hanya menawarkan penghapusan referensi Gallery dan menjelaskan bahwa file asli tetap ada.
- Manajemen anggota tersedia di Settings untuk admin.
  - Anggota bisa dinonaktifkan/diaktifkan.
  - Anggota nonaktif tidak bisa login/mengakses data/chat, dan dikeluarkan dari grup chat.
  - Riwayat pesan tidak dihapus.
  - Profil anggota baru dapat ditambahkan; akun Firebase Authentication tetap dibuat terpisah oleh admin.
- Tampilan dipoles dengan arah iOS-inspired: ruang lebih lega, kartu membulat, ikon outline, warna biru yang lebih tenang, dan gradien yang tidak terlalu ramai.
- Ikon PWA dan favicon diperbarui. Favicon 32/64 memakai monogram AB yang lebih sederhana.

## Yang tetap tidak disentuh

- AI (`ai.js`) tidak diubah.
- Logika Workspace View publik (`view.html`, `view.js`) tidak diubah.
- Struktur Project, Chat, dan alur upload lama tidak sengaja dirombak.

## Belum dibuat / menunggu konfirmasi

- Direktori Ujian Adbis 26.2: ditunda sampai ada kabar/konfirmasi pengurus.
- Content Planner Humas: dicatat di `BACKLOG-PENGEMBANGAN.md`.
- Sekretariat/notulensi + daftar hadir + ekspor PDF: dicatat di `BACKLOG-PENGEMBANGAN.md`.
- Anchor minggu aktif Manajerial: perlu konfirmasi.

## File yang berubah / ditambahkan

- `app.html`, `app.js`, `style.css`
- `firestore.rules`, `storage.rules`, `firebase.json`
- `functions/index.js`
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`, `favicon-64.png`
- `apps-script-code.gs` (baru, untuk Apps Script Bridge)
- `BACKLOG-PENGEMBANGAN.md`, `CHANGELOG-BUILD-19.md`, `SETUP-BATU-KUNCI.md`

## Setelah mengganti file di GitHub

1. Salin isi `apps-script-code.gs` ke project Apps Script Bridge yang dipakai Batu Kunci.
2. Aktifkan Advanced Google Service **Drive API v3** pada Apps Script.
3. Pastikan email admin yang diizinkan menghapus file tercantum di `AUTHORIZED_DELETE_EMAILS`.
4. Deploy Apps Script sebagai versi baru.
5. Dari folder project jalankan:

```bash
firebase deploy --only firestore:rules,storage,functions
```

6. Pastikan user admin pertama adalah akun workspace owner. Akun aktif akan membuat `accountAccess/{email}` saat login pertama kali.

Catatan: build ini menonaktifkan akses anggota melalui registry Batu Kunci, bukan menghapus kredensial Firebase Authentication secara permanen. Penghapusan permanen akun Authentication tetap memerlukan tindakan admin melalui Firebase Console/Admin SDK.


### View styling follow-up (10 November 2026)
- Updated `view.html` to load `style.css?v=26` and marked the public View as v5.
- Added a dedicated, fully `.view-body`-scoped iOS-inspired visual refinement in `style.css`: softer neutral canvas, restrained indigo accents, translucent sticky header, rounder cards, calmer shadows, and mobile refinements.
- Updated `app.html` stylesheet cache key to `v=26` because the shared stylesheet changed. Existing workspace styles are not overridden by the new View-only rules.
