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
var FIREBASE_PROJECT_ID = 'mediacreativeut262b';
var WORKSPACE_OWNER_EMAIL = 'muhammadfadlimustafidin-mdc.26.2@batukunci.app';
var WORKSPACE_DOMAIN = '@batukunci.app';
var CHAT_MEDIA_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

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
    } else if (params.action === 'createMember') {
      result = createFirebaseMember_(params);
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
    result = { success: false, error: err.message || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// Monitor penggunaan folder media. Dipanggil oleh halaman Settings Batu Kunci.
function doGet(e) {
  var result = { success: false };
  try {
    var params = (e && e.parameter) || {};
    if (params.secret !== SHARED_SECRET) throw new Error('Kata sandi salah.');
    if (params.action !== 'storageInfo') throw new Error('Aksi GET tidak dikenal.');
    if (!params.folderId) throw new Error('folderId wajib diisi.');
    var folder = DriveApp.getFolderById(params.folderId);
    var files = folder.getFiles();
    var used = 0;
    while (files.hasNext()) used += Number(files.next().getSize()) || 0;
    result = { success: true, usedBytes: used, limitBytes: CHAT_MEDIA_STORAGE_LIMIT_BYTES, folderName: folder.getName() };
  } catch (err) {
    result = { success: false, error: err.message || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// Penghapusan permanen tersedia untuk semua anggota aktif yang lolos verifikasi Firebase Auth.
// Aktifkan Advanced Google Service: Drive API v3 pada Apps Script sebelum deploy.
function deleteGalleryFile_(params) {
  if (!params.fileId || !params.folderId || !params.idToken) throw new Error('fileId, folderId, dan idToken wajib diisi.');
  var email = verifyFirebaseAccount_(params.idToken);
  if (!email.endsWith(WORKSPACE_DOMAIN)) throw new Error('Akun ini bukan anggota domain Batu Kunci.');
  var access = getAccountAccess_(email, params.idToken);
  if (!access || access.active !== true) throw new Error('Akun tidak aktif atau tidak terdaftar di Workspace.');

  var meta = Drive.Files.get(params.fileId, { fields: 'id,name,parents,trashed', supportsAllDrives: true });
  var parents = meta.parents || [];
  if (parents.indexOf(params.folderId) === -1) throw new Error('File tidak berada di folder Drive yang terhubung. File tidak dihapus.');
  if (meta.trashed) throw new Error('File sudah berada di Trash Drive.');
  // Advanced Drive Service Apps Script memetakan REST files.delete menjadi Drive.Files.remove.
  Drive.Files.remove(params.fileId, { supportsAllDrives: true });
}

function verifyFirebaseAccount_(idToken) {
  var response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_API_KEY),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true }
  );
  var payload = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() !== 200 || !payload.users || !payload.users.length) throw new Error('Sesi Firebase tidak valid. Login ulang lalu coba lagi.');
  return String(payload.users[0].email || '').toLowerCase();
}

function getAccountAccess_(email, idToken) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/accountAccess/' + encodeURIComponent(email);
  var response = UrlFetchApp.fetch(url, { method: 'get', headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) throw new Error('Gagal memeriksa status anggota di Firestore.');
  var doc = JSON.parse(response.getContentText() || '{}');
  var f = doc.fields || {};
  return { active: !!(f.active && f.active.booleanValue), role: f.role ? f.role.stringValue : 'member', userId: f.userId ? f.userId.stringValue : '' };
}

function assertWorkspaceAdmin_(email, idToken) {
  if (email === WORKSPACE_OWNER_EMAIL) return;
  var access = getAccountAccess_(email, idToken);
  if (!access || access.active !== true || access.role !== 'admin') throw new Error('Hanya admin Workspace yang dapat membuat akun anggota.');
}

function firestoreString_(value) { return { stringValue: String(value == null ? '' : value) }; }
function firestoreBool_(value) { return { booleanValue: !!value }; }
function firestoreTimestamp_() { return { timestampValue: new Date().toISOString() }; }

function createFirebaseMember_(params) {
  var required = ['adminIdToken', 'id', 'email', 'name', 'divisi', 'jabatan', 'password'];
  required.forEach(function (key) { if (!params[key]) throw new Error('Data ' + key + ' wajib diisi.'); });
  var adminEmail = verifyFirebaseAccount_(params.adminIdToken);
  assertWorkspaceAdmin_(adminEmail, params.adminIdToken);

  var id = String(params.id).toLowerCase();
  var email = String(params.email).toLowerCase();
  if (!/^[a-z0-9-]+-mdc\.26\.2$/.test(id) || email !== id + WORKSPACE_DOMAIN) throw new Error('Format ID/email anggota tidak sesuai.');
  var previousAccess = getAccountAccess_(email, params.adminIdToken);
  if (previousAccess && previousAccess.role === 'admin') throw new Error('Akun ini sudah tercatat sebagai admin. Jangan buat ulang melalui form anggota biasa.');
  if (String(params.password).length < 6) throw new Error('Password minimal 6 karakter.');
  if (String(params.name).length > 90 || String(params.jabatan).length > 60) throw new Error('Nama atau jabatan terlalu panjang.');

  var signupUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(FIREBASE_API_KEY);
  var signupResponse = UrlFetchApp.fetch(signupUrl, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ email: email, password: String(params.password), returnSecureToken: true }),
    muteHttpExceptions: true
  });
  var signup = JSON.parse(signupResponse.getContentText() || '{}');
  if (signupResponse.getResponseCode() !== 200 || !signup.localId || !signup.idToken) {
    var authError = signup.error && signup.error.message ? signup.error.message : 'Gagal membuat akun Firebase Authentication.';
    if (authError.indexOf('EMAIL_EXISTS') >= 0) authError = 'Email akun sudah terdaftar di Firebase Authentication.';
    if (authError.indexOf('WEAK_PASSWORD') >= 0) authError = 'Password terlalu lemah. Gunakan minimal 6 karakter.';
    throw new Error(authError);
  }

  var now = firestoreTimestamp_();
  var userFields = {
    name: firestoreString_(params.name), divisi: firestoreString_(params.divisi), jabatan: firestoreString_(params.jabatan),
    active: firestoreBool_(true), status: firestoreString_('aktif'), authUid: firestoreString_(signup.localId), createdAt: now, updatedAt: now
  };
  var accessFields = {
    email: firestoreString_(email), userId: firestoreString_(id), active: firestoreBool_(true), role: firestoreString_('member'), createdAt: now, updatedAt: now
  };
  var base = 'projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/';
  var commitUrl = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents:commit';
  var writes = [
    { update: { name: base + 'users/' + id, fields: userFields }, updateMask: { fieldPaths: Object.keys(userFields) } },
    { update: { name: base + 'accountAccess/' + email, fields: accessFields }, updateMask: { fieldPaths: Object.keys(accessFields) } }
  ];
  try {
    var commit = UrlFetchApp.fetch(commitUrl, {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + params.adminIdToken },
      payload: JSON.stringify({ writes: writes }), muteHttpExceptions: true
    });
    if (commit.getResponseCode() !== 200) throw new Error('Akun dibuat, tetapi profil Firestore gagal disimpan: ' + commit.getContentText().slice(0, 350));
  } catch (err) {
    // Roll back akun Auth jika sinkronisasi profil gagal.
    try {
      UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + encodeURIComponent(FIREBASE_API_KEY), {
        method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: signup.idToken }), muteHttpExceptions: true
      });
    } catch (rollbackErr) { Logger.log('Rollback akun gagal: ' + rollbackErr.message); }
    throw err;
  }
  return { success: true, id: id, email: email, uid: signup.localId, message: 'Akun Authentication dan profil Firestore berhasil dibuat.' };
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
