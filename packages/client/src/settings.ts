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

export function readNumber(key: string): number | null {
  try { return Number(localStorage.getItem(key)) || null; } catch { return null; }
}

export function writeNumber(key: string, value: number): void {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}
