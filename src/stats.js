// Pure helpers for the Stats tab (no DOM), so they can be unit-tested.
import { addDays, todayStr } from './srs.js';

function active(entry) {
  return !!entry && ((entry.reviews || 0) + (entry.added || 0)) > 0;
}

// Consecutive days with at least one review or added word.
// Today not done yet doesn't break the streak (it counts from yesterday).
export function streakDays(log, today = todayStr()) {
  let day = active(log[today]) ? today : addDays(today, -1);
  let n = 0;
  while (active(log[day])) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(log) {
  const days = Object.keys(log).filter((d) => active(log[d])).sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// Activity for the last n days, oldest first.
export function lastDays(log, n, today = todayStr()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const e = log[date] || {};
    out.push({ date, reviews: e.reviews || 0, correct: e.correct || 0, added: e.added || 0 });
  }
  return out;
}

// How many reviews are due on each of the next n days (overdue cards count for today).
export function forecast(cards, n, today = todayStr()) {
  const out = Array.from({ length: n }, (_, i) => ({ date: addDays(today, i), count: 0 }));
  const last = out[n - 1].date;
  for (const c of cards) {
    if (c.due <= today) out[0].count++;
    else if (c.due <= last) out.find((d) => d.date === c.due).count++;
  }
  return out;
}

export function accuracy(days) {
  const r = days.reduce((s, d) => s + d.reviews, 0);
  const c = days.reduce((s, d) => s + d.correct, 0);
  return r ? Math.round((100 * c) / r) : null;
}
