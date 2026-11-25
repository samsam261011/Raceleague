import { KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_UP, type Keys } from '@raceleague/shared';

const KEYMAP: Record<string, Keys> = {
  ArrowUp: KEY_UP, KeyW: KEY_UP, KeyZ: KEY_UP,
  ArrowDown: KEY_DOWN, KeyS: KEY_DOWN,
  ArrowLeft: KEY_LEFT, KeyA: KEY_LEFT, KeyQ: KEY_LEFT,
  ArrowRight: KEY_RIGHT, KeyD: KEY_RIGHT,
};
const TOUCHMAP: Record<string, Keys> = { up: KEY_UP, down: KEY_DOWN, left: KEY_LEFT, right: KEY_RIGHT };

/**
 * Clavier + boutons tactiles. Les codes physiques (KeyW…) rendent ZQSD et WASD
 * utilisables sans réglage : sur un clavier AZERTY, Z et Q sont KeyW et KeyA.
 */
export class Input {
  private held = new Set<string>();
  private touch = 0;

  constructor(onRestart: () => void, onConfirm: () => void) {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' || e.code === 'Backspace') { e.preventDefault(); if (!e.repeat) onRestart(); return; }
      if (e.code === 'Enter') { if (!e.repeat) onConfirm(); return; }
      if (e.code in KEYMAP) { e.preventDefault(); this.held.add(e.code); }
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => { this.held.clear(); this.touch = 0; });

    for (const btn of document.querySelectorAll<HTMLButtonElement>('#touch [data-key]')) {
      const bit = TOUCHMAP[btn.dataset.key!]!;
      const on = (e: PointerEvent) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); this.touch |= bit; btn.classList.add('on'); };
      const off = () => { this.touch &= ~bit; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', off);
    }
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
    addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
  }

  /** Touches enfoncées, lues une fois par pas de simulation. */
  read(): Keys {
    let k = this.touch;
    for (const code of this.held) k |= KEYMAP[code]!;
    return k;
  }
}
