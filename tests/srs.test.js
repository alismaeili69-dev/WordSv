import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALS, LAST_STAGE, addDays, daysBetween, newCard, knownCard, review, isDue } from '../src/srs.js';

const T = '2026-11-04';

test('intervals are the agreed sequence', () => {
  assert.deepEqual(INTERVALS, [1, 2, 3, 5, 8, 14, 21, 31, 60, 90, 145, 180]);
});

test('date helpers handle month and year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-11-04', '2026-12-04'), 30);
  assert.equal(addDays('2026-03-28', 2), '2026-03-30'); // DST change in Sweden
});

test('a new word comes back tomorrow', () => {
  const c = newCard(T);
  assert.equal(c.stage, 0);
  assert.equal(c.due, '2026-11-05');
});

test('swipe right walks through the whole sequence', () => {
  let c = newCard(T);
  let day = c.due;
  for (let i = 1; i <= LAST_STAGE; i++) {
    c = review(c, true, day);
    assert.equal(c.stage, i);
    assert.equal(c.due, addDays(day, INTERVALS[i]));
    day = c.due;
  }
  assert.equal(c.mastered, false);
  c = review(c, true, day);
  assert.equal(c.mastered, true);
  assert.equal(c.stage, LAST_STAGE);
  assert.equal(c.due, addDays(day, 180));
});

test('swipe left goes two steps back (not below 0) and returns tomorrow', () => {
  const c5 = { ...newCard(T), stage: 5 };
  const r = review(c5, false, T);
  assert.equal(r.stage, 3);
  assert.equal(r.due, '2026-11-05');
  assert.equal(r.lapses, 1);
  assert.equal(review({ ...newCard(T), stage: 1 }, false, T).stage, 0);
});

test('forgetting a mastered word un-masters it', () => {
  const m = { ...newCard(T), stage: LAST_STAGE, mastered: true };
  const r = review(m, false, T);
  assert.equal(r.mastered, false);
  assert.equal(r.stage, LAST_STAGE - 2);
});

test('"I know it" starts at step 6 with a 14-day gap', () => {
  const k = knownCard(T);
  assert.equal(k.stage, 5);
  assert.equal(k.due, addDays(T, 14));
  assert.equal(isDue(k, T), false);
  assert.equal(isDue(k, addDays(T, 14)), true);
});

import { learnedCard, isLearned, NEVER } from '../src/srs.js';
test('"I know it" makes a learned card that is never due', () => {
  const c = learnedCard(T);
  assert.equal(isLearned(c), true);
  assert.equal(c.due, NEVER);
  assert.equal(isDue(c, '2099-01-01'), false);
  assert.equal(isLearned(newCard(T)), false);
});
