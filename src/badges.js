// Achievements and the word of the day (pure functions, unit-tested).

export const BADGES = [
  { id: 'first-word', icon: '🌱', name: 'Första ordet', desc: 'Add your first word', test: (c) => c.words >= 1 },
  { id: 'words-25', icon: '📗', name: 'Ordförråd', desc: 'Have 25 words', test: (c) => c.words >= 25 },
  { id: 'words-100', icon: '📚', name: 'Bokmal', desc: 'Have 100 words', test: (c) => c.words >= 100 },
  { id: 'words-500', icon: '🏛️', name: 'Bibliotek', desc: 'Have 500 words', test: (c) => c.words >= 500 },
  { id: 'streak-3', icon: '🔥', name: 'Igång', desc: '3-day streak', test: (c) => c.bestStreak >= 3 },
  { id: 'streak-7', icon: '🗓️', name: 'En hel vecka', desc: '7-day streak', test: (c) => c.bestStreak >= 7 },
  { id: 'streak-30', icon: '🏆', name: 'Envis', desc: '30-day streak', test: (c) => c.bestStreak >= 30 },
  { id: 'reviews-100', icon: '💪', name: 'Hundra', desc: '100 reviews', test: (c) => c.reviews >= 100 },
  { id: 'reviews-1000', icon: '🚀', name: 'Tusen', desc: '1,000 reviews', test: (c) => c.reviews >= 1000 },
  { id: 'day-50', icon: '⚡', name: 'Maraton', desc: '50 reviews in one day', test: (c) => c.bestDay >= 50 },
  { id: 'mastered-1', icon: '⭐', name: 'Mästare', desc: 'Master a word (all 12 steps)', test: (c) => c.mastered >= 1 },
  { id: 'clean-sweep', icon: '🧹', name: 'Rent bord', desc: 'Finish all reviews due today', test: (c) => c.clearedToday },
  { id: 'polyglot', icon: '🎯', name: 'Alla nivåer', desc: 'Add a word from every level A1–C1', test: (c) => c.levelsTouched >= 5 },
  { id: 'own-word', icon: '✍️', name: 'Egna ord', desc: 'Create your own word', test: (c) => c.custom >= 1 },
  { id: 'username', icon: '🪪', name: 'Hej, jag heter…', desc: 'Pick a username', test: (c) => c.hasUsername },
  { id: 'friend-1', icon: '🤝', name: 'Kompis', desc: 'Make a friend', test: (c) => c.friends >= 1 },
  { id: 'friends-5', icon: '🎉', name: 'Gänget', desc: 'Have 5 friends', test: (c) => c.friends >= 5 },
  { id: 'moment-1', icon: '✨', name: 'Dela', desc: 'Share your first moment', test: (c) => c.momentsPosted >= 1 },
  { id: 'moments-10', icon: '📣', name: 'Berättare', desc: 'Share 10 moments', test: (c) => c.momentsPosted >= 10 },
  { id: 'wotd', icon: '☀️', name: 'Dagens ord', desc: 'Add a word of the day', test: (c) => c.wotdAdded >= 1 },
];

// Returns ids of badges that are earned now but not yet in `unlocked`.
export function newlyEarned(ctx, unlocked = {}) {
  return BADGES.filter((b) => !unlocked[b.id] && b.test(ctx)).map((b) => b.id);
}

export function badgeById(id) { return BADGES.find((b) => b.id === id); }

// Same word for everyone on the same day and level set; rotates daily.
export function wordOfDay(words, date) {
  if (!words.length) return null;
  let h = 2166136261;
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return words[(h >>> 0) % words.length];
}
