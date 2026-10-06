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

export const requestNotificationPermission = async () => {
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      // Explicitly register the service worker with the config passed via query parameters
      // This prevents us from having to hardcode secrets in the public/ folder
      const swUrl = `${import.meta.env.BASE_URL}firebase-messaging-sw.js?apiKey=${firebaseConfig.apiKey}&projectId=${firebaseConfig.projectId}&messagingSenderId=${firebaseConfig.messagingSenderId}&appId=${firebaseConfig.appId}`;
      const registration = await navigator.serviceWorker.register(swUrl);

      const tokenOptions: any = { serviceWorkerRegistration: registration };
      if (import.meta.env.VITE_FIREBASE_VAPID_KEY) {
        tokenOptions.vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      }

      const currentToken = await getToken(messaging, tokenOptions);

      if (currentToken) {
        // Save the token to our database
        await saveTokenToDatabase(currentToken);
        return currentToken;
      } else {
        console.log("No registration token available. Request permission to generate one.");
      }
    } else {
      console.log("Notification permission not granted.");
    }
  } catch (error) {
    console.error("An error occurred while retrieving token. ", error);
  }
  return null;
};

const saveTokenToDatabase = async (token: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Use upsert to handle duplicates if the user already has this token
    const { error } = await supabase
      .from("device_tokens")
      .upsert({ user_id: user.id, token: token }, { onConflict: "user_id,token" });

    if (error) {
      console.error("Error saving token to DB:", error);
    }
  } catch (err) {
    console.error("Failed to save token", err);
  }
};

export const setupMessageListener = (callback: (payload: any) => void) => {
  if (!messaging) return () => {};
  
  const unsubscribe = onMessage(messaging, (payload) => {
    callback(payload);
  });
  
  return unsubscribe;
};
