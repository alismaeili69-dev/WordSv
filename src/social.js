// Social features on Firestore: public usernames, friends and Moments (24-hour word stories).
//
// Collections (see firestore.rules):
//   usernames/{name}      { uid }                         unique claim of a username
//   profiles/{uid}        { username, avatar, color, streak, words, mastered, weekReviews, weekKey, updatedAt }
//   friendships/{a_b}     { users:[a,b], names:{a,b}, avatars, requestedBy, status:'pending'|'accepted', createdAt }
//   moments/{id}          { author, username, avatar, word, translation, context, contextEn, note, emoji,
//                           theme, font, align, level, wordId, photo (JPEG data URL), scrim,
//                           audience:[uids], createdAt, expiresAt,
//                           reactions:{uid:emoji}, seen:{uid:true} }
import { firebase, currentUser } from './sync.js';
import { isStoryPhoto } from './photo.js';

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const MOMENT_HOURS = 24;
export const AVATARS = ['🦊', '🐻', '🦉', '🐧', '🦌', '🐺', '🐟', '🦆', '🐝', '🌻', '🍓', '🫐', '☕', '🎸', '🚲', '⛵', '🏔️', '🌙', '⭐', '🔥'];

let cache = { profile: undefined, friends: null, requests: null };

function uid() {
  const u = currentUser();
  if (!u) throw Object.assign(new Error('Not signed in'), { code: 'not-signed-in' });
  return u.uid;
}

export function cleanUsername(s) {
  return String(s || '').trim().toLowerCase().replace(/^@/, '');
}

export function pairId(a, b) { return a < b ? `${a}_${b}` : `${b}_${a}`; }

export function weekKey(d = new Date()) {
  // ISO week, e.g. 2026-W45
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

// ---------- profile & username ----------
export async function myProfile(force = false) {
  if (cache.profile !== undefined && !force) return cache.profile;
  const { F, db } = await firebase();
  const snap = await F.getDoc(F.doc(db, 'profiles', uid()));
  cache.profile = snap.exists() ? snap.data() : null;
  return cache.profile;
}

export async function usernameTaken(name) {
  const { F, db } = await firebase();
  const snap = await F.getDoc(F.doc(db, 'usernames', name));
  return snap.exists() && snap.data().uid !== uid();
}

export async function claimUsername(raw, { avatar, color }, stats) {
  const name = cleanUsername(raw);
  if (!USERNAME_RE.test(name)) throw Object.assign(new Error('3–20 characters: letters a–z, numbers, _ or .'), { code: 'bad-username' });
  const { F, db } = await firebase();
  const me = uid();
  const old = await myProfile(true);
  if (await usernameTaken(name)) throw Object.assign(new Error(`@${name} is already taken`), { code: 'taken' });
  const batch = F.writeBatch(db);
  if (old && old.username && old.username !== name) batch.delete(F.doc(db, 'usernames', old.username));
  if (!old || old.username !== name) batch.set(F.doc(db, 'usernames', name), { uid: me });
  const profile = { ...(old || {}), ...stats, username: name, avatar, color, updatedAt: Date.now() };
  batch.set(F.doc(db, 'profiles', me), profile);
  await batch.commit();
  cache.profile = profile;
  return profile;
}

// keep public stats (for the friends leaderboard) up to date
export async function updateStats(stats) {
  const p = cache.profile === undefined ? await myProfile() : cache.profile;
  if (!p) return;
  const changed = Object.keys(stats).some((k) => p[k] !== stats[k]);
  if (!changed) return;
  const { F, db } = await firebase();
  const next = { ...p, ...stats, updatedAt: Date.now() };
  await F.setDoc(F.doc(db, 'profiles', uid()), next);
  cache.profile = next;
}

export async function getProfile(id) {
  const { F, db } = await firebase();
  const snap = await F.getDoc(F.doc(db, 'profiles', id));
  return snap.exists() ? { uid: id, ...snap.data() } : null;
}

// ---------- friends ----------
export async function loadFriendships(force = false) {
  if (cache.friends && !force) return cache.friends;
  const { F, db } = await firebase();
  const me = uid();
  const res = await F.getDocs(F.query(F.collection(db, 'friendships'), F.where('users', 'array-contains', me)));
  const all = res.docs.map((d) => ({ id: d.id, ...d.data() }));
  const other = (f) => f.users.find((u) => u !== me);
  cache.friends = {
    friends: all.filter((f) => f.status === 'accepted').map((f) => ({ uid: other(f), username: f.names[other(f)], avatar: (f.avatars || {})[other(f)] || '🙂', id: f.id })),
    incoming: all.filter((f) => f.status === 'pending' && f.requestedBy !== me).map((f) => ({ uid: other(f), username: f.names[other(f)], avatar: (f.avatars || {})[other(f)] || '🙂', id: f.id })),
    outgoing: all.filter((f) => f.status === 'pending' && f.requestedBy === me).map((f) => ({ uid: other(f), username: f.names[other(f)], avatar: (f.avatars || {})[other(f)] || '🙂', id: f.id })),
  };
  return cache.friends;
}

export async function addFriend(raw) {
  const name = cleanUsername(raw);
  if (!USERNAME_RE.test(name)) throw Object.assign(new Error('That is not a valid username.'), { code: 'bad-username' });
  const { F, db } = await firebase();
  const me = uid();
  const mine = await myProfile();
  if (!mine) throw Object.assign(new Error('Choose your own username first.'), { code: 'no-username' });
  if (name === mine.username) throw Object.assign(new Error("That's you! 😄"), { code: 'self' });
  const u = await F.getDoc(F.doc(db, 'usernames', name));
  if (!u.exists()) throw Object.assign(new Error(`No one is called @${name}.`), { code: 'not-found' });
  const them = u.data().uid;
  const id = pairId(me, them);
  const ref = F.doc(db, 'friendships', id);
  const existing = await F.getDoc(ref).catch(() => null);
  if (existing && existing.exists()) {
    const f = existing.data();
    if (f.status === 'accepted') return 'already';
    if (f.requestedBy !== me) { await acceptFriend(id); return 'accepted'; }
    return 'pending';
  }
  const theirProfile = await getProfile(them).catch(() => null);
  const users = [me, them].sort();
  await F.setDoc(ref, {
    users,
    names: { [me]: mine.username, [them]: name },
    avatars: { [me]: mine.avatar || '🙂', [them]: (theirProfile && theirProfile.avatar) || '🙂' },
    requestedBy: me,
    status: 'pending',
    createdAt: Date.now(),
  });
  cache.friends = null;
  return 'sent';
}

export async function acceptFriend(id) {
  const { F, db } = await firebase();
  await F.updateDoc(F.doc(db, 'friendships', id), { status: 'accepted', acceptedAt: Date.now() });
  cache.friends = null;
}

export async function removeFriendship(id) {
  const { F, db } = await firebase();
  await F.deleteDoc(F.doc(db, 'friendships', id));
  cache.friends = null;
}

// ---------- moments ----------
export const LIMITS = { word: 60, translation: 120, context: 220, contextEn: 220, note: 200 };

export async function postMoment(m) {
  const { F, db } = await firebase();
  const me = uid();
  const profile = await myProfile();
  if (!profile) throw Object.assign(new Error('Choose a username first.'), { code: 'no-username' });
  const { friends } = await loadFriendships(true);
  const now = Date.now();
  const clip = (k) => String(m[k] || '').trim().slice(0, LIMITS[k]);
  const doc = {
    author: me,
    username: profile.username,
    avatar: profile.avatar || '🙂',
    word: clip('word'),
    translation: clip('translation'),
    context: clip('context'),
    contextEn: clip('contextEn'),
    note: clip('note'),
    emoji: String(m.emoji || '').slice(0, 8),
    photo: isStoryPhoto(m.photo) ? m.photo : '',
    scrim: ['dark', 'light', 'clean'].includes(m.scrim) ? m.scrim : 'dark',
    theme: m.theme || 'fika',
    font: m.font || 'sans',
    align: m.align === 'left' ? 'left' : 'center',
    level: m.level || '',
    wordId: m.wordId || '',
    audience: [me, ...friends.map((f) => f.uid)].slice(0, 300),
    createdAt: now,
    expiresAt: now + MOMENT_HOURS * 3600 * 1000,
    reactions: {},
    seen: {},
  };
  if (!doc.word && !doc.photo) throw Object.assign(new Error('Write a word or add a photo first.'), { code: 'empty' });
  const ref = await F.addDoc(F.collection(db, 'moments'), doc);
  return { id: ref.id, ...doc };
}

// All live moments I can see (mine + friends'), grouped by author, newest author first.
export async function loadMoments() {
  const { F, db } = await firebase();
  const me = uid();
  const res = await F.getDocs(F.query(F.collection(db, 'moments'), F.where('audience', 'array-contains', me)));
  const now = Date.now();
  const live = [], expiredMine = [];
  for (const d of res.docs) {
    const m = { id: d.id, ...d.data() };
    if (m.expiresAt > now) live.push(m);
    else if (m.author === me) expiredMine.push(m.id);
  }
  // tidy up my own expired moments
  for (const id of expiredMine) F.deleteDoc(F.doc(db, 'moments', id)).catch(() => {});
  live.sort((a, b) => a.createdAt - b.createdAt);
  const groups = new Map();
  for (const m of live) {
    if (!groups.has(m.author)) groups.set(m.author, { author: m.author, username: m.username, avatar: m.avatar, mine: m.author === me, items: [] });
    groups.get(m.author).items.push(m);
  }
  return [...groups.values()].sort((a, b) => (b.mine - a.mine) || (b.items.at(-1).createdAt - a.items.at(-1).createdAt));
}

export async function markSeen(m) {
  const me = uid();
  if (m.author === me || (m.seen && m.seen[me])) return;
  const { F, db } = await firebase();
  m.seen = { ...(m.seen || {}), [me]: true };
  await F.updateDoc(F.doc(db, 'moments', m.id), { [`seen.${me}`]: true }).catch(() => {});
}

export async function react(m, emoji) {
  const me = uid();
  const { F, db } = await firebase();
  const same = m.reactions && m.reactions[me] === emoji;
  m.reactions = { ...(m.reactions || {}) };
  if (same) delete m.reactions[me]; else m.reactions[me] = emoji;
  await F.updateDoc(F.doc(db, 'moments', m.id), { [`reactions.${me}`]: same ? F.deleteField() : emoji });
}

export async function deleteMoment(id) {
  const { F, db } = await firebase();
  await F.deleteDoc(F.doc(db, 'moments', id));
}

// ---------- leaderboard ----------
export async function leaderboard() {
  const me = uid();
  const { friends } = await loadFriendships();
  const wk = weekKey();
  const profiles = await Promise.all([me, ...friends.map((f) => f.uid)].map((id) => getProfile(id).catch(() => null)));
  return profiles.filter(Boolean).map((p) => ({
    uid: p.uid, username: p.username, avatar: p.avatar || '🙂', me: p.uid === me,
    week: p.weekKey === wk ? p.weekReviews || 0 : 0, streak: p.streak || 0, words: p.words || 0,
  })).sort((a, b) => b.week - a.week || b.streak - a.streak);
}

// ---------- account deletion ----------
export async function deleteSocialData() {
  const { F, db } = await firebase();
  const me = uid();
  const p = await myProfile(true).catch(() => null);
  const mine = await F.getDocs(F.query(F.collection(db, 'moments'), F.where('audience', 'array-contains', me))).catch(() => ({ docs: [] }));
  for (const d of mine.docs) if (d.data().author === me) await F.deleteDoc(d.ref).catch(() => {});
  const fr = await F.getDocs(F.query(F.collection(db, 'friendships'), F.where('users', 'array-contains', me))).catch(() => ({ docs: [] }));
  for (const d of fr.docs) await F.deleteDoc(d.ref).catch(() => {});
  if (p && p.username) await F.deleteDoc(F.doc(db, 'usernames', p.username)).catch(() => {});
  await F.deleteDoc(F.doc(db, 'profiles', me)).catch(() => {});
  cache = { profile: undefined, friends: null, requests: null };
}

export function resetCache() { cache = { profile: undefined, friends: null, requests: null }; }
