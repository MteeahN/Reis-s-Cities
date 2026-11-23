import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { UtilityLines } from '../entities/infra/UtilityLines';

const POLE_HEIGHT = 11;
const ARM = 1.8;
const MAX_SPAN = 40;
const SUBDIV = 10;

/** Pylons along every power-line segment, with two sagging wires between them. */
export class PowerLineRenderer {
  readonly group = new Group();
  private poles: InstancedMesh | null = null;
  private wires: LineSegments | null = null;
  private readonly poleGeo: BufferGeometry;
  private readonly poleMat = new MeshStandardMaterial({ color: 0x7c7368, roughness: 0.8 });
  private readonly wireMat = new LineBasicMaterial({ color: 0x2a2d31 });
  private readonly unsub: () => void;

  constructor(
    private readonly lines: UtilityLines,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'power-lines';
    const shaft = new CylinderGeometry(0.16, 0.26, POLE_HEIGHT, 6).translate(0, POLE_HEIGHT / 2, 0);
    const arm = new BoxGeometry(ARM * 2 + 0.4, 0.22, 0.22).translate(0, POLE_HEIGHT - 0.6, 0);
    const brace = new BoxGeometry(ARM * 1.2, 0.14, 0.14).translate(0, POLE_HEIGHT - 1.6, 0);
    this.poleGeo = mergeGeometries([shaft.toNonIndexed(), arm.toNonIndexed(), brace.toNonIndexed()])!;
    this.rebuild();
    this.unsub = lines.onChange(() => this.rebuild());
  }

  private rebuild(): void {
    if (this.poles) {
      this.group.remove(this.poles);
      this.poles.dispose();
      this.poles = null;
    }
    if (this.wires) {
      this.group.remove(this.wires);
      this.wires.geometry.dispose();
      this.wires = null;
    }
    const poles: { x: number; z: number; y: number; angle: number }[] = [];
    const wire: number[] = [];
    const seen = new Set<string>();
    for (const l of this.lines.lines.values()) {
      const dx = l.b.x - l.a.x;
      const dz = l.b.z - l.a.z;
      const spans = Math.max(1, Math.ceil(l.length / MAX_SPAN));
      const angle = Math.atan2(dx, dz);
      // Perpendicular offset for the two wires.
      const ox = (dz / (l.length || 1)) * ARM;
      const oz = (-dx / (l.length || 1)) * ARM;
      let prev: { x: number; z: number; y: number } | null = null;
      for (let s = 0; s <= spans; s++) {
        const x = l.a.x + (dx * s) / spans;
        const z = l.a.z + (dz * s) / spans;
        const y = Math.max(0, this.heightAt(x, z));
        const key = `${Math.round(x)},${Math.round(z)}`;
        if (!seen.has(key)) {
          seen.add(key);
          poles.push({ x, z, y, angle });
        }
        const top = y + POLE_HEIGHT - 0.7;
        if (prev) {
          const span = Math.hypot(x - prev.x, z - prev.z);
          const sag = 0.6 + span * 0.025;
          for (const side of [-1, 1]) {
            for (let k = 0; k < SUBDIV; k++) {
              for (const t of [k / SUBDIV, (k + 1) / SUBDIV]) {
                const yy = prev.y + (top - prev.y) * t - sag * 4 * t * (1 - t);
                wire.push(prev.x + (x - prev.x) * t + ox * side, yy, prev.z + (z - prev.z) * t + oz * side);
              }
            }
          }
        }
        prev = { x, z, y: top };
      }
    }
    if (poles.length > 0) {
      const mesh = new InstancedMesh(this.poleGeo, this.poleMat, poles.length);
      const m = new Matrix4();
      const q = new Quaternion();
      const up = new Vector3(0, 1, 0);
      const one = new Vector3(1, 1, 1);
      poles.forEach((p, i) => {
        q.setFromAxisAngle(up, p.angle);
        mesh.setMatrixAt(i, m.compose(new Vector3(p.x, p.y, p.z), q, one));
      });
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      this.poles = mesh;
      this.group.add(mesh);
    }
    if (wire.length > 0) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(wire), 3));
      geo.computeBoundingSphere();
      this.wires = new LineSegments(geo, this.wireMat);
      this.group.add(this.wires);
    }
  }

  dispose(): void {
    this.unsub();
    this.poles?.dispose();
    this.wires?.geometry.dispose();
    this.poleGeo.dispose();
    this.poleMat.dispose();
    this.wireMat.dispose();
  }
}
