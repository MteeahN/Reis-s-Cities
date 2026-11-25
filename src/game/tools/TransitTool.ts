import type { Vector3 } from 'three';
import type { TransitToolState } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { RoadPreview } from './placement/RoadPreview';
import type { Tool, ToolContext } from './Tool';

/**
 * Bus transit.
 *  - Stops: click a road to put a stop beside it; click a stop to remove it.
 *  - Line: click stops in the order the buses should visit them; click the
 *    first stop again (or press Enter) to open the line. ESC cancels.
 *  - Edit (from a line in the panel): click a stop to add it to the line
 *    (where it adds the least detour) or take it out. ESC ends.
 * Buses are bought and sold per line in the panel.
 */
export class TransitTool implements Tool {
  readonly id = 'transit' as const;
  state: TransitToolState = { mode: 'stop', draft: [], editLine: null, hint: null };
  private readonly preview = new RoadPreview();
  private ground: Vector3 | null = null;
  private downX = 0;
  private downY = 0;

  constructor(private readonly ctx: ToolContext) {
    ctx.overlay.add(this.preview.group);
  }

  setMode(mode: TransitToolState['mode'], editLine: number | null = null): void {
    this.state = { ...this.state, mode, draft: [], editLine: mode === 'edit' ? editLine : null };
    this.refresh();
  }

  activate(): void {
    this.ctx.setTransitRoutes(true);
    this.ctx.showLayer('transit');
    this.refresh();
  }

  deactivate(): void {
    this.ctx.setTransitRoutes(false);
    this.ctx.showLayer(null);
    this.state = { ...this.state, draft: [] };
    this.preview.hide();
  }

  private refresh(): void {
    const city = this.ctx.city;
    const h = this.ctx.world.heightAt;
    const g = this.ground;
    let hint: string | null = null;
    const markers: { x: number; z: number }[] = this.state.draft.map((id) => city.transit.stops.get(id)!).filter(Boolean);
    if (g) {
      const stop = city.transit.stopAt(g.x, g.z);
      if (this.state.mode === 'stop') {
        if (stop) hint = 'Tıklayın: durağı kaldır';
        else {
          const err = city.busStopError(g.x, g.z);
          hint = err ?? 'Tıklayın: durak koy';
          const near = city.roads.nearestEdge(g.x, g.z, 6, true);
          if (near && !err) markers.push(near.point);
        }
      } else if (this.state.mode === 'edit') {
        const line = this.state.editLine !== null ? city.transit.lines.get(this.state.editLine) : undefined;
        if (!line) hint = 'Düzenlenecek hattı panelden seçin';
        else if (stop) {
          markers.push(stop);
          const on = line.stops.includes(stop.id);
          hint = on ? (line.stops.length > 2 ? `Tıklayın: durağı ${line.name} hattından çıkar` : 'Hat en az iki duraktan geçer') : `Tıklayın: durağı ${line.name} hattına ekle`;
        } else hint = `${line.name}: bir durağa tıklayın (ekle / çıkar) · ESC bitir`;
      } else {
        if (stop) {
          markers.push(stop);
          hint = this.state.draft.length >= 2 && stop.id === this.state.draft[0] ? 'Tıklayın: hattı aç' : 'Tıklayın: durağı hatta ekle';
        } else hint = this.state.draft.length ? 'Sıradaki durağa tıklayın (ilk durak ya da Enter: hattı aç)' : 'İlk durağa tıklayın';
      }
    }
    if (markers.length) this.preview.setMarkers(markers.slice(-3), 5, h);
    else this.preview.hide();
    // The draft line: straight hops between its stops.
    if (this.state.draft.length >= 1 && g) {
      const pts = [...this.state.draft.map((id) => city.transit.stops.get(id)!).filter(Boolean), { x: g.x, z: g.z }];
      if (pts.length >= 2) this.preview.showPath(pts, 3, 'upgrade', h);
    } else this.preview.hidePath();
    this.state = { ...this.state, hint };
    this.ctx.events.emit('transitTool', { ...this.state, draft: [...this.state.draft] });
  }

  private openLine(): void {
    const city = this.ctx.city;
    const draft = this.state.draft;
    if (draft.length < 2) {
      this.ctx.events.emit('toast', { kind: 'warning', text: 'Bir hat en az iki duraktan geçer' });
      return;
    }
    const id = city.createBusLine(draft);
    if (id === null) {
      this.ctx.events.emit('toast', { kind: 'error', text: `Hat açılamadı: ${city.busFleetError(1) ?? 'durakları kontrol edin'}` });
      return;
    }
    const line = city.transit.lines.get(id)!;
    const route = city.transit.route(line);
    this.ctx.events.emit('toast', route.ok ? { kind: 'success', text: `${line.name} açıldı: ${draft.length} durak, ${(route.length / 1000).toFixed(1)} km` } : { kind: 'warning', text: `${line.name} açıldı ama bazı duraklar arasında yol yok: otobüsler çalışmaz` });
    this.ctx.events.emit('sfx', 'place');
    this.state = { ...this.state, draft: [] };
    this.refresh();
  }

  onPointerDown(p: PointerInfo): void {
    this.downX = p.x;
    this.downY = p.y;
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    this.ground = ground ? ground.clone() : null;
    this.refresh();
  }

  onPointerUp(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left || !ground || Math.hypot(p.x - this.downX, p.y - this.downY) > 5) return;
    const city = this.ctx.city;
    const stop = city.transit.stopAt(ground.x, ground.z);
    if (this.state.mode === 'stop') {
      if (stop) {
        const refund = city.removeBusStop(stop.id);
        this.ctx.events.emit('toast', { kind: 'info', text: `Durak kaldırıldı (+₺${refund.toLocaleString('tr-TR')} iade)` });
      } else {
        const err = city.busStopError(ground.x, ground.z);
        if (err) this.ctx.events.emit('toast', { kind: 'error', text: err });
        else if (city.addBusStop(ground.x, ground.z) !== null) this.ctx.events.emit('sfx', 'place');
      }
    } else if (this.state.mode === 'edit') {
      const id = this.state.editLine;
      if (stop && id !== null) {
        const r = city.toggleLineStop(id, stop.id);
        if (r) this.ctx.events.emit('sfx', 'place');
        else this.ctx.events.emit('toast', { kind: 'warning', text: 'Bir hat en az iki duraktan geçer' });
      }
    } else if (stop) {
      if (this.state.draft.length >= 2 && stop.id === this.state.draft[0]) {
        this.openLine();
        return;
      }
      if (this.state.draft[this.state.draft.length - 1] !== stop.id) this.state = { ...this.state, draft: [...this.state.draft, stop.id] };
    }
    this.refresh();
  }

  onKey(code: string): boolean {
    if (this.state.mode === 'line' && (code === 'Enter' || code === 'NumpadEnter')) {
      this.openLine();
      return true;
    }
    if (code === 'Escape' && this.state.mode === 'edit') {
      this.setMode('line');
      return true;
    }
    if (code === 'Escape' && this.state.draft.length) {
      this.state = { ...this.state, draft: [] };
      this.refresh();
      return true;
    }
    if (code === 'Tab') {
      this.setMode(this.state.mode === 'stop' ? 'line' : 'stop');
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
  }
}
