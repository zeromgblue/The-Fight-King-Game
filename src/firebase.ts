import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, type User,
} from 'firebase/auth';
import { getDatabase, ref, set, update, remove, onChildAdded, onChildChanged, onChildRemoved, onDisconnect } from 'firebase/database';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const env = import.meta.env;
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL as string | undefined,
};
export const fbConfigured = !!(cfg.apiKey && cfg.projectId && cfg.appId);

const app = fbConfigured ? initializeApp(cfg) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const rtdb = app && cfg.databaseURL ? getDatabase(app, cfg.databaseURL) : null;
export const rtConfigured = !!rtdb;

export type { User };
export function watchAuth(cb: (u: User | null) => void) { if (!auth) { cb(null); return; } onAuthStateChanged(auth, cb); }

/** Google is the only sign-in method. */
export async function googleSignIn(): Promise<void> {
  if (!auth) throw new Error('not-configured');
  const prov = new GoogleAuthProvider(); prov.setCustomParameters({ prompt: 'select_account' });
  try { await signInWithPopup(auth, prov); }
  catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, prov);
    else throw e;
  }
}
export async function logout() { if (auth) await signOut(auth); }

/** players/{uid} — only that user can read/write it (see firestore.rules). Stores name + game save, no email. */
export interface Profile { name: string; save: unknown }
export async function loadProfile(uid: string): Promise<Profile | null> {
  if (!db) return null;
  const s = await getDoc(doc(db, 'players', uid));
  return s.exists() ? (s.data() as Profile) : null;
}
export async function pushProfile(uid: string, p: Profile) {
  if (!db) return;
  await setDoc(doc(db, 'players', uid), { name: p.name, save: p.save, updatedAt: serverTimestamp() }, { merge: true });
}

/** Live presence + chat: rooms/{room}/{uid}. Everyone in a room sees each other; chat text rides on the presence record. */
export interface Presence { n: string; l: number; x: number; y: number; d: number; f: number; m: number; k: number[]; a: number; w: number; c?: string; ct?: number; q?: number; qk?: number; qa?: number; }
export function joinRoom(room: string, uid: string, init: Presence, h: { add: (id: string, p: Presence) => void; change: (id: string, p: Presence) => void; remove: (id: string) => void }): () => void {
  if (!rtdb) return () => { /* offline */ };
  const me = ref(rtdb, `rooms/${room}/${uid}`), all = ref(rtdb, `rooms/${room}`);
  void set(me, init).catch(() => { /* ignore */ });
  void onDisconnect(me).remove().catch(() => { /* ignore */ });
  const u1 = onChildAdded(all, s => { if (s.key && s.key !== uid) h.add(s.key, s.val() as Presence); });
  const u2 = onChildChanged(all, s => { if (s.key && s.key !== uid) h.change(s.key, s.val() as Presence); });
  const u3 = onChildRemoved(all, s => { if (s.key && s.key !== uid) h.remove(s.key); });
  return () => { u1(); u2(); u3(); void remove(me).catch(() => { /* ignore */ }); };
}
export function patchPresence(room: string, uid: string, patch: Partial<Presence>) {
  if (!rtdb || !room) return;
  void update(ref(rtdb, `rooms/${room}/${uid}`), patch).catch(() => { /* ignore */ });
}
