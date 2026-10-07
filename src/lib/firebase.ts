import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const messaging = typeof window !== "undefined" && "serviceWorker" in navigator ? getMessaging(app) : null;

export type NotificationSetupResult =
  | { status: "granted"; token: string }
  | { status: "denied" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

export const isNotificationSupported = () =>
  !!messaging && typeof window !== "undefined" && "Notification" in window && "PushManager" in window;

/**
 * Waits until the given registration has an *active* service worker.
 * `navigator.serviceWorker.register()` resolves while the worker is still installing on a
 * first-time install, and `pushManager.subscribe()` (used by getToken) fails with
 * "Subscription failed - no active Service Worker" in that state. The Firebase SDK only performs
 * this wait for its own default registration, not for a custom `serviceWorkerRegistration`.
 */
const waitForActive = (registration: ServiceWorkerRegistration, timeoutMs = 15000) =>
  new Promise<void>((resolve, reject) => {
    if (registration.active) return resolve();

    const incoming = registration.installing || registration.waiting;
    if (!incoming) return reject(new Error("No incoming service worker found."));

    const timer = setTimeout(
      () => reject(new Error(`Service worker did not activate within ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
    const onStateChange = () => {
      if (incoming.state === "activated") {
        clearTimeout(timer);
        incoming.removeEventListener("statechange", onStateChange);
        resolve();
      } else if (incoming.state === "redundant") {
        clearTimeout(timer);
        incoming.removeEventListener("statechange", onStateChange);
        reject(new Error("Service worker became redundant during installation."));
      }
    };
    incoming.addEventListener("statechange", onStateChange);
  });

const registerMessagingServiceWorker = async () => {
  // Explicitly register the service worker with the config passed via query parameters
  // This prevents us from having to hardcode secrets in the public/ folder
  const swUrl = `${import.meta.env.BASE_URL}firebase-messaging-sw.js?apiKey=${firebaseConfig.apiKey}&projectId=${firebaseConfig.projectId}&messagingSenderId=${firebaseConfig.messagingSenderId}&appId=${firebaseConfig.appId}`;
  const registration = await navigator.serviceWorker.register(swUrl, {
    scope: import.meta.env.BASE_URL,
  });
  await waitForActive(registration);
  return registration;
};

/**
 * Registers the service worker, obtains an FCM token and stores it for the current user.
 * Assumes notification permission is already granted. Throws on failure.
 */
const registerDeviceToken = async (): Promise<string> => {
  if (!messaging) throw new Error("Messaging is not supported in this browser.");

  const registration = await registerMessagingServiceWorker();

  const tokenOptions: Parameters<typeof getToken>[1] = { serviceWorkerRegistration: registration };
  if (import.meta.env.VITE_FIREBASE_VAPID_KEY) {
    tokenOptions.vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  }

  const currentToken = await getToken(messaging, tokenOptions);
  if (!currentToken) throw new Error("Firebase returned no registration token.");

  await saveTokenToDatabase(currentToken);
  return currentToken;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Asks the user for permission (if needed) and registers this device for push notifications. */
export const requestNotificationPermission = async (): Promise<NotificationSetupResult> => {
  if (!isNotificationSupported()) return { status: "unsupported" };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { status: "denied" };

    const token = await registerDeviceToken();
    return { status: "granted", token };
  } catch (error) {
    console.error("An error occurred while setting up notifications.", error);
    return { status: "error", message: errorMessage(error) };
  }
};

/**
 * If permission was already granted (e.g. via browser settings or a previous failed attempt),
 * silently (re)register this device. Keeps the stored token fresh, since FCM tokens can rotate.
 */
export const syncDeviceTokenIfPermitted = async (): Promise<NotificationSetupResult | null> => {
  if (!isNotificationSupported() || Notification.permission !== "granted") return null;

  try {
    const token = await registerDeviceToken();
    return { status: "granted", token };
  } catch (error) {
    console.error("Failed to sync push notification token.", error);
    return { status: "error", message: errorMessage(error) };
  }
};

const saveTokenToDatabase = async (token: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to enable notifications.");

  // Use upsert to handle duplicates if the user already has this token
  const { error } = await supabase
    .from("device_tokens")
    .upsert({ user_id: user.id, token: token }, { onConflict: "user_id,token" });

  if (error) throw new Error(`Could not save device token: ${error.message}`);
};

export const setupMessageListener = (callback: (payload: any) => void) => {
  if (!messaging) return () => {};
  
  const unsubscribe = onMessage(messaging, (payload) => {
    callback(payload);
  });
  
  return unsubscribe;
};
