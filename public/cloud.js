// Sign-in (Google) and per-person storage (one Firestore document per account: users/{uid}).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// Run the sign-in handler on this site's own address (Firebase Hosting serves it; Cloudflare proxies it — see
// functions/__/[[path]].js). Browsers that block third-party storage (Safari, newer Chrome) then still complete sign-in.
const ownHandler = /\.(web\.app|firebaseapp\.com|pages\.dev)$/.test(location.hostname);
const app = initializeApp({ ...firebaseConfig, authDomain: ownHandler ? location.host : firebaseConfig.authDomain });
const auth = getAuth(app);
const store = getFirestore(app);
const ref = () => doc(store, 'users', auth.currentUser.uid);
const provider = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };

// Finish a full-page (redirect) sign-in when returning from Google.
getRedirectResult(auth).catch(err => window.onCloudSignInError && window.onCloudSignInError(err));

window.cloud = {
  /** Pop-up first; if the browser blocks pop-ups (or on phones), sign in on a full page instead. */
  async signIn() {
    const mobile = matchMedia('(max-width: 640px)').matches && 'ontouchstart' in window;
    if (mobile) return signInWithRedirect(auth, provider());
    try { return await signInWithPopup(auth, provider()); }
    catch (err) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(err.code))
        return signInWithRedirect(auth, provider());
      throw err;
    }
  },
  signOut: () => signOut(auth),
  /** { data: JSON string, savedAtMs } or null */
  async load() { const s = await getDoc(ref()); return s.exists() ? s.data() : null; },
  save: (json, savedAtMs) => setDoc(ref(), { data: json, savedAtMs, updatedAt: serverTimestamp(), schema: 1 }),
  remove: () => deleteDoc(ref()),
};
onAuthStateChanged(auth, user => window.onCloudUser && window.onCloudUser(user));
