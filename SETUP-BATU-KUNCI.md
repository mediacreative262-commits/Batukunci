# Batu Kunci — Setup setelah update

## 1. Komentar project
Tidak perlu setup tambahan.

- Komentar tetap disimpan di `projects/{projectId}/comments`.
- Detail project sekarang menampilkan komentar terbaru.
- Tombol `Buka Chat` tetap membuka ruang komentar yang sama.
- Komentar baru membuat notifikasi internal untuk pembuat project dan anggota yang di-assign.

## 2. Filter project
Home sekarang default `Tanggal terlama` berdasarkan deadline.
Pilihan:
- Tanggal terlama
- Tanggal terbaru

## 3. Tag project
Di Upload Project ada field Tag.
- Kosong = opsional.
- Centang `Wajib` = tag harus diisi sebelum project bisa disimpan.

## 4. Push notification ke HP
Ada dua lapisan:
1. Web Notification saat Batu Kunci sedang terbuka.
2. Firebase Cloud Messaging (FCM) untuk push saat browser/PWA berada di background atau tidak sedang dibuka.

### A. VAPID
Di Firebase Console:
- Project Settings
- Cloud Messaging
- Web configuration / Web Push certificates
- Generate/import key pair

Salin **public VAPID key** ke:
`app.js` → `FCM_VAPID_KEY`

Jangan pernah memasukkan private VAPID key ke frontend.

### B. Deploy Cloud Functions
Dari folder project:

```bash
cd functions
npm install
cd ..
firebase login
firebase use mediacreativeut262b
firebase deploy --only functions:notifyProjectComment,functions:notifyChatMessage,functions:deadlineReminders
```

Function yang disediakan:
- `notifyProjectComment` → push komentar project.
- `notifyChatMessage` → push grup/japri.
- `deadlineReminders` → cek setiap jam dan mengirim H-3, H-2, H-1, dan hari-H.

Scheduled Functions menggunakan Cloud Scheduler, jadi cek billing/Blaze project Firebase sebelum deploy.

### C. Izin browser
Masuk Batu Kunci → Settings → Notifikasi → aktifkan izin.
Di Android, notifikasi juga bergantung pada izin notifikasi Chrome/PWA di level sistem.

## 5. Batu Kunci AI
`ai.js` sekarang memakai Firebase AI Logic dengan model `gemini-3.8-flash` dan app Firebase modular bernama `bk-ai` agar tidak bentrok dengan Firebase compat yang dipakai app utama.

Di Firebase Console pastikan:
- AI Logic sudah diaktifkan untuk project.
- Firebase AI Logic API aktif.
- App Check untuk AI Logic aktif.
- Domain tempat `app.html` dijalankan terdaftar pada App Check / reCAPTCHA Enterprise.
- Site key reCAPTCHA Enterprise di `ai.js` adalah site key untuk domain tersebut.

Untuk development lokal, gunakan App Check Debug Provider dan safelist debug token di Firebase Console. Jangan menambahkan `localhost` ke allowed reCAPTCHA production domains hanya untuk mengakali App Check.

## 6. View publik
`view.html` dan `view.js` **tidak diubah untuk fitur workspace**. Keduanya tetap read-only untuk menampilkan hasil/gallery publik.

## 7. PWA
Sudah ditambahkan:
- `manifest.webmanifest`
- icon 192px
- icon 512px
- metadata installable

FCM service worker tetap di root sebagai `firebase-messaging-sw.js`.


## 8. Update November 2026 — galeri, anggota, dan UI

### Galeri: hapus file asli
- Tombol hapus hanya tampil untuk admin workspace (owner) atau akun dengan role `admin` pada `accountAccess`.
- Untuk item yang punya `fileId` dan `folderId` dari Drive terhubung, penghapusan dilakukan melalui Apps Script Bridge, lalu catatan Firestore dihapus.
- File manual/akun pribadi yang tidak berada di folder Drive terhubung hanya dapat dihapus dari katalog Gallery; file aslinya harus dihapus manual dari Drive. UI akan meminta konfirmasi khusus dan menjelaskan perbedaannya.
- Salin isi `apps-script-code.gs` ke Apps Script Bridge yang digunakan Batu Kunci, aktifkan **Advanced Google Service → Drive API v3**, lalu deploy sebagai **New version**. Web app tetap dijalankan sebagai akun Drive pemilik script dan dapat diakses oleh pengguna web app. Penghapusan permanen memerlukan izin Drive API pemilik script terhadap folder/file terkait.
- Daftar admin yang boleh menghapus file Drive ada di `AUTHORIZED_DELETE_EMAILS` dalam file `.gs`. Tambahkan email admin lain secara eksplisit bila diperlukan. Admin tambahan juga perlu diberi `role: 'admin'` pada dokumen `accountAccess/{email}` agar tombol admin dan Firestore Rules aktif.

### Keanggotaan
- Profil anggota memakai `users/{memberId}` dengan `active: true/false` dan `status: aktif/nonaktif`.
- Hak akses login dikelola melalui `accountAccess/{email}`. Saat anggota pertama kali login, aplikasi membuat registry aktif. Saat anggota dinonaktifkan, registry diubah menjadi `active: false`; login berikutnya ditolak dan Firestore Rules menolak akses data/chat.
- Admin dapat mengaktifkan kembali anggota atau menambahkan profil baru dari Settings → Manajemen Anggota.
- Penambahan profil tidak otomatis membuat akun Firebase Authentication. Admin tetap harus membuat akun login dengan email `ID@batukunci.app` di Firebase Console. Build ini menonaktifkan akses di Batu Kunci; ia tidak menghapus user dari Firebase Authentication secara permanen.
- Saat anggota dinonaktifkan, ia dikeluarkan dari grup chat. Riwayat pesan grup tidak dihapus. Dokumen DM tetap disimpan untuk menjaga riwayat, tetapi akun nonaktif tidak bisa login atau membaca chat karena registry dan Firestore Rules.

### Jadwal pengurus di Home
- Media dan Humas mengikuti rotasi 4 minggu. Senin 9 November 2026 dipatok sebagai awal MG 4, sehingga 16 November kembali ke MG 1.
- Siklus Manajerial 3 minggu ditampilkan, tetapi minggu aktif belum ditentukan karena tanggal awal siklusnya belum dikonfirmasi.

### Deploy yang diperlukan
Dari root project:

```bash
firebase deploy --only firestore:rules,storage,functions
```

Perintah di atas juga memperbarui filter notifikasi agar akun nonaktif tidak lagi menerima push. Setelah Apps Script diperbarui, deploy versi baru Apps Script Web App. Jangan mengubah `UPLOAD_SCRIPT_URL` selama URL deployment yang sama dipakai; kalau membuat deployment baru, perbarui URL di `app.js`.

### Catatan
Aplikasi AI, workspace View publik, dan sistem upload project yang sudah ada tidak sengaja dirombak dalam update ini.
