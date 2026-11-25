import { compileTrack, formatTime, type Track } from '@raceleague/shared';
import type { Settings } from './settings.ts';

export interface TrackEntry {
  track: Track | null;
  name: string;
  best: number | null;
}

export interface MenuHandlers {
  onPlay(): void;
  onPickTrack(track: Track): void;
  onSettings(s: Settings): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
type Screen = 'main' | 'tracks' | 'options';

/** Menu principal, choix du circuit et options. */
export class Menu {
  private screen: Screen = 'main';
  open = false;

  constructor(private h: MenuHandlers, private settings: Settings, private listTracks: () => TrackEntry[]) {
    $('btn-play').addEventListener('click', () => h.onPlay());
    $('btn-tracks').addEventListener('click', () => this.show('tracks'));
    $('btn-options').addEventListener('click', () => this.show('options'));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-back]')) {
      b.addEventListener('click', () => this.show('main'));
    }
    for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-option]')) {
      const key = seg.dataset.option as keyof Settings;
      for (const btn of seg.querySelectorAll<HTMLButtonElement>('button')) {
        btn.addEventListener('click', () => {
          (this.settings as unknown as Record<string, string>)[key] = btn.dataset.value!;
          this.renderOptions();
          h.onSettings(this.settings);
        });
      }
    }
    this.renderOptions();
  }

  /** Échap : revient à l'écran principal, ou ferme le menu. */
  back(): boolean {
    if (this.open && this.screen !== 'main') { this.show('main'); return true; }
    return false;
  }

  setOpen(open: boolean): void {
    this.open = open;
    $('menu').hidden = !open;
    document.body.classList.toggle('in-menu', open);
    if (open) this.show('main');
  }

  private show(screen: Screen): void {
    this.screen = screen;
    $('screen-main').hidden = screen !== 'main';
    $('screen-tracks').hidden = screen !== 'tracks';
    $('screen-options').hidden = screen !== 'options';
    if (screen === 'tracks') this.renderTracks();
    const first = document.querySelector<HTMLButtonElement>(`#screen-${screen} button:not([disabled])`);
    first?.focus({ preventScroll: true });
  }

  private renderOptions(): void {
    for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-option]')) {
      const value = (this.settings as unknown as Record<string, string>)[seg.dataset.option!];
      for (const btn of seg.querySelectorAll<HTMLButtonElement>('button')) btn.classList.toggle('on', btn.dataset.value === value);
    }
  }

  private renderTracks(): void {
    const grid = $('track-grid');
    grid.replaceChildren();
    for (const entry of this.listTracks()) {
      const card = document.createElement('button');
      card.className = 'track-card';
      card.disabled = !entry.track;
      card.innerHTML = `
        <div class="preview">${entry.track ? trackSvg(entry.track) : ''}</div>
        <div class="name"></div>
        <div class="stats"><span class="best"></span><span class="medal" title="Médailles bronze, argent, or et Auteur"><i></i><i></i><i></i><i></i></span></div>`;
      card.querySelector('.name')!.textContent = entry.name;
      card.querySelector('.best')!.textContent = !entry.track ? 'Bientôt' : entry.best ? `Record ${formatTime(entry.best)}` : 'Pas encore de temps';
      if (entry.track) card.addEventListener('click', () => this.h.onPickTrack(entry.track!));
      grid.append(card);
    }
  }
}

/** Petit plan du circuit vu de dessus, dessiné à partir de sa ligne centrale. */
function trackSvg(track: Track): string {
  const line = compileTrack(track).centerline;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of line) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const pad = 10;
  const pts = line.map((p) => `${p[0].toFixed(1)},${p[2].toFixed(1)}`).join(' ');
  const end = line[line.length - 1]!;
  return `<svg viewBox="${minX - pad} ${minZ - pad} ${maxX - minX + 2 * pad} ${maxZ - minZ + 2 * pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="#3b3433" stroke-width="14" stroke-linejoin="round"/>
    <polyline points="${pts}" fill="none" stroke="#fff6ec" stroke-width="2" stroke-dasharray="6 6"/>
    <circle cx="${line[0]![0]}" cy="${line[0]![2]}" r="6" fill="#ff7a2f"/>
    <circle cx="${end[0]}" cy="${end[2]}" r="6" fill="#fff6ec"/>
  </svg>`;
}
