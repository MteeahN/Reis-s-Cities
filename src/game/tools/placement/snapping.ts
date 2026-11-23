import { CELL_SIZE } from '../../core/config';

export interface Point2 {
  x: number;
  z: number;
}

/** Snap a world point to the nearest cell corner. */
export function snapToGrid(p: Point2, step = CELL_SIZE): Point2 {
  return { x: Math.round(p.x / step) * step, z: Math.round(p.z / step) * step };
}

/**
 * Snap the segment start→end to the nearest `angleStepDeg` direction and to a
 * length that is a multiple of `lengthStep`.
 */
export function snapSegment(start: Point2, end: Point2, angleStepDeg = 15, lengthStep = CELL_SIZE, baseAngleRad = 0): Point2 {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { ...start };
  const step = (angleStepDeg * Math.PI) / 180;
  // Angles snap relative to `baseAngleRad` (e.g. the road being continued).
  const a = baseAngleRad + Math.round((Math.atan2(dz, dx) - baseAngleRad) / step) * step;
  const snappedLen = Math.max(lengthStep, Math.round(len / lengthStep) * lengthStep);
  return { x: start.x + Math.cos(a) * snappedLen, z: start.z + Math.sin(a) * snappedLen };
}

/** Heading in degrees (0 = +X, counter-clockwise toward +Z), normalised to [0, 360). */
export function headingDeg(start: Point2, end: Point2): number {
  const d = (Math.atan2(end.z - start.z, end.x - start.x) * 180) / Math.PI;
  return (d + 360) % 360;
}
