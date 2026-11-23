import type { MeshStandardMaterial } from 'three';
import { timeUniform, windUniform } from './nightUniform';

/**
 * Wind sway for instanced vegetation: vertices bend with height above the
 * trunk base, phase-shifted per instance position so a forest doesn't move
 * in lockstep. Shadows keep the rest pose (a cheap, intentional trade-off).
 */
export function patchSway(mat: MeshStandardMaterial): void {
  const uniforms = { uTime: timeUniform, uWind: windUniform };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec2 ip = instanceMatrix[3].xz;
  float bend = max(0.0, position.y - 1.8);
  float ph = uTime * 1.35 + ip.x * 0.051 + ip.y * 0.073;
  float gust = 0.75 + 0.25 * sin(uTime * 0.31 + ip.x * 0.004);
  transformed.x += sin(ph) * 0.03 * bend * uWind * gust;
  transformed.z += cos(ph * 0.83) * 0.022 * bend * uWind * gust;
}
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'reis-sway-v1';
}
