// Sign-in (Google) and per-person storage (one Firestore document per account: users/{uid}).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const store = getFirestore(app);
const ref = () => doc(store, 'users', auth.currentUser.uid);

window.cloud = {
  signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
  signOut: () => signOut(auth),
  /** { data: JSON string, savedAtMs } or null */
  async load() { const s = await getDoc(ref()); return s.exists() ? s.data() : null; },
  save: (json, savedAtMs) => setDoc(ref(), { data: json, savedAtMs, updatedAt: serverTimestamp(), schema: 1 }),
  remove: () => deleteDoc(ref()),
};
onAuthStateChanged(auth, user => window.onCloudUser && window.onCloudUser(user));
