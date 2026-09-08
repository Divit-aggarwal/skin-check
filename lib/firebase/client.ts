import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// All values are NEXT_PUBLIC_ on purpose: the Firebase web config identifies
// the project, it doesn't authorize anything. Access is decided by Firebase
// Auth and firestore.rules, never by keeping these secret.
//
// Lazy on purpose, and this is not a style choice — getAuth() validates the
// API key the moment it runs, so initialising at module scope crashes
// `next build` while prerendering every page under the AuthProvider. These
// are functions so nothing initialises until a browser actually calls them.
// getApps() then keeps repeat calls (and fast refresh) on one instance.
function firebaseApp() {
  return getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
      });
}

export const auth = () => getAuth(firebaseApp());
export const db = () => getFirestore(firebaseApp());
