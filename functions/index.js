const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

function cleanToken(token) {
  return typeof token === 'string' && token.length > 20 ? token : null;
}

async function userTokens(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const refs = ids.map(id => db.collection('users').doc(id));
  const snaps = await db.getAll(...refs);
  return snaps.map(s => cleanToken(s.data()?.fcmToken)).filter(Boolean);
}

async function sendPush(tokens, title, body, data = {}) {
  const unique = [...new Set(tokens)].filter(Boolean);
  if (!unique.length) return;
  const messages = unique.map(token => ({
    token,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v ?? '')])),
    webpush: { fcmOptions: { link: data.url || './app.html' } }
  }));
  const result = await messaging.sendEach(messages);
  logger.info('Batu Kunci push', {success: result.successCount, failure: result.failureCount});
}

// Komentar project -> anggota yang ditugaskan + pembuat project.
exports.notifyProjectComment = onDocumentCreated('projects/{projectId}/comments/{commentId}', async event => {
  const comment = event.data?.data();
  if (!comment) return;
  const projectSnap = await db.doc(`projects/${event.params.projectId}`).get();
  if (!projectSnap.exists) return;
  const project = projectSnap.data();
  const recipients = [...new Set([...(project.assignedTo || []), project.createdBy].filter(Boolean))]
    .filter(id => id !== comment.senderId);
  const tokens = await userTokens(recipients);
  await sendPush(tokens, `Komentar baru di ${project.nama || 'project'}`, `${comment.senderName || 'Anggota'}: ${String(comment.text || '').slice(0, 120)}`, {projectId:event.params.projectId, type:'comment'});
});

// Pesan grup/japri -> anggota lain.
exports.notifyChatMessage = onDocumentCreated('chats/{chatId}/messages/{messageId}', async event => {
  const message = event.data?.data();
  if (!message) return;
  const chatSnap = await db.doc(`chats/${event.params.chatId}`).get();
  if (!chatSnap.exists) return;
  const chat = chatSnap.data();
  const recipients = (chat.memberIds || []).filter(id => id && id !== message.senderId);
  const tokens = await userTokens(recipients);
  const title = chat.type === 'dm' ? `Pesan dari ${message.senderName || 'Anggota'}` : `Pesan baru di ${chat.name || 'Grup Chat'}`;
  const body = message.text ? String(message.text).slice(0, 120) : 'Mengirim lampiran baru.';
  await sendPush(tokens, title, body, {chatId:event.params.chatId, type:'chat'});
});

// Reminder deadline H-3, H-2, H-1, dan hari-H. Jalan tiap jam supaya tetap jalan
// walaupun semua browser anggota sedang ditutup.
exports.deadlineReminders = onSchedule({schedule:'every 1 hours', timeZone:'Asia/Jakarta'}, async () => {
  const now = new Date();
  const jakarta = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
  const projectsSnap = await db.collection('projects').where('status', '!=', 'selesai').get();
  for (const doc of projectsSnap.docs) {
    const p = doc.data();
    if (!p.deadline) continue;
    const deadline = new Date(`${p.deadline}T00:00:00+07:00`);
    const today = new Date(`${jakarta}T00:00:00+07:00`);
    const left = Math.round((deadline - today) / 86400000);
    if (left < 0 || left > 3) continue;
    const recipients = [...new Set([...(p.assignedTo || []), p.createdBy].filter(Boolean))];
    if (!recipients.length) continue;
    const title = left === 0 ? 'Deadline hari ini' : `Deadline H-${left}`;
    const body = `Project “${p.nama || 'Project'}” belum selesai dan deadline ${p.deadline}.`;
    for (const userId of recipients) {
      const key = `${userId}_${doc.id}_${p.deadline}_h${left}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const ref = db.collection('notifications').doc(key);
      const created = await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.exists) return false;
        tx.set(ref, {userId, projectId:doc.id, type:'deadline', title, body, read:false, createdAt:admin.firestore.FieldValue.serverTimestamp(), source:'scheduler'});
        return true;
      });
      if (created) {
        const tokens = await userTokens([userId]);
        await sendPush(tokens, title, body, {projectId:doc.id, type:'deadline'});
      }
    }
  }
});
