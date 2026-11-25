import { fnv1aString, hex } from './hash.ts';

/** Boîte alignée sur les axes : centre et demi-dimensions, en mètres. */
export interface Box {
  center: [number, number, number];
  half: [number, number, number];
}

export interface TrackBlock extends Box {
  kind: 'road' | 'wall';
}

/**
 * Un circuit est un simple fichier de données. Pour la semaine 1 il n'y a que
 * des boîtes ; les pièces modulaires (virages, murs roulables…) arrivent en semaine 2.
 */
export interface Track {
  id: string;
  name: string;
  /** Position de départ du centre de la voiture. La voiture regarde vers +X. */
  start: [number, number, number];
  blocks: TrackBlock[];
  /** Zone d'arrivée : la course est finie quand le centre de la voiture y entre. */
  finish: Box;
}

/** Empreinte du contenu du circuit, écrite dans chaque replay. */
export function trackHash(track: Track): string {
  return hex(fnv1aString(JSON.stringify(track)));
}

const road = (cx: number, cz: number, hx: number, hz: number): TrackBlock => ({
  kind: 'road',
  center: [cx, -0.5, cz],
  half: [hx, 0.5, hz],
});
const wall = (cx: number, cz: number, hx: number, hz: number, h = 1): TrackBlock => ({
  kind: 'wall',
  center: [cx, h, cz],
  half: [hx, h, hz],
});

/**
 * Circuit de test : une ligne droite, une chicane, un virage à droite à 90°
 * puis une seconde ligne droite jusqu'à l'arrivée.
 */
export const TEST_TRACK: Track = {
  id: 'test-01',
  name: 'Circuit de test',
  start: [0, 1, 0],
  blocks: [
    // Ligne droite principale (le long de +X)
    road(70, 0, 80, 10),
    // Virage et seconde ligne droite (le long de +Z)
    road(140, 70, 10, 80),
    // Chicane
    wall(60, 5, 2, 5),
    wall(95, -5, 2, 5),
    // Murs extérieurs
    wall(70, -10.5, 80, 0.5),
    wall(60, 10.5, 70, 0.5),
    wall(150.5, 65, 0.5, 75),
    wall(129.5, 80, 0.5, 70),
    wall(-10.5, 0, 0.5, 10),
  ],
  finish: { center: [140, 2, 135], half: [10, 3, 3] },
};
