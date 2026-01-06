
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOhbNhcReZ9tE5txrwnMTzcHrDsW9e3UE",
  authDomain: "robotic-pact-477404-a6.firebaseapp.com",
  projectId: "robotic-pact-477404-a6",
  storageBucket: "robotic-pact-477404-a6.firebasestorage.app",
  messagingSenderId: "893039342941",
  appId: "1:893039342941:web:532b7b9c8a21f7d806e4b4"
};

// Initialize Firebase only if it hasn't been initialized yet to prevent "duplicate-app" errors
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
// Explicitly initialize storage with the gs:// bucket URL to ensure correct targeting
export const storage = getStorage(app, "gs://robotic-pact-477404-a6.firebasestorage.app");
export const googleProvider = new GoogleAuthProvider();
