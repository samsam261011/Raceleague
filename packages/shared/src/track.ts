import { fnv1aString, hex } from './hash.ts';
import type { Track } from './pieces.ts';


/** Empreinte du contenu du circuit, écrite dans chaque replay. */
export function trackHash(track: Track): string {
  return hex(fnv1aString(JSON.stringify(track)));
}
