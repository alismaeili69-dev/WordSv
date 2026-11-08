import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, newlyEarned, wordOfDay } from '../src/badges.js';
import { mergeStates } from '../src/merge.js';
import { weekKey, pairId, cleanUsername, USERNAME_RE } from '../src/social.js';

const zero = { words: 0, mastered: 0, bestStreak: 0, reviews: 0, bestDay: 0, clearedToday: false, levelsTouched: 0, custom: 0, hasUsername: false, friends: 0, momentsPosted: 0, wotdAdded: 0 };

test('nothing is earned at the start', () => {
  assert.deepEqual(newlyEarned(zero), []);
});

test('badges unlock once and are not repeated', () => {
  const ctx = { ...zero, words: 30, bestStreak: 3 };
  const first = newlyEarned(ctx);
  assert.deepEqual(first.sort(), ['first-word', 'streak-3', 'words-25'].sort());
  const unlocked = Object.fromEntries(first.map((id) => [id, '2026-11-08']));
  assert.deepEqual(newlyEarned(ctx, unlocked), []);
});

test('badge ids are unique', () => {
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
});

test('word of the day is stable for a date and changes between dates', () => {
  const words = Array.from({ length: 500 }, (_, i) => ({ id: 'w' + i }));
  assert.equal(wordOfDay(words, '2026-11-08'), wordOfDay(words, '2026-11-08'));
  const picks = new Set(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'].map((d) => wordOfDay(words, d).id));
  assert.ok(picks.size >= 3);
  assert.equal(wordOfDay([], '2026-11-08'), null);
});

test('badges merge between devices keeping the earliest date', () => {
  const m = mergeStates({ progress: {}, badges: { a: '2026-11-05', b: '2026-11-07' } }, { progress: {}, badges: { a: '2026-11-06', c: '2026-11-01' } });
  assert.deepEqual(m.badges, { a: '2026-11-05', b: '2026-11-07', c: '2026-11-01' });
});

test('usernames', () => {
  assert.equal(cleanUsername('  @Ali_Sv '), 'ali_sv');
  assert.ok(USERNAME_RE.test('ali.sv_99'));
  assert.ok(!USERNAME_RE.test('al'));
  assert.ok(!USERNAME_RE.test('åsa'));
  assert.ok(!USERNAME_RE.test('a b c'));
});

test('friendship ids are the same from both sides', () => {
  assert.equal(pairId('zed', 'amy'), pairId('amy', 'zed'));
  assert.equal(pairId('zed', 'amy'), 'amy_zed');
});

test('ISO week keys', () => {
  assert.equal(weekKey(new Date(2026, 10, 8)), '2026-W45'); // Sunday
  assert.equal(weekKey(new Date(2026, 10, 9)), '2026-W46'); // Monday
  assert.equal(weekKey(new Date(2027, 0, 1)), '2026-W53');
});
