importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

// These values will be replaced by the build process or can be left empty if using URL params,
// but for standard Service Workers they must be hardcoded or injected.
// Since we can't easily use import.meta.env here, we'll initialize it lazily or hardcode it via build plugin.
const params = new URL(location).searchParams;

const firebaseConfig = {
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId")
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Firebase auto-handles background notifications when the 'notification' key is sent from the server.
// No manual onBackgroundMessage handler is needed for system popups.
