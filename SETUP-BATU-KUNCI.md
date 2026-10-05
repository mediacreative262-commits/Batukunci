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
