# Batu Kunci — Baca Dulu

Web organizer project buat Tim Media Kreatif, Angkatan 26.2 Administrasi Bisnis UT Bandung.

## Status
Kodenya udah nyambung ke Firebase beneran (bukan data contoh lagi) — login asli, data ke-simpen permanen, dan live update antar HP kalau anggota lain nambah/ubah project. Tinggal setup project Firebase-nya (gratis, ±10 menit, gaperlu kartu kredit).

## Setup Firebase (sekali di awal)

1. Buka console.firebase.google.com → **Add project** → kasih nama (mis. "batu-kunci") → lanjut sampai selesai (Google Analytics boleh dimatiin, gaperlu)
2. **Authentication** → Get started → Sign-in method → aktifin **Email/Password**
3. Authentication → tab **Users** → Add user, bikin 6 akun ini (email harus persis sama, password bebas asal semua orang inget punya masing-masing):
   - ketua@batukunci.app
   - wakil@batukunci.app
   - anggota1@batukunci.app
   - anggota2@batukunci.app
   - anggota3@batukunci.app
   - anggota4@batukunci.app
4. **Firestore Database** → Create database → mode **production** → pilih lokasi terdekat (asia-southeast2/Jakarta kalau ada)
5. Firestore → tab **Rules** → hapus isi default, ganti pakai isi file `firestore.rules` (satu paket sama file ini) → Publish
6. Project Settings (ikon gerigi, pojok kiri atas) → scroll ke "Your apps" → klik ikon `</>` (Web) → kasih nama app apa aja → Register → nanti muncul object `firebaseConfig`, copot semuanya
7. Tempel config itu (ganti 6 baris yang tulisannya `GANTI_...`) ke **3 file**: `app.js`, `view.js`, `seed.html` — pastiin sama persis di ketiganya
8. Buka `seed.html` di browser, login pakai salah satu dari 6 akun di langkah 3 → klik "Jalankan Seed" (cukup sekali)
9. Buka `app.html`, login beneran pakai salah satu dari 6 akun itu — udah jalan

## Isi file
- `firebase-config` (di dalam `app.js`, `view.js`, `seed.html`) — kredensial project Firebase, wajib diisi di langkah 7
- `data.js` — data live dari Firestore + fungsi bantu (link Drive → preview, format tanggal, dst)
- `style.css` — semua warna, font, tampilan komponen
- `app.js` + `app.html` — buat 6 anggota tim: login, Home, Upload Project, Gallery, Settings
- `view.js` + `view.html` — Mode View publik, gaperlu login. Sengaja file terpisah total dari `app.js` biar Mode View gapernah kebawa kode admin
- `seed.html` — dipakai SEKALI di awal buat isi 6 profil anggota + 4 akun Drive ke Firestore
- `index.html` — halaman kosong yang auto-redirect ke `app.html`, biar link utamanya polos gak pake `/app.html`
- `firestore.rules` — aturan keamanan: siapa aja boleh baca (buat Mode View), cuma yang login boleh nulis

## Ganti nama placeholder
6 nama masih "Anggota 1" dst. Login pertama kali pilih slot itu, terus di Settings → Profil ganti jadi nama asli — kesimpen permanen buat login berikutnya.

## Cara pasang ke GitHub Pages
1. Bikin repo baru di GitHub, upload SEMUA file ini rata di root folder (jangan di dalam subfolder)
2. Settings → Pages → Branch: main → Save
3. Link tim: `https://<username>.github.io/<nama-repo>/` (otomatis ke app.html)
   Link publik (buat Koordinator/Himpunan): `https://<username>.github.io/<nama-repo>/view.html`
