// Sign-in (Google) and per-person storage (one Firestore document per account: users/{uid}).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  deleteUser, reauthenticateWithPopup } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, appCheckSiteKey } from './firebase-config.js';

// Run the sign-in handler on this site's own address (Firebase Hosting serves it; Cloudflare proxies it — see
// functions/__/[[path]].js). Browsers that block third-party storage (Safari, newer Chrome) then still complete sign-in.
const ownHandler = /\.(web\.app|firebaseapp\.com|pages\.dev)$/.test(location.hostname);
const app = initializeApp({ ...firebaseConfig, authDomain: ownHandler ? location.host : firebaseConfig.authDomain });
// App Check: proves requests come from this app (blocks scripted abuse of the database).
if (appCheckSiteKey && location.hostname !== 'localhost') initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
const auth = getAuth(app);
const store = getFirestore(app);
const ref = () => doc(store, 'users', auth.currentUser.uid);
const provider = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };

// Finish a full-page (redirect) sign-in when returning from Google.
getRedirectResult(auth).catch(err => window.onCloudSignInError && window.onCloudSignInError(err));

let unwatch = null;
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
  signOut: () => { if (unwatch) { unwatch(); unwatch = null; } return signOut(auth); },
  /** { data: JSON string, savedAtMs } or null */
  async load() { const s = await getDoc(ref()); return s.exists() ? s.data() : null; },
  /** Save only if nobody else saved since `baseMs`; otherwise return the newer copy so the app can merge. */
  save: (json, savedAtMs, baseMs) => runTransaction(store, async tx => {
    const snap = await tx.get(ref()), remote = snap.exists() ? snap.data() : null;
    if (remote && (remote.savedAtMs || 0) > (baseMs || 0)) return { conflict: remote };
    tx.set(ref(), { data: json, savedAtMs, updatedAt: serverTimestamp(), schema: 1 });
    return { ok: true };
  }),
  /** Live updates when another device saves. */
  watch(cb) {
    if (unwatch) unwatch();
    unwatch = onSnapshot(ref(), snap => { if (!snap.metadata.hasPendingWrites) cb(snap.exists() ? snap.data() : null); }, () => {});
    return unwatch;
  },
  /** Permanently delete the saved data and the sign-in account. */
  async removeAll() {
    if (unwatch) { unwatch(); unwatch = null; }
    await deleteDoc(ref());
    try { await deleteUser(auth.currentUser); }
    catch (err) {
      if (err.code !== 'auth/requires-recent-login') throw err;
      await reauthenticateWithPopup(auth.currentUser, provider());   // Google asks to confirm it's you
      await deleteUser(auth.currentUser);
    }
  },
};
onAuthStateChanged(auth, user => window.onCloudUser && window.onCloudUser(user));
