/* Batu Kunci Firebase Cloud Messaging service worker */
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBoAiVpGp_QBa_FQYOQefflFwqKv8Pbry0",
  authDomain: "mediacreativeut262b.firebaseapp.com",
  projectId: "mediacreativeut262b",
  storageBucket: "mediacreativeut262b.firebasestorage.app",
  messagingSenderId: "263094318099",
  appId: "1:263094318099:web:363c0cd981b82060cebbe6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || payload.data?.title || 'Batu Kunci';
  const body = payload.notification?.body || payload.data?.body || 'Ada pembaruan baru.';
  self.registration.showNotification(title, {
    body,
    tag: payload.data?.tag || 'batukunci',
    data: payload.data || {}
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './app.html';
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    const client = list.find(c => 'focus' in c);
    if (client) return client.focus();
    return clients.openWindow(url);
  }));
});
