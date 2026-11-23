export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export type HeightFn = (x: number, z: number) => number;

/**
 * Analytic ray/heightfield intersection: adaptive ray-march followed by
 * binary refinement. Far cheaper than triangle raycasting against all
 * terrain chunks, and exact to the bilinear surface used for gameplay.
 */
export function pickGround(
  origin: Vec3Like,
  dir: Vec3Like,
  heightAt: HeightFn,
  maxDistance = 30000,
  out: Vec3Like = { x: 0, y: 0, z: 0 },
): Vec3Like | null {
  let t = 0;
  let prevT = 0;
  let above = origin.y - heightAt(origin.x, origin.z);
  if (above < 0) return null; // origin below ground
  for (let iter = 0; iter < 4000 && t < maxDistance; iter++) {
    prevT = t;
    // Step proportional to height above ground; small steps near the surface.
    t += Math.min(80, Math.max(0.75, above * 0.45));
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    above = y - heightAt(x, z);
    if (above <= 0) {
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        const mx = origin.x + dir.x * mid;
        const my = origin.y + dir.y * mid;
        const mz = origin.z + dir.z * mid;
        if (my - heightAt(mx, mz) > 0) lo = mid;
        else hi = mid;
      }
      out.x = origin.x + dir.x * hi;
      out.z = origin.z + dir.z * hi;
      out.y = heightAt(out.x, out.z);
      return out;
    }
    if (dir.y > 0 && y > 2000) return null; // escaping upward
  }
  return null;
}
