import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streakDays, bestStreak, lastDays, forecast, accuracy } from '../src/stats.js';

const T = '2026-11-04';
const log = {
  '2026-11-01': { reviews: 5, correct: 4, added: 0 },
  '2026-11-02': { reviews: 0, correct: 0, added: 3 },
  '2026-11-03': { reviews: 10, correct: 8, added: 1 },
  '2026-10-20': { reviews: 2, correct: 2, added: 0 },
};

test('streak counts back from yesterday when today is not done yet', () => {
  assert.equal(streakDays(log, T), 3);
});

test('streak includes today once something is done', () => {
  assert.equal(streakDays({ ...log, [T]: { reviews: 1, correct: 1, added: 0 } }, T), 4);
});

test('a missed day breaks the streak', () => {
  assert.equal(streakDays(log, '2026-11-06'), 0);
});

test('best streak', () => {
  assert.equal(bestStreak(log), 3);
});

test('lastDays fills gaps with zeros, oldest first', () => {
  const d = lastDays(log, 4, T);
  assert.deepEqual(d.map((x) => x.date), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  assert.deepEqual(d.map((x) => x.reviews), [5, 0, 10, 0]);
});

test('accuracy over a window', () => {
  assert.equal(accuracy(lastDays(log, 4, T)), 80);
  assert.equal(accuracy(lastDays({}, 4, T)), null);
});

test('forecast puts overdue cards on today', () => {
  const cards = [{ due: '2026-10-30' }, { due: T }, { due: '2026-11-06' }, { due: '2026-12-01' }];
  const f = forecast(cards, 7, T);
  assert.equal(f[0].count, 2);
  assert.equal(f[2].count, 1);
  assert.equal(f.reduce((s, d) => s + d.count, 0), 3);
});
