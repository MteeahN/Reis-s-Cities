import { BufferAttribute, BufferGeometry, CanvasTexture, Group, Points, PointsMaterial, SRGBColorSpace } from 'three';
import { CELL_SIZE } from '../core/config';
import { getBuilding } from '../data/buildings';
import { buildingGeometry } from '../entities/building/BuildingModels';
import type { City } from '../systems/City';

export type ProblemKind = 'fire' | 'power' | 'water' | 'sewage' | 'garbage' | 'road';

const STYLE: Record<ProblemKind, { bg: string; draw: (c: CanvasRenderingContext2D) => void }> = {
  fire: {
    bg: '#e8572a',
    draw: (c) => {
      c.beginPath();
      c.moveTo(32, 12);
      c.bezierCurveTo(44, 26, 46, 34, 44, 40);
      c.bezierCurveTo(42, 50, 22, 50, 20, 40);
      c.bezierCurveTo(19, 33, 25, 30, 26, 24);
      c.bezierCurveTo(30, 28, 31, 31, 31, 34);
      c.bezierCurveTo(35, 28, 34, 20, 32, 12);
      c.fill();
    },
  },
  power: {
    bg: '#e8a400',
    draw: (c) => {
      c.beginPath();
      c.moveTo(36, 10);
      c.lineTo(20, 35);
      c.lineTo(31, 35);
      c.lineTo(27, 54);
      c.lineTo(44, 28);
      c.lineTo(33, 28);
      c.closePath();
      c.fill();
    },
  },
  water: {
    bg: '#2f7de0',
    draw: (c) => {
      c.beginPath();
      c.moveTo(32, 11);
      c.bezierCurveTo(40, 24, 46, 32, 46, 39);
      c.arc(32, 39, 14, 0, Math.PI, false);
      c.bezierCurveTo(18, 32, 24, 24, 32, 11);
      c.fill();
    },
  },
  sewage: {
    bg: '#8a6a3c',
    draw: (c) => {
      c.fillRect(18, 26, 28, 6);
      c.fillRect(26, 18, 6, 26);
      c.beginPath();
      c.arc(40, 44, 6, 0, Math.PI * 2);
      c.fill();
    },
  },
  garbage: {
    bg: '#6b7f3c',
    draw: (c) => {
      c.fillRect(20, 20, 24, 4);
      c.fillRect(28, 15, 8, 4);
      c.beginPath();
      c.moveTo(22, 26);
      c.lineTo(42, 26);
      c.lineTo(39, 49);
      c.lineTo(25, 49);
      c.closePath();
      c.fill();
    },
  },
  road: {
    bg: '#7a7f86',
    draw: (c) => {
      c.fillRect(24, 12, 4, 40);
      c.fillRect(36, 12, 4, 40);
      c.fillRect(31, 16, 2, 8);
      c.fillRect(31, 30, 2, 8);
    },
  },
};

function iconTexture(kind: ProblemKind): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.arc(32, 34, 28, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = STYLE[kind].bg;
  c.beginPath();
  c.arc(32, 32, 27, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.stroke();
  c.fillStyle = '#ffffff';
  STYLE[kind].draw(c);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const KINDS: ProblemKind[] = ['fire', 'power', 'water', 'sewage', 'garbage', 'road'];

/**
 * Floating notification icons above buildings with a problem (fire, no
 * power/water/sewage, garbage, no road). One Points draw call per kind.
 */
export class ProblemIcons {
  readonly group = new Group();
  private readonly points = new Map<ProblemKind, Points>();

  constructor(private readonly city: City) {
    this.group.name = 'problem-icons';
    if (typeof document === 'undefined') return;
    for (const k of KINDS) {
      const mat = new PointsMaterial({ map: iconTexture(k), size: 26, sizeAttenuation: false, transparent: true, depthTest: false, alphaTest: 0.05 });
      const p = new Points(new BufferGeometry(), mat);
      p.frustumCulled = false;
      p.renderOrder = 20;
      this.points.set(k, p);
      this.group.add(p);
    }
  }

  /** Rebuild icon positions from the current simulation state. */
  refresh(garbageMatters: boolean, roadAccess: (id: number) => boolean): void {
    if (this.points.size === 0) return;
    const pos: Record<ProblemKind, number[]> = { fire: [], power: [], water: [], sewage: [], garbage: [], road: [] };
    const u = this.city.utilities;
    for (const b of this.city.buildings.items.values()) {
      if (b.state === 'construction' || b.state === 'abandoned') continue;
      const def = getBuilding(b.defId);
      let kind: ProblemKind | null = null;
      if (b.state === 'burning') kind = 'fire';
      else if (b.zone && !roadAccess(b.id)) kind = 'road';
      else if (def.electricity > 0 && !def.utility && !u.power.has(b.id)) kind = 'power';
      else if (def.water > 0 && !def.utility && !u.water.has(b.id)) kind = 'water';
      else if (def.water > 0 && !def.utility && !u.sewage.has(b.id)) kind = 'sewage';
      else if (garbageMatters && b.zone && this.city.services.average('garbage', b.cells) < 0.3) kind = 'garbage';
      if (!kind) continue;
      const h = buildingGeometry(def).height;
      pos[kind].push((b.i + b.w / 2) * CELL_SIZE, b.baseY + h + 4, (b.j + b.d / 2) * CELL_SIZE);
    }
    for (const k of KINDS) {
      const p = this.points.get(k)!;
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(pos[k]), 3));
      p.geometry.dispose();
      p.geometry = geo;
    }
  }

  dispose(): void {
    for (const p of this.points.values()) {
      p.geometry.dispose();
      (p.material as PointsMaterial).map?.dispose();
      (p.material as PointsMaterial).dispose();
    }
  }
}
