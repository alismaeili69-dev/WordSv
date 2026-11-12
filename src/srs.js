// Spaced-repetition logic for WordSv.
// A card's `stage` is an index into INTERVALS: the gap (in days) until its next review.

export const INTERVALS = [1, 2, 3, 5, 8, 14, 21, 31, 60, 90, 145, 180];
export const LAST_STAGE = INTERVALS.length - 1;
export const STEPS_BACK_ON_FORGET = 2;

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

// A word just added from the Learn tab: first review tomorrow.
export function newCard(today = todayStr()) {
  return { stage: 0, due: addDays(today, INTERVALS[0]), added: today, last: null, reviews: 0, lapses: 0, mastered: false };
}

// Swipe right: one step further along the sequence.
// Swipe left: back STEPS_BACK_ON_FORGET steps, and see it again tomorrow.
export function review(card, knew, today = todayStr()) {
  const c = { ...card, reviews: card.reviews + 1, last: today };
  if (knew) {
    if (c.stage >= LAST_STAGE) {
      c.stage = LAST_STAGE;
      c.mastered = true;
    } else {
      c.stage += 1;
    }
    c.due = addDays(today, INTERVALS[c.stage]);
  } else {
    c.stage = Math.max(0, c.stage - STEPS_BACK_ON_FORGET);
    c.mastered = false;
    c.lapses += 1;
    c.due = addDays(today, 1);
  }
  return c;
}

export function isDue(card, today = todayStr()) {
  return card.due <= today;
}

// "I know it" in Learn: the word goes straight to your learned words and is never scheduled.
export const NEVER = '9999-12-31';
export function learnedCard(today = todayStr()) {
  return { stage: LAST_STAGE, due: NEVER, added: today, last: null, reviews: 0, lapses: 0, mastered: false, known: true, learned: true };
}
export const isLearned = (card) => !!(card && card.learned);

// Older behaviour, kept for cards made before: skip the first steps, see the word again in 2 weeks
export const KNOWN_STAGE = 5;
export function knownCard(today = todayStr()) {
  return { stage: KNOWN_STAGE, due: addDays(today, INTERVALS[KNOWN_STAGE]), added: today, last: null, reviews: 0, lapses: 0, mastered: false, known: true };
}
