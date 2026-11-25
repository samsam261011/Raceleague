import { COS, SIN, SQRT_HALF } from './trig.ts';

/**
 * Pièces modulaires et assemblage des circuits.
 *
 * Un circuit est une chaîne de pièces : chaque pièce commence là où la
 * précédente s'arrête. Les pièces sont posées sur une grille de 40 m et
 * tournent uniquement par quarts de tour, ce qui garde toute la géométrie
 * exacte (pas de Math.sin/cos : on utilise les tables de trig.ts).
 *
 * Repère local d'une pièce : on entre en (0, 0, 0) en roulant vers +X,
 * la gauche est −Z, le haut +Y.
 */

export const CELL = 40;
/** Demi-largeur de la chaussée (hors vibreurs), en mètres. */
export const ROAD_HALF = 10;
export const KERB = 1.5;
const LINE = 0.4;
const BARRIER_H = 1.2;
/** Rayon et hauteur du mur roulable. */
const RIDE_R = 9;
const RIDE_TOP = 4;
/** Tremplin et saut : hauteur de la lèvre, longueur du vide, réception. */
const KICK = 0.6;
const GAP_VOID = 8;
const GAP_TOP = -1.2;
const GAP_DROP = 3;

export type PieceType =
  | 'start' | 'straight' | 'checkpoint' | 'finish'
  | 'turnL' | 'turnR' | 'sweepL' | 'sweepR'
  | 'chicaneL' | 'chicaneR' | 'hairpinL' | 'hairpinR'
  | 'slopeUp' | 'slopeDown' | 'kicker' | 'gap';

export interface Piece {
  t: PieceType;
  /** Rambarde basse sur le bord gauche, droit ou les deux. */
  barrier?: 'left' | 'right' | 'both';
  /** Virage relevé (sweep uniquement). */
  bank?: boolean;
  /** Mur roulable à l'extérieur du virage (sweep uniquement). */
  ride?: boolean;
}

export interface Track {
  id: string;
  name: string;
  pieces: Piece[];
}

/** Matériaux, pour le rendu. Seule la physique décide de ce qui est solide. */
export type Mat = 'road' | 'line' | 'kerb' | 'barrier' | 'ride' | 'rock';

interface Sample {
  x: number; y: number; z: number;
  /** Direction horizontale unitaire de la route. */
  fx: number; fz: number;
}

interface PieceShape {
  samples: Sample[];
  exit: { x: number; y: number; z: number; dr: number };
  /** Côté extérieur du virage : +1 = gauche, −1 = droite, 0 = tout droit. */
  outer: 0 | 1 | -1;
  /** Seules les pièces droites peuvent porter une porte (départ, checkpoint, arrivée). */
  straight: boolean;
}

/** Gauche = +1 (repère local −Z). Pour les pièces « R », on retourne la pièce « L » en miroir. */
function mirror(s: PieceShape): PieceShape {
  return {
    samples: s.samples.map((p) => ({ x: p.x, y: p.y, z: -p.z, fx: p.fx, fz: -p.fz })),
    exit: { x: s.exit.x, y: s.exit.y, z: -s.exit.z, dr: (4 - s.exit.dr) % 4 },
    outer: (s.outer === 0 ? 0 : -s.outer) as 0 | 1 | -1,
    straight: s.straight,
  };
}

function line(length: number, steps: number, height: (t: number) => number): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ x: length * t, y: height(t), z: 0, fx: 1, fz: 0 });
  }
  return out;
}

/** Arc de cercle vers la gauche, de l'angle a0 à a1 (index de la table, pas de 7,5°). */
function arcLeft(cx: number, cz: number, r: number, i0: number, i1: number, step: number): Sample[] {
  const out: Sample[] = [];
  for (let i = i0; i <= i1; i += step) {
    out.push({ x: cx + r * SIN[i]!, y: 0, z: cz + r * COS[i]!, fx: COS[i]!, fz: -SIN[i]! });
  }
  return out;
}

function shapeOf(t: PieceType): PieceShape {
  switch (t) {
    case 'start': case 'straight': case 'checkpoint': case 'finish':
      return { samples: line(CELL, 10, () => 0), exit: { x: CELL, y: 0, z: 0, dr: 0 }, outer: 0, straight: true };
    case 'slopeUp':
      // Sur deux cases : assez douce pour ne pas décoller en haut à pleine vitesse
      return { samples: line(2 * CELL, 16, (u) => 6 * u * u * (3 - 2 * u)), exit: { x: 2 * CELL, y: 6, z: 0, dr: 0 }, outer: 0, straight: true };
    case 'slopeDown':
      return { samples: line(2 * CELL, 16, (u) => -6 * u * u * (3 - 2 * u)), exit: { x: 2 * CELL, y: -6, z: 0, dr: 0 }, outer: 0, straight: true };
    case 'kicker':
      // Petit tremplin doux : plat sur la première moitié, lèvre de KICK m (pente de sortie ≈ 3,5°)
      return {
        samples: line(CELL, 12, (u) => (u <= 0.5 ? 0 : KICK * (2 * u - 1) * (2 * u - 1))),
        exit: { x: CELL, y: KICK, z: 0, dr: 0 }, outer: 0, straight: true,
      };
    case 'gap': {
      // Trou de GAP_VOID m, puis piste de réception en descente : on atterrit
      // en glissant le long de la pente plutôt qu'en tapant à plat.
      const s: Sample[] = [];
      const L = CELL - GAP_VOID;
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        s.push({ x: GAP_VOID + L * u, y: GAP_TOP - GAP_DROP * (1 - (1 - u) * (1 - u)), z: 0, fx: 1, fz: 0 });
      }
      return { samples: s, exit: { x: CELL, y: GAP_TOP - GAP_DROP, z: 0, dr: 0 }, outer: 0, straight: true };
    }
    case 'turnL':
      // Rayon 20 m : on sort au milieu du bord gauche de la case
      return { samples: arcLeft(0, -20, 20, 0, 12, 1), exit: { x: 20, y: 0, z: -20, dr: 1 }, outer: -1, straight: false };
    case 'sweepL':
      // Grand virage de rayon 60 m sur 2 × 2 cases
      return { samples: arcLeft(0, -60, 60, 0, 12, 1), exit: { x: 60, y: 0, z: -60, dr: 1 }, outer: -1, straight: false };
    case 'hairpinL': {
      // 20 m tout droit, demi-tour de rayon 20 m, 20 m tout droit dans l'autre sens
      const s: Sample[] = [{ x: 0, y: 0, z: 0, fx: 1, fz: 0 }];
      s.push(...arcLeft(20, -20, 20, 0, 24, 1));
      s.push({ x: 0, y: 0, z: -40, fx: -1, fz: 0 });
      return { samples: s, exit: { x: 0, y: 0, z: -40, dr: 2 }, outer: -1, straight: false };
    }
    case 'chicaneL': {
      // Décalage de 10 m vers la gauche puis retour dans l'axe, sur 80 m
      const A = 10, L = 2 * CELL, K = (Math.PI * A) / L;
      const s: Sample[] = [];
      for (let i = 0; i <= 48; i += 2) {
        const dz = -K * SIN[i]!;
        const n = Math.sqrt(1 + dz * dz);
        s.push({ x: (L * i) / 48, y: 0, z: (-A * (1 - COS[i]!)) / 2, fx: 1 / n, fz: dz / n });
      }
      return { samples: s, exit: { x: L, y: 0, z: 0, dr: 0 }, outer: 0, straight: false };
    }
    case 'turnR': return mirror(shapeOf('turnL'));
    case 'sweepR': return mirror(shapeOf('sweepL'));
    case 'hairpinR': return mirror(shapeOf('hairpinL'));
    case 'chicaneR': return mirror(shapeOf('chicaneL'));
  }
}

/** Point du profil en travers : u vers la gauche, v vers le haut. */
interface ProfilePoint { u: number; v: number }

/**
 * Profil en travers de la route pour l'échantillon i sur n.
 * Renvoie les points et le matériau de chaque segment entre deux points.
 */
function profile(piece: Piece, shape: PieceShape, i: number, n: number): { pts: ProfilePoint[]; mats: Mat[]; edgeL: number; edgeR: number } {
  const E = ROAD_HALF + KERB;
  const left = piece.barrier === 'left' || piece.barrier === 'both';
  const right = piece.barrier === 'right' || piece.barrier === 'both';
  // Montée progressive (lissée) du mur roulable et du dévers en entrée et sortie de virage
  const t = Math.min(i, n - i, 4) / 4;
  const ramp = 0.1 + 0.9 * t * t * (3 - 2 * t);
  const rideL = piece.ride && shape.outer === 1;
  const rideR = piece.ride && shape.outer === -1;

  const pts: ProfilePoint[] = [];
  const mats: Mat[] = [];
  const push = (u: number, v: number, m?: Mat) => { if (m) mats.push(m); pts.push({ u, v }); };

  if (rideL) {
    for (let k = 12; k > 0; k -= 2) push(E + RIDE_R * SIN[k]!, ramp * (RIDE_R - RIDE_R * COS[k]!));
    pts.unshift({ u: E + RIDE_R, v: ramp * (RIDE_R + RIDE_TOP) });
    for (let k = 0; k < pts.length - 1; k++) mats.push('ride');
  } else if (left) {
    push(E, BARRIER_H);
  }
  push(E, 0, pts.length ? (rideL ? 'ride' : 'barrier') : undefined);
  const edgeL = pts.length - 1;
  push(ROAD_HALF, 0, 'kerb');
  push(ROAD_HALF - LINE, 0, 'line');
  push(-ROAD_HALF + LINE, 0, 'road');
  push(-ROAD_HALF, 0, 'line');
  push(-E, 0, 'kerb');
  const edgeR = pts.length - 1;
  if (rideR) {
    for (let k = 2; k <= 12; k += 2) push(-E - RIDE_R * SIN[k]!, ramp * (RIDE_R - RIDE_R * COS[k]!), 'ride');
    push(-E - RIDE_R, ramp * (RIDE_R + RIDE_TOP), 'ride');
  } else if (right) {
    push(-E, BARRIER_H, 'barrier');
  }

  // Dévers : on penche le profil autour de l'axe, extérieur vers le haut (jusqu'à 15°)
  if (piece.bank && shape.outer !== 0) {
    // Angle de 0 à 15° (2 crans de la table), interpolé puis renormalisé
    const f = 2 * t * t * (3 - 2 * t);
    const k = f >= 2 ? 1 : Math.floor(f), w = f - k;
    let c = COS[k]! * (1 - w) + COS[k + 1]! * w, s = SIN[k]! * (1 - w) + SIN[k + 1]! * w;
    const len = Math.sqrt(c * c + s * s);
    c /= len; s = (s / len) * shape.outer; // outer = −1 : la droite monte
    for (const p of pts) {
      const u = p.u, v = p.v;
      p.u = u * c - v * s;
      p.v = v * c + u * s;
    }
  }
  return { pts, mats, edgeL, edgeR };
}

/** Porte (départ, checkpoint ou arrivée) : boîte alignée sur les axes du monde. */
export interface Gate {
  center: [number, number, number];
  half: [number, number, number];
  /** Cap de la voiture au passage (quart de tour 0–3), pour la réapparition. */
  r: number;
}

export interface RenderStrip {
  mat: Mat;
  /** Quadrilatères : 4 sommets (x, y, z) à la suite chacun. */
  quads: number[];
  /** Indice de bande le long de la route (pour alterner les couleurs des vibreurs). */
  stripe: number[];
}

export interface CompiledTrack {
  track: Track;
  /** Surface solide : sommets et triangles, pour Rapier. */
  vertices: Float32Array;
  indices: Uint32Array;
  /** Quadrilatères de rendu par matériau. */
  render: RenderStrip[];
  start: { p: [number, number, number]; r: number };
  /** Checkpoints dans l'ordre ; la dernière porte est l'arrivée. */
  gates: Gate[];
  /** Ligne centrale (x, y, z), pour le pilote de test et la miniature du menu. */
  centerline: [number, number, number][];
  /** En dessous, la voiture est tombée. */
  fallY: number;
}

/** Tourne un vecteur horizontal d'un nombre de quarts de tour vers la gauche. */
function rot(x: number, z: number, r: number): [number, number] {
  switch (r & 3) {
    case 0: return [x, z];
    case 1: return [z, -x];
    case 2: return [-x, -z];
    default: return [-z, x];
  }
}

/** Quaternion d'une voiture tournée de r quarts de tour (autour de +Y). */
export function headingQuat(r: number): { x: number; y: number; z: number; w: number } {
  switch (r & 3) {
    case 0: return { x: 0, y: 0, z: 0, w: 1 };
    case 1: return { x: 0, y: SQRT_HALF, z: 0, w: SQRT_HALF };
    case 2: return { x: 0, y: 1, z: 0, w: 0 };
    default: return { x: 0, y: -SQRT_HALF, z: 0, w: SQRT_HALF };
  }
}

const cache = new WeakMap<Track, CompiledTrack>();

/** Assemble les pièces en une géométrie unique (résultat mis en cache). */
export function compileTrack(track: Track): CompiledTrack {
  const hit = cache.get(track);
  if (hit) return hit;

  const verts: number[] = [];
  const idx: number[] = [];
  const strips = new Map<Mat, RenderStrip>();
  const strip = (m: Mat) => {
    let s = strips.get(m);
    if (!s) strips.set(m, (s = { mat: m, quads: [], stripe: [] }));
    return s;
  };
  const gates: Gate[] = [];
  const centerline: [number, number, number][] = [];
  let start: CompiledTrack['start'] | null = null;
  let ox = 0, oy = 0, oz = 0, r = 0;
  let minY = 0;
  let stripe = 0;

  for (const piece of track.pieces) {
    const shape = shapeOf(piece.t);
    const n = shape.samples.length - 1;
    const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => {
      const [wx, wz] = rot(lx, lz, r);
      return [ox + wx, oy + ly, oz + wz];
    };

    if (n > 0) {
      // Grille de sommets : échantillons × points du profil
      const grid: [number, number, number][][] = [];
      let mats: Mat[] = [];
      let edges: [number, number] = [0, 0];
      for (let i = 0; i <= n; i++) {
        const s = shape.samples[i]!;
        const pr = profile(piece, shape, i, n);
        mats = pr.mats;
        edges = [pr.edgeL, pr.edgeR];
        // Vecteur gauche dans le repère local : (fz, −fx)
        const lx = s.fz, lz = -s.fx;
        grid.push(pr.pts.map((p) => toWorld(s.x + lx * p.u, s.y + p.v, s.z + lz * p.u)));
        const c = toWorld(s.x, s.y, s.z);
        if (i > 0 || centerline.length === 0) centerline.push(c);
        if (c[1] < minY) minY = c[1];
      }
      const base = verts.length / 3;
      const cols = grid[0]!.length;
      for (const row of grid) for (const v of row) verts.push(v[0], v[1], v[2]);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < cols - 1; k++) {
          const a = base + i * cols + k, b = a + 1, c = a + cols, d = c + 1;
          idx.push(a, c, b, b, c, d);
          const q = strip(mats[k]!);
          for (const v of [grid[i]![k]!, grid[i]![k + 1]!, grid[i + 1]![k + 1]!, grid[i + 1]![k]!]) q.quads.push(v[0], v[1], v[2]);
          q.stripe.push(stripe + i);
        }
        // Flanc rocheux sous les bords (rendu seulement)
        const rock = strip('rock');
        for (const side of edges) {
          const p0 = grid[i]![side]!, p1 = grid[i + 1]![side]!;
          const y0 = Math.min(p0[1], p1[1]);
          rock.quads.push(p0[0], y0, p0[2], p1[0], y0, p1[2], p1[0], y0 - 6, p1[2], p0[0], y0 - 6, p0[2]);
          rock.stripe.push(0);
        }
      }
      stripe += n;
    }

    // Portes au milieu des pièces droites
    if (shape.straight && (piece.t === 'start' || piece.t === 'checkpoint' || piece.t === 'finish')) {
      const mid = toWorld(CELL / 2, 0, 0);
      const along = 1.5, across = ROAD_HALF + KERB + 1;
      const odd = (r & 1) === 1;
      const gate: Gate = { center: [mid[0], mid[1] + 2, mid[2]], half: [odd ? across : along, 4, odd ? along : across], r };
      if (piece.t === 'start') start = { p: [mid[0], mid[1] + 0.8, mid[2]], r };
      else gates.push(gate);
    }

    const [ex, ez] = rot(shape.exit.x, shape.exit.z, r);
    ox += ex; oy += shape.exit.y; oz += ez;
    r = (r + shape.exit.dr) & 3;
  }

  if (!start) throw new Error(`Circuit ${track.id} : il manque une pièce de départ`);
  if (track.pieces.at(-1)?.t !== 'finish') throw new Error(`Circuit ${track.id} : la dernière pièce doit être l'arrivée`);

  const compiled: CompiledTrack = {
    track,
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    render: [...strips.values()],
    start,
    gates,
    centerline,
    fallY: minY - 15,
  };
  cache.set(track, compiled);
  return compiled;
}
