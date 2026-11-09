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

export const status = { available: true, signedIn: false, restoring: false, user: null, syncing: false, lastSync: null, error: null };

const NET_TIMEOUT = 12000;
let hiddenAt = 0;

// Firestore on iPhone can keep a dead connection after the app has been in the background, and
// requests then wait forever. Turning the network off and on again opens a fresh connection.
export async function resetNetwork() {
  if (!fb) return;
  try { await fb.F.disableNetwork(fb.db); } catch { /* ignore */ }
  try { await fb.F.enableNetwork(fb.db); } catch { /* ignore */ }
}

function timeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms); }),
  ]).finally(() => clearTimeout(t));
}

// Run a Firestore request with a time limit. If it hangs, reset the connection and try once more.
// Writes are not sent twice: after a reset we keep waiting for the same write, which Firestore resends.
export async function net(fn, ms = NET_TIMEOUT, { write = false } = {}) {
  const first = fn();
  try {
    return await timeout(first, ms);
  } catch (e) {
    if (e.code !== 'timeout' && e.code !== 'unavailable') throw e;
    if (e.code === 'unavailable' && write) throw e;
    await resetNetwork();
    return timeout(write ? first : fn(), ms + 8000);
  }
}

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
  status.restoring = false;
  status.error = 'Could not reach the sign-in service. Check your internet connection.';
  emit();
  throw lastErr;
}

function onAuth(user) {
  status.signedIn = !!user;
  status.restoring = false;
  status.user = user ? {
    name: user.displayName || (user.providerData || []).map((p) => p.displayName).find(Boolean) || '',
    email: user.email || (user.providerData || []).map((p) => p.email).find(Boolean) || '',
    photo: user.photoURL || '',
    provider: providerOf(user),
  } : null;
  setFlag(!!user);
  emit();
  if (user) syncNow();
}

export async function initSync(h) {
  hooks = h;
  status.restoring = hasFlag();
  emit();
  if (hasFlag()) {
    try { await loadSdk(); } catch { /* offline: stay local, retry later */ }
  }
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (!status.signedIn) return;
    if (hiddenAt && Date.now() - hiddenAt > 30000) await resetNetwork(); // back from the background
    syncNow();
  });
  window.addEventListener('online', async () => { if (status.signedIn) { await resetNetwork(); syncNow(); } });
}

function friendlyAuthError(e, provider = 'google') {
  const code = (e && e.code) || '';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return null; // user closed it
  if (code.includes('popup-blocked')) return 'The sign-in window was blocked. Allow pop-ups for this site and try again.';
  if (code.includes('unauthorized-domain')) return 'This web address is not allowed to sign in yet (Firebase → Authentication → Authorized domains).';
  if (code.includes('operation-not-supported') || code.includes('web-storage-unsupported'))
    return 'Sign-in is not supported here. Open WordSv in Safari and sign in there, then reopen the app.';
  if (code.includes('network')) return 'No internet connection.';
  const notSetUp = code.includes('operation-not-allowed') || code.includes('invalid-oauth') || (provider === 'apple' && code.includes('invalid-credential'));
  if (notSetUp)
    return provider === 'apple' ? 'Sign in with Apple is not switched on for WordSv yet. Use Google for now.' : 'This sign-in method is not switched on yet.';
  if (code.includes('account-exists-with-different-credential'))
    return `This email address already has a WordSv account through ${provider === 'apple' ? 'Google' : 'Apple'}. Sign in with that instead.`;
  return 'Sign-in failed' + (code ? ` (${code})` : '') + '.';
}

function providerOf(user) {
  const ids = (user.providerData || []).map((p) => p.providerId);
  return ids.includes('apple.com') ? 'apple' : 'google';
}
function makeProvider(A, name) {
  if (name === 'apple') {
    const p = new A.OAuthProvider('apple.com');
    p.addScope('email');
    p.addScope('name');
    p.setCustomParameters({ locale: 'en' });
    return p;
  }
  const p = new A.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

// provider: 'google' or 'apple'
export async function signIn(provider = 'google') {
  status.error = null;
  emit();
  try {
    const { auth, A } = await loadSdk();
    await A.signInWithPopup(auth, makeProvider(A, provider));
    return true;
  } catch (e) {
    status.error = friendlyAuthError(e, provider);
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
  syncing = net(() => fb.F.runTransaction(fb.db, async (tx) => {
    const snap = await tx.get(ref);
    const remote = snap.exists() ? decode(snap.data()) : null;
    const merged = mergeStates(hooks.getState(), remote);
    tx.set(ref, { ...encode(merged), email, updatedAt: fb.F.serverTimestamp() });
    return merged;
  }), 20000).then((merged) => {
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
    await runBeforeDelete();
    await F.deleteDoc(ref);
    try {
      await A.deleteUser(auth.currentUser);
    } catch (e) {
      if (!String(e.code).includes('requires-recent-login')) throw e;
      await A.reauthenticateWithPopup(auth.currentUser, makeProvider(A, providerOf(auth.currentUser)));
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

// For the social features (social.js): the loaded SDK and the signed-in user.
export async function firebase() { return loadSdk(); }
export function currentUser() { return fb && fb.auth.currentUser; }
export function onDeleteAccount(fn) { beforeDelete.push(fn); }
const beforeDelete = [];
export async function runBeforeDelete() { for (const fn of beforeDelete) await fn().catch(() => {}); }
