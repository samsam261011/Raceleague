import { formatTime, type Track } from '@raceleague/shared';
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

/** Petit plan du circuit vu de dessus, dessiné à partir de ses blocs de route. */
function trackSvg(track: Track): string {
  const roads = track.blocks.filter((b) => b.kind === 'road');
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of roads) {
    minX = Math.min(minX, b.center[0] - b.half[0]); maxX = Math.max(maxX, b.center[0] + b.half[0]);
    minZ = Math.min(minZ, b.center[2] - b.half[2]); maxZ = Math.max(maxZ, b.center[2] + b.half[2]);
  }
  const rects = roads.map((b) =>
    `<rect x="${b.center[0] - b.half[0]}" y="${b.center[2] - b.half[2]}" width="${b.half[0] * 2}" height="${b.half[2] * 2}" fill="#3b3433"/>`).join('');
  const f = track.finish;
  const finish = `<rect x="${f.center[0] - f.half[0]}" y="${f.center[2] - f.half[2]}" width="${f.half[0] * 2}" height="${f.half[2] * 2}" fill="#fff6ec"/>`;
  return `<svg viewBox="${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${rects}${finish}</svg>`;
}
