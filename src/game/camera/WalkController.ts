import type { PerspectiveCamera } from 'three';
import { WORLD_SIZE } from '../core/config';
import { clamp, dampFactor } from '../../utils/math';

/** What the walker needs from the world. */
export interface WalkWorld {
  /** Height of the surface to stand on (terrain, or a road deck). */
  ground(x: number, z: number): number;
  /** Can't stand here (a building as drawn, water without a bridge, off the map). */
  blocked(x: number, z: number): boolean;
}

/** Per-frame walking input. */
export interface WalkInput {
  /** +1 forward, −1 back. */
  forward: number;
  /** +1 right, −1 left. */
  strafe: number;
  run: boolean;
  /** Mouse movement this frame (px). */
  lookDX: number;
  lookDY: number;
  /** Q / E: turn without the mouse (−1 left, +1 right). */
  turn: number;
}

export const EYE_HEIGHT = 1.7;
/** Walking and running speeds (m/s) — brisk, so a district can be crossed in a minute. */
export const WALK_SPEED = 4.5;
export const RUN_SPEED = 13;
const LOOK_PER_PX = 0.0026;
const TURN_SPEED = 1.8;
const MAX_PITCH = (80 * Math.PI) / 180;
/** Keeps the eye this far from walls (m). */
const BODY_RADIUS = 0.35;

/**
 * First-person walking: the eye stands EYE_HEIGHT above the ground and
 * moves with W A S D (Shift runs), the mouse looks around. Walls stop the
 * walker but it slides along them. Facing follows the city camera
 * convention: forward is (−sin yaw, −cos yaw).
 */
export class WalkController {
  x = 0;
  z = 0;
  /** Eye height (smoothed over kerbs and slopes). */
  y = 0;
  yaw = 0;
  pitch = 0;

  constructor(private readonly world: WalkWorld) {}

  /** Starts at the nearest free spot to (x, z), looking along `yaw`. False if none is found nearby. */
  start(x: number, z: number, yaw: number): boolean {
    const spot = this.freeSpotNear(x, z);
    if (!spot) return false;
    this.x = spot.x;
    this.z = spot.z;
    this.y = this.world.ground(spot.x, spot.z) + EYE_HEIGHT;
    this.yaw = yaw;
    this.pitch = -0.05;
    return true;
  }

  /** Nearest walkable point (spiral search out to 160 m). */
  freeSpotNear(x: number, z: number): { x: number; z: number } | null {
    if (this.free(x, z)) return { x, z };
    for (let r = 2; r <= 160; r += 2) {
      const n = Math.max(8, Math.round((r * Math.PI * 2) / 3));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (this.free(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  private free(x: number, z: number): boolean {
    if (x < 1 || z < 1 || x > WORLD_SIZE - 1 || z > WORLD_SIZE - 1) return false;
    if (this.world.blocked(x, z)) return false;
    // Keep a little distance from walls.
    for (const [dx, dz] of [[BODY_RADIUS, 0], [-BODY_RADIUS, 0], [0, BODY_RADIUS], [0, -BODY_RADIUS]]) if (this.world.blocked(x + dx, z + dz)) return false;
    return true;
  }

  update(dt: number, input: WalkInput): void {
    this.yaw -= input.lookDX * LOOK_PER_PX + input.turn * TURN_SPEED * dt;
    this.pitch = clamp(this.pitch - input.lookDY * LOOK_PER_PX, -MAX_PITCH, MAX_PITCH);
    let f = input.forward;
    let s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 0) {
      f /= len;
      s /= len;
      const speed = (input.run ? RUN_SPEED : WALK_SPEED) * dt;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const dx = (fx * f + rx * s) * speed;
      const dz = (fz * f + rz * s) * speed;
      // Move, or slide along whichever axis is free.
      if (this.free(this.x + dx, this.z + dz)) {
        this.x += dx;
        this.z += dz;
      } else if (this.free(this.x + dx, this.z)) this.x += dx;
      else if (this.free(this.x, this.z + dz)) this.z += dz;
    }
    const eye = this.world.ground(this.x, this.z) + EYE_HEIGHT;
    // Up kerbs and slopes smoothly, but never below the ground.
    this.y = Math.max(eye - 0.4, this.y + (eye - this.y) * dampFactor(10, dt));
  }

  /** Points the camera from the eye along yaw / pitch. */
  apply(camera: PerspectiveCamera): void {
    camera.position.set(this.x, this.y, this.z);
    const cp = Math.cos(this.pitch);
    camera.lookAt(this.x - Math.sin(this.yaw) * cp, this.y + Math.sin(this.pitch), this.z - Math.cos(this.yaw) * cp);
    if (camera.near !== 0.1) {
      camera.near = 0.1;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
}
