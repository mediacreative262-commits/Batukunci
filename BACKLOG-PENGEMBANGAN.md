# Batu Kunci — Catatan Pengembangan & Backlog

Dokumen ini menyimpan hasil brainstorming 10 November 2026. Fitur berstatus **Ditunda** tidak dibuat di build ini dan menunggu kabar/konfirmasi pengurus.

## Sudah dimasukkan ke build ini
- Home menampilkan jadwal pengurus minggu berjalan.
- Rotasi Media dan Humas 4 minggu, mulai 9 November 2026 sebagai MG 4.
- Struktur rotasi Manajerial 3 minggu tampil, tetapi minggu aktif menunggu konfirmasi tanggal awal siklus.
- Galeri: tombol hapus admin-only, konfirmasi, penghapusan file Drive terhubung melalui Apps Script, dan penghapusan dokumen Gallery.
- Manajemen anggota: aktif/nonaktif, penambahan profil, daftar anggota aktif, dan pencabutan anggota dari grup/Japri tanpa menghapus riwayat pesan.
- Polesan UI iOS-inspired: permukaan bersih, white space, kartu membulat, ikon outline konsisten, transisi ringan, dan gradien biru yang lebih lembut.

## Disepakati sebagai rencana lanjutan (belum dibuat)
### Content Planner Humas
Mengikuti alur kerja Humas yang sekarang: periode/minggu, tanggal posting, hari, nama konten, platform, penanggung jawab/PIC, status pengerjaan, checklist publikasi, brief, dan aset. Idealnya dapat terhubung ke Project agar tidak perlu input dua kali.

### Sekretariat
- Form notulensi dan daftar hadir dengan kolom terstruktur agar sekretaris tinggal input.
- Simpan draft/final, arsip dan pencarian rapat.
- Export notulensi + daftar hadir ke PDF.
- Hanya role Sekretaris yang dapat membuat/mengedit/mengelola; pengguna lain read-only.
- Hasil keputusan/tindak lanjut rapat dapat diubah menjadi Project tanpa mengetik ulang.

## Ditunda — jangan dibuat dulu
### Direktori Ujian Adbis 26.2
Konsep publik untuk sekitar 291 mahasiswa: input jadwal dan lokasi ujian sendiri, direktori dapat dilihat dan difilter berdasarkan nama, mata kuliah, tanggal, lokasi, gedung, dan ruangan, serta membantu menemukan teman ujian yang berdekatan. Pengurus memoderasi data. **Belum dibuat karena menunggu pembahasan/konfirmasi pengurus.**

## Perlu konfirmasi sebelum finalisasi
- Tanggal awal/anchor rotasi Manajerial 3 minggu.
- Daftar role/admin tambahan selain owner yang boleh menghapus galeri dan mengelola anggota.
- Flow penambahan akun Firebase Authentication anggota baru (profil dapat dibuat dari app; kredensial tetap dibuat melalui Firebase Console pada build ini).
