import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => value && !value.includes('replace-me') && !value.includes('your-project'),
);

let app = null;
export let auth = null;
export let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app, firebaseConfig.databaseURL);
}

export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID?.trim() || 'feeder-01';
export const DEVICE_PATH = `devices/${DEVICE_ID}`;
export const OFFLINE_TIMEOUT_MS = Number(import.meta.env.VITE_OFFLINE_TIMEOUT_MS) || 30000;
