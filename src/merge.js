// Merging progress between devices (pure functions, unit-tested).
//
// Every card carries `t` = when it last changed (ms). Removing a word leaves a
// tombstone in `deleted[id] = t`, so the removal also reaches the other devices.
// When two devices disagree, the newest change for each word wins.

const SETTINGS_KEYS = ['dailyLimit', 'level', 'autoSpeak', 'levels', 'direction'];

function newer(a, b) { return (a && a.t ? a.t : 0) >= (b && b.t ? b.t : 0) ? a : b; }

export function mergeStates(local, remote) {
  if (!remote) return local;
  const progress = {};
  const deleted = { ...(remote.deleted || {}) };
  for (const [id, t] of Object.entries(local.deleted || {})) deleted[id] = Math.max(t, deleted[id] || 0);

  const ids = new Set([...Object.keys(local.progress || {}), ...Object.keys(remote.progress || {})]);
  for (const id of ids) {
    const l = local.progress?.[id], r = remote.progress?.[id];
    const card = l && r ? newer(l, r) : (l || r);
    if (deleted[id] && deleted[id] >= (card.t || 0)) continue; // removed after its last change
    progress[id] = card;
  }
  // a tombstone is only needed while some device might still have the word
  for (const id of Object.keys(deleted)) if (progress[id]) delete deleted[id];

  // custom words: union by id (newer copy wins)
  const custom = new Map();
  for (const w of [...(remote.custom || []), ...(local.custom || [])]) {
    const prev = custom.get(w.id);
    custom.set(w.id, prev ? newer(w, prev) : w);
  }

  // settings: whichever was changed last
  const ls = local.settings || {}, rs = remote.settings || {};
  // a device that has never been set up (no levels chosen) never wins a tie
  const lt = (ls.t || 0) + (ls.levels ? 0.5 : 0), rt = (rs.t || 0) + (rs.levels ? 0.5 : 0);
  const base = lt >= rt ? ls : rs;
  const settings = { ...rs, ...ls };
  for (const k of SETTINGS_KEYS) if (k in base) settings[k] = base[k];
  settings.t = Math.max(ls.t || 0, rs.t || 0);

  // activity log: per day and field, keep the larger number
  const log = { ...(remote.log || {}) };
  for (const [day, e] of Object.entries(local.log || {})) {
    const o = log[day] || {};
    log[day] = {
      reviews: Math.max(e.reviews || 0, o.reviews || 0),
      correct: Math.max(e.correct || 0, o.correct || 0),
      added: Math.max(e.added || 0, o.added || 0),
    };
  }

  const skipped = [...new Set([...(remote.skipped || []), ...(local.skipped || [])])].filter((id) => !progress[id]);

  // badges: union, keep the earliest unlock date
  const badges = { ...(remote.badges || {}) };
  for (const [id, d] of Object.entries(local.badges || {})) badges[id] = badges[id] && badges[id] < d ? badges[id] : d;

  // counters for social badges: keep the larger
  const counters = { ...(remote.settings?.counters || {}) };
  for (const [k, v] of Object.entries(local.settings?.counters || {})) counters[k] = Math.max(v || 0, counters[k] || 0);
  if (Object.keys(counters).length) settings.counters = counters;

  return { progress, deleted, custom: [...custom.values()], settings, log, skipped, badges };
}

// Compact form for the server: Firestore documents are limited to 1 MiB, and all
// 6,930 words as plain objects would be close to that.
// card -> [stage, due, added, last, reviews, lapses, flags, t]; flags: 1 = mastered, 2 = known
export function encode(state) {
  const p = {};
  for (const [id, c] of Object.entries(state.progress || {})) {
    p[id] = [c.stage, c.due, c.added, c.last || '', c.reviews || 0, c.lapses || 0, (c.mastered ? 1 : 0) | (c.known ? 2 : 0), c.t || 0];
  }
  return {
    v: 1,
    p,
    deleted: state.deleted || {},
    custom: state.custom || [],
    settings: state.settings || {},
    log: state.log || {},
    skipped: state.skipped || [],
    badges: state.badges || {},
  };
}

export function decode(doc) {
  if (!doc || doc.v !== 1) return null;
  const progress = {};
  for (const [id, a] of Object.entries(doc.p || {})) {
    const c = { stage: a[0], due: a[1], added: a[2], last: a[3] || null, reviews: a[4], lapses: a[5], mastered: !!(a[6] & 1), t: a[7] };
    if (a[6] & 2) c.known = true;
    progress[id] = c;
  }
  return {
    progress,
    deleted: doc.deleted || {},
    custom: doc.custom || [],
    settings: doc.settings || {},
    log: doc.log || {},
    skipped: doc.skipped || [],
    badges: doc.badges || {},
  };
}
