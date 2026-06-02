importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

let messaging = null;

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'FIREBASE_CONFIG') {
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(event.data.config);
  }

  messaging = firebase.messaging();
});

self.addEventListener('push', (event) => {
  if (!messaging) {
    return;
  }
});
