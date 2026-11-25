import { describe, expect, it } from 'vitest';
import { EYE_HEIGHT, RUN_SPEED, WALK_SPEED, WalkController, type WalkInput } from '../../src/game/camera/WalkController';

/** Flat ground at 10 m with a wall block from x 100–120, z 80–200. */
const world = {
  ground: (x: number) => 10 + (x > 300 ? 2 : 0),
  blocked: (x: number, z: number) => x >= 100 && x <= 120 && z >= 80 && z <= 200,
};
const idle: WalkInput = { forward: 0, strafe: 0, run: false, lookDX: 0, lookDY: 0, turn: 0 };

describe('Walking mode', () => {
  it('starts at the nearest free spot, at eye height', () => {
    const w = new WalkController(world);
    expect(w.start(110, 150, 0)).toBe(true);
    expect(world.blocked(w.x, w.z)).toBe(false);
    expect(Math.hypot(w.x - 110, w.z - 150)).toBeLessThan(14);
    expect(w.y).toBeCloseTo(10 + EYE_HEIGHT);
  });

  it('walks forward along its facing, runs faster, and turns with the mouse', () => {
    const w = new WalkController(world);
    w.start(50, 50, Math.PI / 2); // facing −x
    w.update(1, { ...idle, forward: 1 });
    expect(w.x).toBeCloseTo(50 - WALK_SPEED, 1);
    expect(w.z).toBeCloseTo(50, 3);
    w.update(1, { ...idle, forward: 1, run: true });
    expect(w.x).toBeCloseTo(50 - WALK_SPEED - RUN_SPEED, 1);
    const yaw = w.yaw;
    w.update(0.016, { ...idle, lookDX: 100, lookDY: -5000 });
    expect(w.yaw).toBeLessThan(yaw);
    expect(w.pitch).toBeLessThanOrEqual((80 * Math.PI) / 180 + 1e-9);
  });

  it('stops at walls but slides along them', () => {
    const w = new WalkController(world);
    w.start(95, 150, -Math.PI / 2); // facing +x, the wall 5 m ahead
    for (let k = 0; k < 20; k++) w.update(0.1, { ...idle, forward: 1 });
    expect(w.x).toBeLessThan(100);
    // Walking diagonally into the wall slides along it (z changes, x stays).
    const z0 = w.z;
    for (let k = 0; k < 10; k++) w.update(0.1, { ...idle, forward: 1, strafe: 1 });
    expect(w.x).toBeLessThan(100);
    expect(Math.abs(w.z - z0)).toBeGreaterThan(1);
  });

  it('follows the ground up a step smoothly', () => {
    const w = new WalkController(world);
    w.start(295, 50, -Math.PI / 2);
    for (let k = 0; k < 40; k++) w.update(0.05, { ...idle, forward: 1 });
    expect(w.x).toBeGreaterThan(300);
    expect(w.y).toBeGreaterThan(12 + EYE_HEIGHT - 0.3);
    expect(w.y).toBeLessThanOrEqual(12 + EYE_HEIGHT + 1e-6);
  });
});
