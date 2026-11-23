import { Color } from 'three';
import { smoothstep } from '../../utils/math';

const lin = (hex: number) => new Color().setHex(hex); // setHex converts sRGB → linear working space

const GRASS_LUSH = lin(0x5c8f37);
const GRASS_DRY = lin(0x93a04f);
const FOREST_FLOOR = lin(0x3d6728);
const ALPINE = lin(0x77805a);
const ROCK = lin(0x7f7b70);
const SAND = lin(0xb3a47a);
const MUD = lin(0x5d5641);
const SNOW = lin(0xe8edf1);

const tmp = new Color();

/**
 * Stylised-realistic terrain palette. Writes a linear RGB colour into `out`
 * at `offset` from height (m), slope (rise/run), moisture [-1,1], forest [0,1].
 */
export function terrainColor(
  out: Float32Array,
  offset: number,
  h: number,
  slope: number,
  moisture: number,
  forest: number,
): void {
  tmp.copy(GRASS_LUSH).lerp(GRASS_DRY, smoothstep(-0.25, 0.55, moisture));
  tmp.lerp(FOREST_FLOOR, forest * 0.65);
  tmp.lerp(ALPINE, smoothstep(110, 260, h));
  tmp.lerp(ROCK, smoothstep(0.42, 0.95, slope));
  tmp.lerp(SAND, 1 - smoothstep(0.25, 1.1, h));
  tmp.lerp(MUD, 1 - smoothstep(-0.6, 0.3, h));
  tmp.lerp(SNOW, smoothstep(380, 480, h) * (1 - smoothstep(1.0, 1.6, slope)));
  out[offset] = tmp.r;
  out[offset + 1] = tmp.g;
  out[offset + 2] = tmp.b;
}
