// All progress lives in the browser's localStorage on your phone.
// Use Export in Settings to keep a backup file.

const KEY = 'wordsv-v1';

const DEFAULT = {
  progress: {},          // wordId -> card (see srs.js)
  custom: [],            // words you added yourself
  settings: { dailyLimit: 50, level: 'all', autoSpeak: false },
  skipped: [],           // wordIds skipped in Learn (shown again later)
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT),
      ...data,
      settings: { ...DEFAULT.settings, ...(data.settings || {}) },
    };
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
