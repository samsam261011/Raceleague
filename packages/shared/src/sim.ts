import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { Track } from './track.ts';
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
export const SIM_VERSION = 2;
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

/** Réglages de la voiture (à affiner en semaine 2). */
export const CAR = {
  halfExtents: [1.1, 0.3, 0.6] as const,
  mass: 150,
  centerOfMassY: -0.45,
  /** Inertie (roulis, lacet, tangage) d'une boîte de 150 kg. */
  inertia: { x: 22.5, y: 78.5, z: 65 },
  wheelRadius: 0.38,
  /** Position des roues dans le repère de la voiture : avant = +X, gauche = −Z. */
  wheelX: 0.8,
  wheelZ: 0.62,
  wheelY: -0.15,
  suspensionRest: 0.3,
  suspensionStiffness: 40,
  suspensionCompression: 4,
  suspensionRelaxation: 5,
  maxSuspensionForce: 100000,
  frictionSlip: 4,
  sideFrictionStiffness: 0.8,
  engineForce: 1500,
  reverseForce: 700,
  brakeForce: 60,
  /** Braquage max à l'arrêt (rad), réduit avec la vitesse. */
  steerMax: 0.5,
  steerSpeedFalloff: 25,
  /** Vitesse de rotation du volant, en rad par pas. */
  steerRate: 0.06,
  maxSpeed: 45,
  /**
   * Drift : freiner en tournant au-dessus de driftMinSpeed fait décrocher
   * l'arrière. Le drift continue tant qu'on tourne et qu'on garde de la
   * vitesse, même en réaccélérant ; il s'arrête quand on lâche la direction.
   */
  driftMinSpeed: 14,
  driftKeepSpeed: 8,
  /** Adhérence latérale de l'arrière en plein drift (1 = normale). */
  driftRearGrip: 0.2,
  /** Braquage max en drift, pour pouvoir contre-braquer. */
  driftSteerMax: 0.45,
  /** Vitesse d'entrée et de sortie du drift, par pas. */
  driftBlendIn: 0.12,
  driftBlendOut: 0.05,
  /** En drift, le frein ralentit beaucoup moins (il sert à déclencher). */
  driftBrakeFactor: 0.15,
  gravity: -20,
} as const;

const FRONT_LEFT = 0, FRONT_RIGHT = 1;

export interface Pose {
  p: [number, number, number];
  q: [number, number, number, number];
}

export class Simulation {
  readonly track: Track;
  tick = 0;
  /** Numéro du pas où la voiture est entrée dans l'arrivée, sinon null. */
  finishTick: number | null = null;
  fell = false;

  private world: RAPIER.World;
  private body: RAPIER.RigidBody;
  private vehicle: RAPIER.DynamicRayCastVehicleController;
  private steer = 0;
  /** 0 = adhérence normale, 1 = plein drift. */
  drift = 0;
  private drifting = false;

  constructor(track: Track) {
    this.track = track;
    const world = new RAPIER.World({ x: 0, y: CAR.gravity, z: 0 });
    world.timestep = DT;
    this.world = world;

    for (const b of track.blocks) {
      const desc = RAPIER.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
        .setTranslation(b.center[0], b.center[1], b.center[2])
        .setFriction(b.kind === 'road' ? 1 : 0.2);
      world.createCollider(desc);
    }

    const [sx, sy, sz] = track.start;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(sx, sy, sz)
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
    return this.finishTick !== null || this.fell || this.tick >= MAX_TICKS;
  }

  /** Vitesse vers l'avant, en m/s. */
  get speed(): number {
    return this.vehicle.currentVehicleSpeed();
  }

  /** Avance la simulation d'un pas de 1/60 s avec les touches données. */
  step(keys: Keys): void {
    if (this.done) return;
    const v = this.vehicle;
    const speed = v.currentVehicleSpeed();
    const up = (keys & KEY_UP) !== 0;
    const down = (keys & KEY_DOWN) !== 0;
    const left = (keys & KEY_LEFT) !== 0;
    const right = (keys & KEY_RIGHT) !== 0;

    const turning = left !== right;

    // Drift : déclenché par frein + virage à vitesse suffisante
    if (!this.drifting && turning && down && speed > CAR.driftMinSpeed) this.drifting = true;
    else if (this.drifting && (!turning || speed < CAR.driftKeepSpeed)) this.drifting = false;
    if (this.drifting) this.drift = Math.min(1, this.drift + CAR.driftBlendIn);
    else this.drift = Math.max(0, this.drift - CAR.driftBlendOut);

    let engine = 0;
    let brake = 0;
    if (up && !down) engine = speed < CAR.maxSpeed ? CAR.engineForce : 0;
    else if (down && !up) {
      if (speed > 1) brake = CAR.brakeForce * (this.drifting ? CAR.driftBrakeFactor : 1);
      else engine = -CAR.reverseForce;
    } else if (!up && !down) brake = 2; // frein moteur léger

    // Braquage progressif, réduit avec la vitesse (uniquement + − × ÷).
    const absSpeed = speed < 0 ? -speed : speed;
    const gripSteer = CAR.steerMax / (1 + absSpeed / CAR.steerSpeedFalloff);
    const maxSteer = gripSteer + (CAR.driftSteerMax - gripSteer) * this.drift;
    const target = left === right ? 0 : left ? maxSteer : -maxSteer;
    if (this.steer < target) this.steer = Math.min(target, this.steer + CAR.steerRate);
    else if (this.steer > target) this.steer = Math.max(target, this.steer - CAR.steerRate);

    v.setWheelSteering(FRONT_LEFT, this.steer);
    v.setWheelSteering(FRONT_RIGHT, this.steer);
    for (let i = 2; i < 4; i++) v.setWheelEngineForce(i, engine);
    for (let i = 0; i < 4; i++) v.setWheelBrake(i, brake);
    const rearGrip = CAR.sideFrictionStiffness * (1 - (1 - CAR.driftRearGrip) * this.drift);
    for (let i = 2; i < 4; i++) v.setWheelSideFrictionStiffness(i, rearGrip);

    v.updateVehicle(DT);
    this.world.step();
    this.tick++;

    const p = this.body.translation();
    if (p.y < -20) this.fell = true;
    const f = this.track.finish;
    if (
      this.finishTick === null &&
      Math.abs(p.x - f.center[0]) <= f.half[0] &&
      Math.abs(p.y - f.center[1]) <= f.half[1] &&
      Math.abs(p.z - f.center[2]) <= f.half[2]
    ) {
      this.finishTick = this.tick;
    }
  }

  /** Vitesse latérale (m/s) : forte quand la voiture glisse. Pour l'affichage et les tests. */
  get lateralSpeed(): number {
    const r = this.body.rotation();
    const l = this.body.linvel();
    // Axe −Z local (gauche) tourné par le quaternion
    const lx = -2 * (r.x * r.z + r.w * r.y);
    const lz = -(1 - 2 * (r.x * r.x + r.y * r.y));
    return l.x * lx + l.z * lz;
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
    const f = new Float32Array([t.x, t.y, t.z, r.x, r.y, r.z, r.w, l.x, l.y, l.z, a.x, a.y, a.z, this.steer, this.drift]);
    const i = new Int32Array([this.tick, this.finishTick ?? -1, this.fell ? 1 : 0]);
    return hex(fnv1a(new Uint8Array(i.buffer), fnv1a(new Uint8Array(f.buffer))));
  }

  dispose(): void {
    this.world.free();
  }
}
