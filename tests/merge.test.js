import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, encode, decode } from '../src/merge.js';

const card = (stage, t, extra = {}) => ({ stage, due: '2026-11-10', added: '2026-11-01', last: null, reviews: stage, lapses: 0, mastered: false, t, ...extra });
const S = (o) => ({ progress: {}, deleted: {}, custom: [], settings: {}, log: {}, skipped: [], ...o });

test('no remote yet: local is kept as is', () => {
  const l = S({ progress: { a: card(1, 10) } });
  assert.equal(mergeStates(l, null), l);
});

test('words from both devices are combined', () => {
  const m = mergeStates(S({ progress: { a: card(1, 10) } }), S({ progress: { b: card(2, 20) } }));
  assert.deepEqual(Object.keys(m.progress).sort(), ['a', 'b']);
});

test('the most recent change to a word wins, in either direction', () => {
  const l = S({ progress: { a: card(3, 300) } });
  const r = S({ progress: { a: card(5, 200) } });
  assert.equal(mergeStates(l, r).progress.a.stage, 3);
  assert.equal(mergeStates(r, l).progress.a.stage, 3);
});

test('a removal on one device reaches the other', () => {
  const phone = S({ progress: {}, deleted: { a: 500 } });
  const laptop = S({ progress: { a: card(4, 400) } });
  const m = mergeStates(laptop, phone);
  assert.equal(m.progress.a, undefined);
  assert.equal(m.deleted.a, 500);
});

test('re-adding after a removal brings the word back', () => {
  const m = mergeStates(S({ progress: { a: card(0, 900) } }), S({ deleted: { a: 500 } }));
  assert.equal(m.progress.a.stage, 0);
  assert.equal(m.deleted.a, undefined);
});

test('settings follow whichever device changed them last', () => {
  const l = S({ settings: { levels: ['A1'], direction: 'sv-en', t: 100 } });
  const r = S({ settings: { levels: ['B2', 'C1'], direction: 'mixed', t: 200 } });
  const m = mergeStates(l, r);
  assert.deepEqual(m.settings.levels, ['B2', 'C1']);
  assert.equal(m.settings.direction, 'mixed');
  assert.equal(m.settings.t, 200);
});

test('activity log keeps the larger count per day', () => {
  const m = mergeStates(
    S({ log: { '2026-11-03': { reviews: 10, correct: 8, added: 1 }, '2026-11-04': { reviews: 2, correct: 2, added: 0 } } }),
    S({ log: { '2026-11-03': { reviews: 12, correct: 7, added: 3 } } }),
  );
  assert.deepEqual(m.log['2026-11-03'], { reviews: 12, correct: 8, added: 3 });
  assert.equal(m.log['2026-11-04'].reviews, 2);
});

test('custom words are combined; skipped list drops added words', () => {
  const m = mergeStates(
    S({ custom: [{ id: 'c1', sv: 'hej', t: 1 }], skipped: ['x', 'a'], progress: { a: card(0, 5) } }),
    S({ custom: [{ id: 'c2', sv: 'tack', t: 1 }], skipped: ['y'] }),
  );
  assert.deepEqual(m.custom.map((w) => w.id).sort(), ['c1', 'c2']);
  assert.deepEqual(m.skipped.sort(), ['x', 'y']);
});

test('merging is stable: merging the result again changes nothing', () => {
  const l = S({ progress: { a: card(1, 10), b: card(2, 30) }, deleted: { c: 50 } });
  const r = S({ progress: { b: card(3, 20), c: card(1, 40) } });
  const m1 = mergeStates(l, r);
  assert.deepEqual(mergeStates(m1, m1), m1);
  assert.deepEqual(mergeStates(m1, r), m1);
});

test('compact encoding round-trips', () => {
  const s = S({
    progress: { a: card(11, 99, { mastered: true, last: '2026-11-04' }), b: card(5, 7, { known: true }) },
    settings: { levels: ['B1'], t: 3 },
    log: { '2026-11-04': { reviews: 1, correct: 1, added: 0 } },
  });
  const back = decode(JSON.parse(JSON.stringify(encode(s))));
  assert.deepEqual(back.progress, s.progress);
  assert.deepEqual(back.settings, s.settings);
  assert.deepEqual(back.log, s.log);
});

test('a full vocabulary fits comfortably in one server document', () => {
  const progress = {};
  for (let i = 0; i < 7000; i++) progress['kelly-' + (1000 + i)] = card(i % 12, 1762300000000 + i, { last: '2026-11-04' });
  const bytes = Buffer.byteLength(JSON.stringify(encode(S({ progress }))));
  assert.ok(bytes < 700 * 1024, `encoded size ${bytes} bytes`);
});

test('unknown document versions are ignored', () => {
  assert.equal(decode({ v: 99 }), null);
  assert.equal(decode(null), null);
});

test('a fresh device never overwrites settings from a set-up device', () => {
  const fresh = S({ settings: { levels: null, direction: 'sv-en' } });
  const used = S({ settings: { levels: ['B2', 'C1'], direction: 'mixed' } });
  assert.deepEqual(mergeStates(fresh, used).settings.levels, ['B2', 'C1']);
  assert.deepEqual(mergeStates(used, fresh).settings.levels, ['B2', 'C1']);
  // but a deliberate newer change still wins
  const changed = S({ settings: { levels: ['A1'], t: 5 } });
  assert.deepEqual(mergeStates(changed, used).settings.levels, ['A1']);
});

test('learned flag and skip positions survive encode/decode and merge', () => {
  const local = { progress: { a: { stage: 11, due: '9999-12-31', added: '2026-11-12', reviews: 0, lapses: 0, known: true, learned: true, t: 5 } }, skipped: ['x', 'y'], skipPos: { x: 4 } };
  const back = decode(encode(local));
  assert.equal(back.progress.a.learned, true);
  assert.deepEqual(back.skipPos, { x: 4 });
  const merged = mergeStates({ ...local, skipPos: { x: 7 } }, { progress: {}, skipped: ['y', 'z'], skipPos: { y: 12, z: 3, x: 1 } });
  assert.deepEqual(merged.skipPos, { x: 7, y: 12, z: 3 });
});
