// Google sign-in + cloud sync with Firebase (Authentication + Firestore).
// The app works fully without signing in; this only adds backup and multi-device sync.
//
// Data model: one document per user at users/{uid}, holding the compact state
// (see merge.js encode/decode). Security rules allow each user only their own document.
import { firebaseConfig, SDK_VERSIONS } from './firebase-config.js';
import { mergeStates, encode, decode } from './merge.js';

const FLAG = 'wordsv-signed-in';       // remembers that we should load Firebase on start
let fb = null;                         // loaded SDK modules + instances
let hooks = null;                      // { getState, applyState, onStatus }
let pushTimer = null;
let syncing = null;

export const status = { available: true, signedIn: false, user: null, syncing: false, lastSync: null, error: null };

function emit() { if (hooks) hooks.onStatus({ ...status }); }
function setFlag(on) { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch { /* ignore */ } }
function hasFlag() { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } }

async function loadSdk() {
  if (fb) return fb;
  let lastErr;
  for (const v of SDK_VERSIONS) {
    const base = `https://www.gstatic.com/firebasejs/${v}`;
    try {
      const [appM, authM, fsM] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-firestore.js`),
      ]);
      const app = appM.initializeApp(firebaseConfig);
      const auth = authM.getAuth(app);
      const db = fsM.getFirestore(app);
      fb = { app, auth, db, A: authM, F: fsM };
      authM.onAuthStateChanged(auth, onAuth);
      return fb;
    } catch (e) {
      lastErr = e;
    }
  }
  status.available = false;
  status.error = 'Could not reach the sign-in service. Check your internet connection.';
  emit();
  throw lastErr;
}

function onAuth(user) {
  status.signedIn = !!user;
  status.user = user ? { name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' } : null;
  setFlag(!!user);
  emit();
  if (user) syncNow();
}

export async function initSync(h) {
  hooks = h;
  emit();
  if (hasFlag()) {
    try { await loadSdk(); } catch { /* offline: stay local, retry later */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status.signedIn) syncNow();
  });
  window.addEventListener('online', () => { if (status.signedIn) syncNow(); });
}

function friendlyAuthError(e) {
  const code = (e && e.code) || '';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return null; // user closed it
  if (code.includes('popup-blocked')) return 'The sign-in window was blocked. Allow pop-ups for this site and try again.';
  if (code.includes('unauthorized-domain')) return 'This web address is not allowed to sign in yet (Firebase → Authentication → Authorized domains).';
  if (code.includes('operation-not-supported') || code.includes('web-storage-unsupported'))
    return 'Sign-in is not supported here. Open WordSv in Safari and sign in there, then reopen the app.';
  if (code.includes('network')) return 'No internet connection.';
  return 'Sign-in failed' + (code ? ` (${code})` : '') + '.';
}

export async function signIn() {
  status.error = null;
  emit();
  try {
    const { auth, A } = await loadSdk();
    const provider = new A.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await A.signInWithPopup(auth, provider);
    return true;
  } catch (e) {
    status.error = friendlyAuthError(e);
    emit();
    return false;
  }
}

export async function signOut() {
  if (!fb) return;
  await syncNow().catch(() => {});
  await fb.A.signOut(fb.auth);
  status.lastSync = null;
  emit();
}

function userDoc() {
  const u = fb && fb.auth.currentUser;
  return u ? fb.F.doc(fb.db, 'users', u.uid) : null;
}

// Read the server copy, merge with this device, write the result back (in one transaction,
// so two devices syncing at the same moment can't overwrite each other).
export function syncNow() {
  if (!fb || !fb.auth.currentUser) return Promise.resolve(false);
  if (syncing) return syncing;
  clearTimeout(pushTimer);
  status.syncing = true;
  emit();
  const ref = userDoc();
  const email = fb.auth.currentUser.email || '';
  syncing = fb.F.runTransaction(fb.db, async (tx) => {
    const snap = await tx.get(ref);
    const remote = snap.exists() ? decode(snap.data()) : null;
    const merged = mergeStates(hooks.getState(), remote);
    tx.set(ref, { ...encode(merged), email, updatedAt: fb.F.serverTimestamp() });
    return merged;
  }).then((merged) => {
    hooks.applyState(merged);
    status.lastSync = Date.now();
    status.error = null;
    return true;
  }).catch((e) => {
    status.error = navigator.onLine === false ? 'Offline — will sync when you are back online.' : `Sync failed${e && e.code ? ` (${e.code})` : ''}. Will retry.`;
    return false;
  }).finally(() => {
    status.syncing = false;
    syncing = null;
    emit();
  });
  return syncing;
}

// Called after every local change; batches changes into one write a few seconds later.
export function schedulePush() {
  if (!status.signedIn) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 4000);
}

export async function deleteAccount() {
  if (!fb || !fb.auth.currentUser) return false;
  const { A, F, auth } = fb;
  const ref = userDoc();
  try {
    await F.deleteDoc(ref);
    try {
      await A.deleteUser(auth.currentUser);
    } catch (e) {
      if (!String(e.code).includes('requires-recent-login')) throw e;
      await A.reauthenticateWithPopup(auth.currentUser, new A.GoogleAuthProvider());
      await A.deleteUser(auth.currentUser);
    }
    setFlag(false);
    status.signedIn = false;
    status.user = null;
    status.lastSync = null;
    emit();
    return true;
  } catch (e) {
    status.error = friendlyAuthError(e) || 'Could not delete the account.';
    emit();
    return false;
  }
}
