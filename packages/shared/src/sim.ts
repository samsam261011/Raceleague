import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { compileTrack, headingQuat, type CompiledTrack, type Track } from './pieces.ts';
import { KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_UP, type Keys } from './input.ts';
import { fnv1a, hex } from './hash.ts';

/**
 * Règles de déterminisme (à respecter dans tout ce fichier) :
 * - pas de temps fixe, aucune horloge, aucun Math.random ;
 * - pas de Math.sin/cos/atan/exp/pow : leurs résultats peuvent varier d'un
 *   moteur JS à l'autre (Chrome, Safari, Node). Seuls + − × ÷ et sqrt sont sûrs ;
 * - toute la physique passe par la version déterministe de Rapier.
 * Changer le comportement de la voiture => incrémenter SIM_VERSION.
 */
export const SIM_VERSION = 4;
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Une run qui dure plus longtemps est arrêtée (5 minutes). */
export const MAX_TICKS = TICK_RATE * 300;

let ready: Promise<void> | null = null;
/** Charge le module WebAssembly de Rapier (à attendre une seule fois). */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

/** Réglages de la voiture. */
export const CAR = {
  halfExtents: [1.1, 0.3, 0.6] as const,
  mass: 150,
  /** Centre de gravité très bas : peu de roulis, la voiture reste à plat dans les virages. */
  centerOfMassY: -0.72,
  /** Inertie (roulis, lacet, tangage) d'une boîte de 150 kg. */
  inertia: { x: 22.5, y: 78.5, z: 65 },
  wheelRadius: 0.38,
  /** Position des roues dans le repère de la voiture : avant = +X, gauche = −Z. */
  wheelX: 0.8,
  wheelZ: 0.62,
  wheelY: -0.15,
  suspensionRest: 0.3,
  suspensionStiffness: 55,
  suspensionCompression: 6,
  suspensionRelaxation: 8,
  maxSuspensionForce: 100000,
  frictionSlip: 4,
  sideFrictionStiffness: 1.2,
  /** Force moteur à l'arrêt ; elle baisse quand la vitesse monte (accélération progressive). */
  engineForce: 900,
  engineFade: 0.75,
  reverseForce: 700,
  brakeForce: 14,
  /**
   * Braquage max à l'arrêt (rad). Il baisse comme 1 / (1 + v²/steerSpeed²) :
   * à haute vitesse, l'accélération latérale plafonne vers 2,5 g, la voiture
   * prend les virages sans pivoter sur place.
   */
  steerMax: 0.5,
  steerSpeed: 9,
  /** Vitesse de rotation du volant, en rad par pas. */
  steerRate: 0.04,
  /** Retour du volant au centre, plus rapide que le braquage. */
  steerReturn: 0.08,
  maxSpeed: 45,
  /**
   * Adhérence aux parois (virages relevés, murs roulables) : quand les roues
   * touchent une surface penchée et que la voiture va assez vite, elle est
   * plaquée contre la surface. Sans effet sur le plat.
   */
  stickMinSpeed: 12,
  stickAccel: 12,
  /** En dessous de ce cosinus de pente (≈ 25°), la surface compte comme une paroi. */
  stickMaxNormalY: 0.9,
  gravity: -20,
  /** Appui aérodynamique : accélération vers le bas ∝ vitesse², au sol seulement. */
  downforce: 0.006,
  /** En l'air : la voiture se remet doucement à plat (raideur, amortissement). */
  airLevel: 10,
  airDamp: 4,
} as const;

const FRONT_LEFT = 0, FRONT_RIGHT = 1;

export interface Pose {
  p: [number, number, number];
  q: [number, number, number, number];
}

export class Simulation {
  readonly track: Track;
  readonly compiled: CompiledTrack;
  tick = 0;
  /** Pas de la première touche : le chrono démarre là. Null tant qu'on n'a rien touché. */
  startTick: number | null = null;
  /** Pas de l'arrivée (compté depuis le début de la simulation), sinon null. */
  finishTick: number | null = null;
  /** Temps de passage à chaque checkpoint, en pas depuis le départ du chrono. */
  splits: number[] = [];
  /** Nombre de chutes (retour au dernier checkpoint). */
  respawns = 0;

  private world: RAPIER.World;
  private body: RAPIER.RigidBody;
  private vehicle: RAPIER.DynamicRayCastVehicleController;
  private steer = 0;
  private nextGate = 0;

  constructor(track: Track) {
    this.track = track;
    const c = (this.compiled = compileTrack(track));
    const world = new RAPIER.World({ x: 0, y: CAR.gravity, z: 0 });
    world.timestep = DT;
    this.world = world;

    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        c.vertices, c.indices,
        RAPIER.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES,
      ).setFriction(1),
    );

    const [sx, sy, sz] = c.start.p;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(sx, sy, sz)
        .setRotation(headingQuat(c.start.r))
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(1.5),
    );
    const [hx, hy, hz] = CAR.halfExtents;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(0.3)
        // Centre de gravité bas : la voiture ne se retourne pas dans les virages.
        .setMassProperties(CAR.mass, { x: 0, y: CAR.centerOfMassY, z: 0 }, CAR.inertia, { x: 0, y: 0, z: 0, w: 1 }),
      this.body,
    );

    const v = world.createVehicleController(this.body);
    v.indexUpAxis = 1;
    v.setIndexForwardAxis = 0;
    for (const [x, z] of [
      [CAR.wheelX, -CAR.wheelZ], [CAR.wheelX, CAR.wheelZ],
      [-CAR.wheelX, -CAR.wheelZ], [-CAR.wheelX, CAR.wheelZ],
    ] as const) {
      v.addWheel({ x, y: CAR.wheelY, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, CAR.suspensionRest, CAR.wheelRadius);
    }
    for (let i = 0; i < 4; i++) {
      v.setWheelSuspensionStiffness(i, CAR.suspensionStiffness);
      v.setWheelSuspensionCompression(i, CAR.suspensionCompression);
      v.setWheelSuspensionRelaxation(i, CAR.suspensionRelaxation);
      v.setWheelMaxSuspensionForce(i, CAR.maxSuspensionForce);
      v.setWheelFrictionSlip(i, CAR.frictionSlip);
      v.setWheelSideFrictionStiffness(i, CAR.sideFrictionStiffness);
    }
    this.vehicle = v;
  }

  get done(): boolean {
    return this.finishTick !== null || this.tick >= MAX_TICKS;
  }

  /** Nombre de checkpoints franchis (l'arrivée n'en fait pas partie). */
  get checkpoint(): number {
    return this.nextGate;
  }

  /** Temps de course en pas (0 tant que le chrono n'a pas démarré). */
  get raceTicks(): number {
    if (this.startTick === null) return 0;
    return (this.finishTick ?? this.tick) - this.startTick;
  }

  /** Temps final en pas, ou null si la course n'est pas finie. */
  get finalTicks(): number | null {
    return this.finishTick === null || this.startTick === null ? null : this.finishTick - this.startTick;
  }

  /** Vitesse vers l'avant, en m/s. */
  get speed(): number {
    return this.vehicle.currentVehicleSpeed();
  }

  /** Avance la simulation d'un pas de 1/60 s avec les touches données. */
  step(keys: Keys): void {
    if (this.done) return;
    if (this.startTick === null && keys !== 0) this.startTick = this.tick;
    const v = this.vehicle;
    const speed = v.currentVehicleSpeed();
    const up = (keys & KEY_UP) !== 0;
    const down = (keys & KEY_DOWN) !== 0;
    const left = (keys & KEY_LEFT) !== 0;
    const right = (keys & KEY_RIGHT) !== 0;

    let engine = 0;
    let brake = 0;
    if (up && !down) engine = speed < CAR.maxSpeed ? CAR.engineForce * (1 - (CAR.engineFade * (speed > 0 ? speed : 0)) / CAR.maxSpeed) : 0;
    else if (down && !up) {
      if (speed > 1) brake = CAR.brakeForce;
      else engine = -CAR.reverseForce;
    } else if (!up && !down) brake = 2; // frein moteur léger

    // Braquage progressif, réduit avec la vitesse (uniquement + − × ÷).
    const absSpeed = speed < 0 ? -speed : speed;
    const maxSteer = CAR.steerMax / (1 + (absSpeed * absSpeed) / (CAR.steerSpeed * CAR.steerSpeed));
    const target = left === right ? 0 : left ? maxSteer : -maxSteer;
    const rate = target === 0 || (target > 0) !== (this.steer > 0) ? CAR.steerReturn : CAR.steerRate;
    if (this.steer < target) this.steer = Math.min(target, this.steer + rate);
    else if (this.steer > target) this.steer = Math.max(target, this.steer - rate);

    v.setWheelSteering(FRONT_LEFT, this.steer);
    v.setWheelSteering(FRONT_RIGHT, this.steer);
    for (let i = 2; i < 4; i++) v.setWheelEngineForce(i, engine);
    for (let i = 0; i < 4; i++) v.setWheelBrake(i, brake);

    v.updateVehicle(DT);
    this.stick(absSpeed);
    this.aero(absSpeed);
    this.world.step();
    this.tick++;

    const p = this.body.translation();
    if (p.y < this.compiled.fallY) {
      this.respawn();
      return;
    }
    const gates = this.compiled.gates;
    const g = gates[this.nextGate];
    if (
      g &&
      this.startTick !== null &&
      Math.abs(p.x - g.center[0]) <= g.half[0] &&
      Math.abs(p.y - g.center[1]) <= g.half[1] &&
      Math.abs(p.z - g.center[2]) <= g.half[2]
    ) {
      if (this.nextGate === gates.length - 1) this.finishTick = this.tick;
      else this.splits.push(this.tick - this.startTick);
      this.nextGate++;
    }
  }

  /** Plaque la voiture contre une paroi penchée quand elle va assez vite. */
  private stick(absSpeed: number): void {
    if (absSpeed < CAR.stickMinSpeed) return;
    let nx = 0, ny = 0, nz = 0, count = 0;
    for (let i = 0; i < 4; i++) {
      if (!this.vehicle.wheelIsInContact(i)) continue;
      const n = this.vehicle.wheelContactNormal(i);
      if (!n) continue;
      nx += n.x; ny += n.y; nz += n.z; count++;
    }
    if (count < 2) return;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len === 0) return;
    nx /= len; ny /= len; nz /= len;
    if (ny > CAR.stickMaxNormalY) return;
    const k = -CAR.mass * CAR.stickAccel * DT;
    this.body.applyImpulse({ x: nx * k, y: ny * k, z: nz * k }, true);
  }

  /** Appui au sol, et remise à plat douce en l'air (uniquement + − × ÷). */
  private aero(absSpeed: number): void {
    let contacts = 0;
    for (let i = 0; i < 4; i++) if (this.vehicle.wheelIsInContact(i)) contacts++;
    const r = this.body.rotation();
    // Axe « haut » de la voiture
    const ux = 2 * (r.x * r.y - r.w * r.z);
    const uy = 1 - 2 * (r.x * r.x + r.z * r.z);
    const uz = 2 * (r.y * r.z + r.w * r.x);
    if (contacts > 0) {
      const k = -CAR.mass * CAR.downforce * absSpeed * absSpeed * DT;
      this.body.applyImpulse({ x: ux * k, y: uy * k, z: uz * k }, true);
      return;
    }
    // Couple qui ramène l'axe haut vers la verticale : haut × Y = (−uz, 0, ux)
    const a = this.body.angvel();
    const k = CAR.airLevel * DT, d = CAR.airDamp * DT;
    const I = CAR.inertia;
    this.body.applyTorqueImpulse({
      x: (-uz * k - a.x * d) * I.x,
      y: 0,
      z: (ux * k - a.z * d) * I.z,
    }, true);
  }

  /** Après une chute : retour au dernier checkpoint franchi, à l'arrêt. Le chrono continue. */
  private respawn(): void {
    this.respawns++;
    const c = this.compiled;
    let p: [number, number, number], r: number;
    if (this.nextGate === 0) {
      p = c.start.p; r = c.start.r;
    } else {
      const g = c.gates[this.nextGate - 1]!;
      p = [g.center[0], g.center[1] - 2 + 0.8, g.center[2]]; r = g.r;
    }
    this.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    this.body.setRotation(headingQuat(r), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
  }

  chassisPose(): Pose {
    const t = this.body.translation();
    const r = this.body.rotation();
    return { p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] };
  }

  /** Position et rotation de roue i dans le repère de la voiture (pour l'affichage). */
  wheelState(i: number): { suspension: number; steering: number; rotation: number } {
    const v = this.vehicle;
    return {
      suspension: v.wheelSuspensionLength(i) ?? CAR.suspensionRest,
      steering: v.wheelSteering(i) ?? 0,
      rotation: v.wheelRotation(i) ?? 0,
    };
  }

  /** Empreinte de l'état physique complet de la voiture, bit à bit. */
  stateHash(): string {
    const t = this.body.translation();
    const r = this.body.rotation();
    const l = this.body.linvel();
    const a = this.body.angvel();
    const f = new Float32Array([t.x, t.y, t.z, r.x, r.y, r.z, r.w, l.x, l.y, l.z, a.x, a.y, a.z, this.steer]);
    const i = new Int32Array([this.tick, this.startTick ?? -1, this.finishTick ?? -1, this.respawns, this.nextGate]);
    return hex(fnv1a(new Uint8Array(i.buffer), fnv1a(new Uint8Array(f.buffer))));
  }

  dispose(): void {
    this.world.free();
  }
}
