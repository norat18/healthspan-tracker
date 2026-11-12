// Sign-in (Google) and per-person storage (one Firestore document per account: users/{uid}).
// Everything saved is end-to-end encrypted on the device first (see vault.js): the database holds only ciphertext.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  deleteUser, reauthenticateWithPopup } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp, collection, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, appCheckSiteKey } from './firebase-config.js';

// Run the sign-in handler on this site's own address (Firebase Hosting serves it; Cloudflare proxies it — see
// functions/[[path]].js). Browsers that block third-party storage (Safari, newer Chrome) then still complete sign-in.
const ownHandler = /\.(web\.app|firebaseapp\.com|pages\.dev)$/.test(location.hostname);
const app = initializeApp({ ...firebaseConfig, authDomain: ownHandler ? location.host : firebaseConfig.authDomain });
// App Check: proves requests come from this app (blocks scripted abuse of the database).
if (appCheckSiteKey && location.hostname !== 'localhost') initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
const auth = getAuth(app);
const store = getFirestore(app);
const ref = () => doc(store, 'users', auth.currentUser.uid);
// Daily history: users/{uid}/history/{YYYY-MM-DD} holds the data as it was before that day's first change.
const histCol = () => collection(store, 'users', auth.currentUser.uid, 'history');
const histRef = day => doc(store, 'users', auth.currentUser.uid, 'history', day);
const KEEP_DAYS = 30;
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const provider = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };

// Finish a full-page (redirect) sign-in when returning from Google.
getRedirectResult(auth).catch(err => window.onCloudSignInError && window.onCloudSignInError(err));

let unwatch = null;
const vault = window.vault;
const uid = () => auth.currentUser.uid;
const needsKey = why => Object.assign(new Error('This device needs the recovery key'), { code: 'needs-key', why });
/** A saved document → { data: JSON text, savedAtMs } (decrypted). Old unencrypted documents are marked `legacy`. */
async function openDoc(d) {
  if (!d) return null;
  if (d.schema !== 2) return { data: d.data, savedAtMs: d.savedAtMs || 0, legacy: true };
  const raw = vault.load(uid()); if (!raw) throw needsKey('missing');
  try { return { data: await vault.decrypt(raw, d), savedAtMs: d.savedAtMs || 0 }; } catch (e) { throw needsKey('mismatch'); }
}
/** JSON text → encrypted fields to save. */
async function seal(json) {
  const raw = vault.load(uid()); if (!raw) throw needsKey('missing');
  return { ...(await vault.encrypt(raw, json)), schema: 2 };
}
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
  getIdToken: () => auth.currentUser.getIdToken(),
  /** Signing out also removes this device's copy of the key; the recovery key opens the data again. */
  signOut: () => { if (unwatch) { unwatch(); unwatch = null; } if (auth.currentUser) vault.forget(uid()); return signOut(auth); },
  /* ---- encryption key ---- */
  hasKey: () => !!vault.load(uid()),
  /** Make a new key for this account (first use) and return its recovery key. */
  createKey() { const raw = vault.newKey(); vault.keep(uid(), raw); return vault.toCode(raw); },
  recoveryKey() { const raw = vault.load(uid()); return raw ? vault.toCode(raw) : null; },
  /** Check a typed recovery key against the saved data, and keep it on this device if it opens it. */
  async useRecoveryKey(code) {
    const raw = vault.fromCode(code); if (!raw) throw Object.assign(new Error('bad format'), { code: 'bad-format' });
    const s = await getDoc(ref());
    if (s.exists() && s.data().schema === 2) { try { await vault.decrypt(raw, s.data()); } catch (e) { throw Object.assign(new Error('wrong key'), { code: 'wrong-key' }); } }
    vault.keep(uid(), raw);
  },
  /** Lost key: delete the saved (unreadable) data and start over with a new key. Returns the new recovery key. */
  async startOver() {
    await Promise.all((await getDocs(histCol())).docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(ref());
    return this.createKey();
  },
  /** { data: JSON string, savedAtMs, legacy? } or null. Throws { code: 'needs-key' } if this device can't open it. */
  async load() { const s = await getDoc(ref()); return openDoc(s.exists() ? s.data() : null); },
  /** Save only if nobody else saved since `baseMs`; otherwise return the newer copy so the app can merge. */
  async save(json, savedAtMs, baseMs) {
    const sealed = await seal(json);
    const res = await runTransaction(store, async tx => {
      const day = localDay();
      const snap = await tx.get(ref()), remote = snap.exists() ? snap.data() : null;
      const hist = remote ? await tx.get(histRef(day)) : null;
      if (remote && (remote.savedAtMs || 0) > (baseMs || 0)) return { conflictDoc: remote };
      // First save of the day: keep a copy of yesterday's state so it can be restored (encrypted, like everything else).
      if (remote && !hist.exists()) {
        const old = remote.schema === 2 ? { data: remote.data, iv: remote.iv } : await vault.encrypt(vault.load(uid()), remote.data);
        tx.set(histRef(day), { ...old, savedAtMs: remote.savedAtMs || 0, schema: 2 });
      }
      tx.set(ref(), { ...sealed, savedAtMs, updatedAt: serverTimestamp() });
      return { ok: true, newDay: remote && !hist.exists() };
    });
    return res.conflictDoc ? { conflict: await openDoc(res.conflictDoc) } : res;
  },
  /** Earlier daily copies, newest first: [{ day, savedAtMs, data }] (copies this device can't open are skipped). */
  async history() {
    const snaps = await getDocs(histCol());
    const out = await Promise.all(snaps.docs.map(async d => { try { return { day: d.id, ...(await openDoc(d.data())) }; } catch (e) { return null; } }));
    return out.filter(Boolean).sort((a, b) => b.day.localeCompare(a.day));
  },
  /** Encrypt any daily copies saved before encryption was added. */
  async encryptOldHistory() {
    for (const d of (await getDocs(histCol())).docs) {
      const h = d.data(); if (h.schema === 2) continue;
      const sealed = await seal(h.data);
      await deleteDoc(d.ref);
      await setDoc(d.ref, { ...sealed, savedAtMs: h.savedAtMs || 0 });
    }
  },
  /** Keep only the newest KEEP_DAYS copies. */
  async pruneHistory() {
    const all = (await getDocs(histCol())).docs.map(d => d.id).sort().reverse();
    await Promise.all(all.slice(KEEP_DAYS).map(day => deleteDoc(histRef(day))));
  },
  /** Live updates when another device saves. */
  watch(cb) {
    if (unwatch) unwatch();
    unwatch = onSnapshot(ref(), snap => { if (!snap.metadata.hasPendingWrites) openDoc(snap.exists() ? snap.data() : null).then(cb, () => {}); }, () => {});
    return unwatch;
  },
  /** Permanently delete the saved data and the sign-in account. */
  async removeAll() {
    if (unwatch) { unwatch(); unwatch = null; }
    await Promise.all((await getDocs(histCol())).docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(ref());
    vault.forget(uid());
    try { await deleteUser(auth.currentUser); }
    catch (err) {
      if (err.code !== 'auth/requires-recent-login') throw err;
      await reauthenticateWithPopup(auth.currentUser, provider());   // Google asks to confirm it's you
      await deleteUser(auth.currentUser);
    }
  },
};
onAuthStateChanged(auth, user => window.onCloudUser && window.onCloudUser(user));
