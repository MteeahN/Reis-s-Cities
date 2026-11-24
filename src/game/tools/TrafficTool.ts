import type { Vector3 } from 'three';
import type { TrafficToolMode, TrafficToolState } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getRoadType } from '../data/roads';
import { sampleBezier } from '../entities/road/curve';
import type { RoadNode } from '../entities/road/RoadGraph';
import { RoadPreview } from './placement/RoadPreview';
import type { Tool, ToolContext } from './Tool';

/** Installation cost (₺) of junction controls. */
export const LIGHTS_COST = 600;
export const STOP_COST = 60;

/**
 * Traffic management:
 *  - One-way: click a road segment to cycle its direction (two-way → a→b → b→a → two-way).
 *  - Lights / Stop: click a junction (3+ roads) to install signals or stop signs.
 *  - Roundabout: click a junction (3–6 roads) to rebuild it as a one-way ring.
 *  - Clear: click a junction to remove its control.
 * Changes feed the traffic assignment (routes, capacities, junction waits) and the vehicles on screen.
 */
export class TrafficTool implements Tool {
  readonly id = 'traffic' as const;
  private readonly preview = new RoadPreview();
  state: TrafficToolState = { mode: 'oneway', target: null };
  private hoverEdge: number | null = null;
  private hoverNode: number | null = null;
  private downX = 0;
  private downY = 0;

  constructor(private readonly ctx: ToolContext) {
    ctx.overlay.add(this.preview.group);
  }

  activate(): void {
    this.ctx.showLayer('traffic');
    this.emit();
  }

  deactivate(): void {
    this.preview.hide();
    this.hoverEdge = this.hoverNode = null;
    this.ctx.showLayer(null);
  }

  setMode(mode: TrafficToolMode): void {
    this.state = { ...this.state, mode };
    this.hoverEdge = this.hoverNode = null;
    this.preview.hide();
    this.emit();
  }

  private emit(): void {
    this.ctx.events.emit('trafficTool', { ...this.state });
  }

  private junctionAt(ground: Vector3): RoadNode | null {
    const roads = this.ctx.city.roads;
    let best: RoadNode | null = null;
    let bestD = 16;
    for (const n of roads.nodes.values()) {
      if (n.edges.length < 3 && !n.control) continue;
      const d = Math.hypot(n.x - ground.x, n.z - ground.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  private describe(): void {
    const roads = this.ctx.city.roads;
    const traffic = this.ctx.city.traffic;
    let target: TrafficToolState['target'] = null;
    if (this.hoverEdge !== null) {
      const e = roads.edges.get(this.hoverEdge)!;
      const dir = roads.direction(e);
      const type = getRoadType(e.typeId);
      target = {
        kind: 'road',
        name: type.name,
        detail: dir === 0 ? 'Çift yönlü' : 'Tek yönlü',
        action: type.oneWay ? 'Tıklayın: yönü çevir' : dir === 0 ? 'Tıklayın: tek yön yap' : dir === 1 ? 'Tıklayın: yönü çevir' : 'Tıklayın: çift yöne döndür',
        cost: 0,
      };
    } else if (this.hoverNode !== null) {
      const n = roads.nodes.get(this.hoverNode)!;
      if (this.state.mode === 'roundabout') {
        const plan = this.ctx.city.planRoundabout(n.id);
        target = {
          kind: 'junction',
          name: `${n.edges.length} yollu kavşak`,
          detail: plan.valid ? `Halka yarıçapı ${Math.round(plan.radius)} m · haftalık bakım ${plan.weeklyMaintenance} ₺` : plan.errors[0],
          action: plan.valid ? 'Tıklayın: döner kavşak yap' : 'Yapılamaz',
          cost: plan.valid ? plan.cost : 0,
        };
        this.state = { ...this.state, target };
        this.emit();
        return;
      }
      const control = n.control === 'lights' ? 'Trafik lambası' : n.control === 'stop' ? 'Dur levhaları' : 'Kontrolsüz';
      const mode = this.state.mode;
      const want = mode === 'lights' ? 'lights' : mode === 'stop' ? 'stop' : null;
      target = {
        kind: 'junction',
        name: `${n.edges.length} yollu kavşak`,
        detail: `${control} · ortalama bekleme ${Math.round(traffic.delayAt(n.id))} sn`,
        action: (n.control ?? null) === want ? (want ? 'Zaten kurulu' : 'Kontrol yok') : want === 'lights' ? 'Tıklayın: lamba kur' : want === 'stop' ? 'Tıklayın: dur levhası koy' : 'Tıklayın: kaldır',
        cost: want === 'lights' && n.control !== 'lights' ? LIGHTS_COST : want === 'stop' && n.control !== 'stop' ? STOP_COST : 0,
      };
    }
    this.state = { ...this.state, target };
    this.emit();
  }

  private highlight(): void {
    const roads = this.ctx.city.roads;
    const h = this.ctx.world.heightAt;
    if (this.hoverEdge !== null) {
      const e = roads.edges.get(this.hoverEdge)!;
      this.preview.showPath(sampleBezier(roads.curveOf(e), 3).points, getRoadType(e.typeId).width + 1, 'upgrade', h);
      this.preview.setMarkers([], 0, h);
    } else if (this.hoverNode !== null) {
      const n = roads.nodes.get(this.hoverNode)!;
      const plan = this.state.mode === 'roundabout' ? this.ctx.city.planRoundabout(n.id) : null;
      if (plan && plan.outline.length > 1) this.preview.showPath(plan.outline, 10, plan.valid ? 'valid' : 'invalid', h, () => this.ctx.city.roads.nodes.get(n.id)?.y ?? 0);
      else this.preview.hidePath();
      this.preview.setMarkers([{ x: n.x, z: n.z }], 9, h);
    } else this.preview.hide();
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    const before = `${this.hoverEdge}:${this.hoverNode}`;
    this.hoverEdge = this.hoverNode = null;
    if (ground) {
      if (this.state.mode === 'oneway') this.hoverEdge = this.ctx.city.roads.nearestEdge(ground.x, ground.z, 2, true)?.edge.id ?? null;
      else this.hoverNode = this.junctionAt(ground)?.id ?? null;
    }
    if (`${this.hoverEdge}:${this.hoverNode}` !== before) {
      this.highlight();
      this.describe();
    }
  }

  onPointerDown(p: PointerInfo): void {
    this.downX = p.x;
    this.downY = p.y;
  }

  onPointerUp(p: PointerInfo): void {
    if (p.button !== MouseButton.Left || Math.hypot(p.x - this.downX, p.y - this.downY) > 5) return;
    const city = this.ctx.city;
    const roads = city.roads;
    if (this.state.mode === 'oneway' && this.hoverEdge !== null) {
      const e = roads.edges.get(this.hoverEdge)!;
      const dir = roads.direction(e);
      const native = getRoadType(e.typeId).oneWay;
      const next = native ? (dir === 1 ? -1 : 1) : dir === 0 ? 1 : dir === 1 ? -1 : 0;
      roads.setOneWay(e.id, next);
      this.ctx.events.emit('sfx', 'click');
      this.ctx.events.emit('toast', { kind: 'info', text: next === 0 ? 'Yol çift yönlü yapıldı' : 'Yol tek yönlü yapıldı' });
    } else if (this.hoverNode !== null && this.state.mode === 'roundabout') {
      const plan = city.planRoundabout(this.hoverNode);
      if (!plan.valid) {
        this.ctx.events.emit('toast', { kind: 'error', text: plan.errors[0] });
        return;
      }
      if (city.buildRoundabout(plan)) {
        this.hoverNode = null;
        this.ctx.events.emit('sfx', 'road');
        this.ctx.events.emit('toast', { kind: 'success', text: 'Döner kavşak yapıldı' });
      }
    } else if (this.hoverNode !== null) {
      const n = roads.nodes.get(this.hoverNode)!;
      const want = this.state.mode === 'lights' ? 'lights' : this.state.mode === 'stop' ? 'stop' : null;
      if ((n.control ?? null) === want) return;
      if (want && n.edges.length < 3) {
        this.ctx.events.emit('toast', { kind: 'warning', text: 'Kontrol yalnızca 3 veya daha fazla yolun birleştiği kavşaklara kurulur' });
        return;
      }
      const cost = want === 'lights' ? LIGHTS_COST : want === 'stop' ? STOP_COST : 0;
      if (cost > 0 && !city.treasury.spend(cost, 'infra')) {
        this.ctx.events.emit('toast', { kind: 'error', text: 'Yetersiz bütçe' });
        return;
      }
      roads.setControl(n.id, want);
      this.ctx.events.emit('sfx', want ? 'place' : 'demolish');
      this.ctx.events.emit('toast', { kind: 'info', text: want === 'lights' ? 'Trafik lambası kuruldu' : want === 'stop' ? 'Dur levhaları kondu' : 'Kavşak kontrolü kaldırıldı' });
    }
    this.highlight();
    this.describe();
  }

  onKey(code: string): boolean {
    const order: TrafficToolMode[] = ['oneway', 'lights', 'stop', 'roundabout', 'clear'];
    if (code === 'Tab') {
      this.setMode(order[(order.indexOf(this.state.mode) + 1) % order.length]);
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
  }
}
