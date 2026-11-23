/**
 * Shared shader uniforms. Materials that light up after dark (windows,
 * street lamps, headlights) reference the same object, so the day/night
 * cycle updates all of them with one assignment per frame.
 */
export const nightUniform = { value: 0 };

/** Seconds of real time, for subtle animation (tree sway). */
export const timeUniform = { value: 0 };

/** Wind strength 0–1 (tree sway amplitude). */
export const windUniform = { value: 1 };

/** GLSL hash used by several materials: 2D → [0, 1). */
export const HASH_GLSL = /* glsl */ `
float reisHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;
