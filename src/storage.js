// All progress lives in the browser's localStorage on your phone.
// Use Export in Settings to keep a backup file.

const KEY = 'wordsv-v1';

const DEFAULT = {
  progress: {},          // wordId -> card (see srs.js)
  custom: [],            // words you added yourself
  // levels: which CEFR levels appear in Learn (null = not chosen yet -> show the level picker)
  settings: { dailyLimit: 50, level: 'all', autoSpeak: false, levels: null, direction: 'sv-en' },
  skipped: [],           // wordIds skipped in Learn (shown again later)
  log: {},               // 'YYYY-MM-DD' -> { reviews, correct, added } for stats and streaks
  deleted: {},           // wordId -> time removed (so removals sync to other devices)
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    const settings = { ...DEFAULT.settings, ...(data.settings || {}) };
    // People who used WordSv before levels existed were learning B2/C1 words
    if (!data.settings || !('levels' in data.settings)) {
      settings.levels = data.progress && Object.keys(data.progress).length ? ['B2', 'C1'] : null;
    }
    return { ...structuredClone(DEFAULT), ...data, settings };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save', e);
  }
}

export async function exportFile(state) {
  const name = `wordsv-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify({ app: 'WordSv', exported: new Date().toISOString(), ...state }, null, 2);
  // On iPhone, the share sheet lets you save to Files / iCloud Drive or AirDrop it
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'WordSv backup' });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export async function importFile(file) {
  const data = JSON.parse(await file.text());
  if (!data || typeof data.progress !== 'object') throw new Error('Not a WordSv backup file');
  return {
    ...structuredClone(DEFAULT),
    progress: data.progress,
    custom: Array.isArray(data.custom) ? data.custom : [],
    settings: { ...DEFAULT.settings, ...(data.settings || {}) },
    skipped: Array.isArray(data.skipped) ? data.skipped : [],
    log: data.log && typeof data.log === 'object' ? data.log : {},
    deleted: data.deleted && typeof data.deleted === 'object' ? data.deleted : {},
  };
}

export function reset() {
  localStorage.removeItem(KEY);
}
