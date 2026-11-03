// All progress lives in the browser's localStorage on your phone.
// Use Export in Settings to keep a backup file.

const KEY = 'wordsv-v1';

const DEFAULT = {
  progress: {},          // wordId -> card (see srs.js)
  custom: [],            // words you added yourself
  // levels: which CEFR levels appear in Learn (null = not chosen yet -> show the level picker)
  settings: { dailyLimit: 50, level: 'all', autoSpeak: false, levels: null },
  skipped: [],           // wordIds skipped in Learn (shown again later)
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

export function exportFile(state) {
  const blob = new Blob([JSON.stringify({ app: 'WordSv', exported: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wordsv-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  };
}

export function reset() {
  localStorage.removeItem(KEY);
}
