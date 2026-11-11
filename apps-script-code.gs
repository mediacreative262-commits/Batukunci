/**
 * BATU KUNCI — Upload Bridge (Apps Script)
 * ============================================================
 * Tugasnya cuma satu: terima file dari web Batu Kunci, taro ke
 * Google Drive akun ini, balikin link-nya. Gak perlu login apa-apa
 * dari sisi user — script ini yang login pake identitas akun Drive
 * tempat dia di-deploy.
 *
 * CARA PASANG: ikuti PANDUAN-SETUP-UPLOAD.md
 * ============================================================ */

// GANTI dengan kata sandi bebas — HARUS SAMA PERSIS dengan
// UPLOAD_SECRET di app.js. Ini cuma penyaring ringan biar gak
// sembarang orang bisa nembak endpoint ini dari luar.
var SHARED_SECRET = 'mdc262'; // HARUS SAMA PERSIS kayak UPLOAD_SECRET di app.js

// Nama folder default buat foto profil (dibikin otomatis kalau
// belum ada, di Drive akun yang deploy script ini).
var PROFILE_FOLDER_NAME = 'Batu Kunci - Foto Profil';

// API key Firebase Web app (memang public di client, dipakai hanya untuk verifikasi ID token).
var FIREBASE_API_KEY = 'AIzaSyBoAiVpGp_QBa_FQYOQefflFwqKv8Pbry0';
// Tambahkan email admin lain di sini jika kelak diberi hak menghapus file Drive.
var AUTHORIZED_DELETE_EMAILS = ['muhammadfadlimustafidin-mdc.26.2@batukunci.app'];

function doPost(e) {
  var result = { success: false };
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Gak ada data yang dikirim');
    var params = JSON.parse(e.postData.contents);
    if (params.secret !== SHARED_SECRET) throw new Error('Kata sandi salah.');

    if (params.action === 'deleteFile') {
      deleteGalleryFile_(params);
      result.success = true;
      result.message = 'File Drive dihapus permanen.';
    } else {
      if (!params.fileData || !params.fileName) throw new Error('Data file kosong');
      var bytes = Utilities.base64Decode(params.fileData);
      var blob = Utilities.newBlob(bytes, params.mimeType || 'application/octet-stream', params.fileName);
      var folder;
      if (params.folderId) {
        try { folder = DriveApp.getFolderById(params.folderId); }
        catch (folderErr) { throw new Error('Gagal buka folder ID: ' + folderErr.message); }
      } else {
        folder = getOrCreateProfileFolder_();
      }
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      result.success = true;
      result.fileId = file.getId();
      result.viewLink = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    }
  } catch (err) {
    result.error = err.message;
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// Penghapusan permanen hanya untuk admin yang lolos verifikasi Firebase Auth.
// Aktifkan Advanced Google Service: Drive API v3 pada Apps Script sebelum deploy.
function deleteGalleryFile_(params) {
  if (!params.fileId || !params.folderId || !params.idToken) {
    throw new Error('fileId, folderId, dan idToken wajib diisi.');
  }
  var email = verifyFirebaseAdminToken_(params.idToken);
  if (AUTHORIZED_DELETE_EMAILS.indexOf(email) === -1) throw new Error('Akun ini tidak memiliki izin menghapus file Drive.');

  var meta = Drive.Files.get(params.fileId, { fields: 'id,name,parents,trashed', supportsAllDrives: true });
  var parents = meta.parents || [];
  if (parents.indexOf(params.folderId) === -1) {
    throw new Error('File tidak berada di folder Drive yang terhubung. File tidak dihapus.');
  }
  if (meta.trashed) throw new Error('File sudah berada di Trash Drive.');
  Drive.Files.remove(params.fileId, { supportsAllDrives: true }); // permanent delete via Apps Script Advanced Drive Service
}

function verifyFirebaseAdminToken_(idToken) {
  var response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_API_KEY),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true }
  );
  var payload = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() !== 200 || !payload.users || !payload.users.length) {
    throw new Error('Sesi Firebase tidak valid. Login ulang lalu coba lagi.');
  }
  return String(payload.users[0].email || '').toLowerCase();
}
function getOrCreateProfileFolder_() {
  var it = DriveApp.getFoldersByName(PROFILE_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(PROFILE_FOLDER_NAME);
}

/**
 * Buat tes manual dari editor Apps Script (opsional) — jalanin fungsi
 * ini, cek log-nya, harus muncul "OK" tanpa error.
 */
function testKoneksiDrive() {
  var folder = getOrCreateProfileFolder_();
  Logger.log('OK — bisa akses/bikin folder: ' + folder.getUrl());
}

/**
 * Tes langsung nulis file ke folder servermdc tertentu — buat isolasi
 * masalah "Akses ditolak" di Gallery/Aset. Ganti FOLDER_LINK di bawah
 * ini dengan link folder upload akun yang gagal (dari Settings Batu
 * Kunci), lalu jalanin fungsi ini (pilih testUploadKeFolder di
 * dropdown sebelah tombol Jalankan), baru cek Log eksekusi.
 */
function testUploadKeFolder() {
  var FOLDER_LINK = 'https://drive.google.com/drive/folders/1BIMgk7GXdl1pge5MYupkR9M-hVGeVDH5';

  var m = FOLDER_LINK.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!m) {
    Logger.log('GAGAL: link gak valid / ID folder gak ketemu di link itu. Cek lagi link-nya.');
    return;
  }
  var folderId = m[1];
  Logger.log('Folder ID yang kepake: ' + folderId);

  var folder = DriveApp.getFolderById(folderId);
  Logger.log('Langkah 1 OK — berhasil buka folder: "' + folder.getName() + '"');

  var file = folder.createFile(Utilities.newBlob('tes dari Batu Kunci', 'text/plain', 'tes-batukunci.txt'));
  Logger.log('Langkah 2 OK — berhasil bikin file tes: ' + file.getUrl());

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Langkah 3 OK — berhasil set sharing. SEMUA LANGKAH BERHASIL ✓');
}
