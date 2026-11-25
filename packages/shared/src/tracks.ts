import type { Piece, Track } from './pieces.ts';

const S: Piece = { t: 'straight' };
const B = (t: Piece['t'], barrier: Piece['barrier']): Piece => ({ t, barrier });

/** Circuit de test : ligne droite, chicane, virage, montée, arrivée. */
export const TEST_TRACK: Track = {
  id: 'test-02',
  name: 'Circuit de test',
  pieces: [
    { t: 'start' }, S, S, { t: 'chicaneL' }, S, { t: 'checkpoint' },
    B('turnR', 'left'), S, { t: 'slopeUp' }, S, { t: 'finish' },
  ],
};

/** 1 · Facile : longues lignes droites et grands virages, rambardes partout. */
export const MESA: Track = {
  id: 'mesa-01',
  name: 'Mesa',
  pieces: [
    { t: 'start', barrier: 'both' }, B('straight', 'both'), B('straight', 'both'),
    { t: 'sweepR', barrier: 'left' }, B('straight', 'both'), { t: 'checkpoint', barrier: 'both' },
    { t: 'sweepR', barrier: 'left', bank: true }, B('straight', 'both'), B('turnL', 'both'),
    B('straight', 'both'), B('slopeDown', 'both'), B('straight', 'both'), { t: 'finish', barrier: 'both' },
  ],
};

/** 2 · Moyen : épingle, chicane et un saut au-dessus du vide. */
export const EPINGLE: Track = {
  id: 'epingle-01',
  name: 'Épingle',
  pieces: [
    { t: 'start' }, S, { t: 'chicaneR' }, S, B('hairpinL', 'right'), S, { t: 'checkpoint' },
    { t: 'kicker' }, { t: 'gap' }, S, S, B('turnR', 'left'), { t: 'checkpoint' },
    { t: 'chicaneL' }, B('sweepL', 'right'), S, { t: 'finish' },
  ],
};

/** 3 · Difficile : virages relevés, mur roulable, dénivelé. */
export const FALAISE: Track = {
  id: 'falaise-01',
  name: 'Falaise',
  pieces: [
    { t: 'start' }, S, { t: 'slopeUp' }, { t: 'sweepL', ride: true }, S, { t: 'checkpoint' },
    { t: 'sweepR', bank: true }, { t: 'slopeDown' }, { t: 'chicaneR' }, { t: 'checkpoint' },
    { t: 'sweepR', ride: true }, { t: 'kicker' }, { t: 'gap' }, S,
    B('turnL', 'right'), S, S, { t: 'finish' },
  ],
};

export const TRACKS: Track[] = [MESA, EPINGLE, FALAISE];

/** Tous les circuits connus, y compris celui de test, par identifiant. */
export function trackById(id: string): Track | undefined {
  return [TEST_TRACK, ...TRACKS].find((t) => t.id === id);
}
