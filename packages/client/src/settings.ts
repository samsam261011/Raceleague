/** Réglages du joueur, gardés dans le navigateur. Le jeu marche aussi sans stockage. */
export interface Settings {
  sound: 'on' | 'off';
  quality: 'high' | 'low';
  touch: 'auto' | 'show' | 'hide';
}

const KEY = 'raceleague.settings';
const DEFAULTS: Settings = { sound: 'on', quality: 'high', touch: 'auto' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* stockage indisponible */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Record d'un circuit : temps final et temps de passage aux checkpoints, en ms. */
export interface Best {
  time: number;
  splits: number[];
}

export function readBest(key: string): Best | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const b = JSON.parse(raw) as Best;
    return typeof b.time === 'number' ? b : null;
  } catch { return null; }
}

export function writeBest(key: string, value: Best): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
