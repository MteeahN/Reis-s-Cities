import { useState } from 'react';
import type { DecorToolState, DemolishFilter, PaintToolState, RoadMode, TerrainToolState, ToolId, TrafficToolMode, ZoneToolState } from '../../game/core/events';
import { getProp, PAINTS, PROP_GROUPS, PROPS, type PropGroup } from '../../game/data/decor';
import { BUS_DAILY_UPKEEP, BUS_PRICE, DEPOT_BUSES, STOP_COST as BUS_STOP_COST } from '../../game/simulation/Transit';
import { LIGHTS_COST, STOP_COST } from '../../game/tools/TrafficTool';
import { TERRAIN_BRUSH, TERRAIN_PRICE } from '../../game/tools/TerrainTool';
import { ZONES } from '../../game/data/zones';
import { buildingsInGroup, growablePrice, storeysOf, ZONED_BUILDINGS, type BuildingDef } from '../../game/data/buildings';
import { ARCH_STYLE_DEFS, ARCH_STYLES, type ArchStyle } from '../../game/data/styles';
import { LINE_TYPES } from '../../game/data/infrastructure';
import { INFO_LAYERS } from '../../game/rendering/InfoLayers';
import { BUILDABLE_ROAD_TYPES as ROAD_TYPES, ROAD_CATEGORIES, ROAD_SURFACES, isRoadTypeUnlocked, type RoadCategory } from '../../game/data/roads';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { formatMoney, formatNumber } from '../../utils/format';
import { Icon, type IconName } from '../components/Icon';
import { FavStar, Thumb, useCatalog } from './catalog';
import { RoadSketch } from './RoadSketch';

interface ToolEntry {
  id: string;
  label: string;
  icon: IconName;
  tool?: ToolId;
  hotkey?: string;
  /** Development phase that delivers this tool, when not yet available. */
  phase?: number;
}

const TOOLS: ToolEntry[] = [
  { id: 'select', label: 'Seç', icon: 'cursor', tool: 'select', hotkey: 'V' },
  { id: 'road', label: 'Yollar', icon: 'road', tool: 'road', hotkey: 'Y' },
  { id: 'zone', label: 'Bölgeleme', icon: 'zone', tool: 'zone', hotkey: 'Z' },
  { id: 'building', label: 'Binalar', icon: 'building', tool: 'building', hotkey: 'B' },
  { id: 'power', label: 'Elektrik', icon: 'power', tool: 'power', hotkey: 'P' },
  { id: 'water', label: 'Su', icon: 'water', tool: 'water', hotkey: 'U' },
  { id: 'services', label: 'Hizmetler', icon: 'services', tool: 'services', hotkey: 'J' },
  { id: 'terrain', label: 'Arazi', icon: 'terrain', tool: 'terrain', hotkey: 'E' },
  { id: 'paint', label: 'Kaplama', icon: 'brush', tool: 'paint', hotkey: 'Q' },
  { id: 'decor', label: 'Süsler', icon: 'bench', tool: 'decor', hotkey: 'N' },
  { id: 'traffic', label: 'Trafik', icon: 'traffic', tool: 'traffic', hotkey: 'K' },
  { id: 'transit', label: 'Otobüs', icon: 'bus', tool: 'transit', hotkey: 'O' },
  { id: 'move', label: 'Taşı', icon: 'move', tool: 'move', hotkey: 'M' },
  { id: 'demolish', label: 'Yıkım', icon: 'demolish', tool: 'demolish', hotkey: 'X' },
];

const MODES: { id: RoadMode; label: string; icon: IconName; hint: string }[] = [
  { id: 'straight', label: 'Düz', icon: 'road', hint: 'Tıkla-tıkla veya sürükle-bırak ile düz yol' },
  { id: 'curve', label: 'Kavisli', icon: 'curve', hint: 'Başlangıç → kontrol noktası → bitiş' },
  { id: 'free', label: 'Serbest', icon: 'freehand', hint: 'Basılı tutup yolun gideceği yeri çizin; keskin dönüşler yumuşatılır' },
  { id: 'arc', label: 'Yay', icon: 'arc', hint: 'Başlangıç → bitiş → yayın bükümü (dairesel yay)' },
  { id: 'upgrade', label: 'Yenile', icon: 'upgrade', hint: 'Mevcut bir yolu seçili türe dönüştür; aynı türse seçili kaplamayla yeniden kapla' },
];

function RoadPicker() {
  const roadType = useGameStore((s) => s.roadType);
  const roadMode = useGameStore((s) => s.roadMode);
  const elevation = useGameStore((s) => s.roadElevation);
  const surface = useGameStore((s) => s.roadSurface);
  const population = useGameStore((s) => (s.sandbox ? Infinity : s.maxPopulation));
  const [cat, setCat] = useState<RoadCategory>(() => ROAD_TYPES.find((t) => t.id === roadType)?.category ?? 'street');
  return (
    <div className="subtoolbar panel" data-testid="road-types">
      <div className="mode-group" role="tablist" aria-label="Yol türleri">
        {ROAD_CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            className={`mode-btn ${cat === c.id ? 'active' : ''}`}
            onClick={() => setCat(c.id)}
            data-testid={`road-cat-${c.id}`}
          >
            <span>{c.name}</span>
            <span className="count">{ROAD_TYPES.filter((t) => t.category === c.id).length}</span>
          </button>
        ))}
      </div>
      <div className="divider vertical" />
      <div className="mode-group" role="group" aria-label="Çizim modu">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-btn ${roadMode === m.id ? 'active' : ''}`}
            onClick={() => getGame()?.setRoadMode(m.id)}
            title={m.hint}
            data-testid={`road-mode-${m.id}`}
          >
            <Icon name={m.icon} size={16} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <div className="divider vertical" />
      <div className="mode-group surface-group" role="group" aria-label="Kaplama">
        {ROAD_SURFACES.map((s) => (
          <button key={s.id} className={`mode-btn ${surface === s.id ? 'active' : ''}`} onClick={() => getGame()?.setRoadSurface(s.id)} title={`Yeni yollar ${s.name.toLowerCase()} kaplanır. Var olan yolu yeniden kaplamak için Yenile modunda aynı yol türüne tıklayın.`} data-testid={`road-surface-${s.id}`}>
            <span className={`surface-swatch sw-${s.id}`} aria-hidden />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <div className="divider vertical" />
      <div className="mode-group elevation-group" role="group" aria-label="Yol yüksekliği" title="Yolu yükseltin (PageUp / PageDown). Yükseltilmiş yollar ayaklar üzerinde durur, en az 6 m alçaktaki yolların üzerinden kavşak kurmadan geçer; köprü fiyatına yapılır, kenarlarına bina yapılmaz.">
        <button className="mode-btn" onClick={() => getGame()?.setRoadElevation(elevation + 3)} disabled={elevation >= 24} aria-label="Yükselt" data-testid="road-elev-up">
          <Icon name="chevronUp" size={16} />
        </button>
        <span className={`elev-value ${elevation > 0 ? 'raised' : ''}`} data-testid="road-elevation">
          <Icon name="elevated" size={14} /> {elevation === 0 ? 'Zemin' : `+${elevation} m`}
        </span>
        <button className="mode-btn" onClick={() => getGame()?.setRoadElevation(elevation - 3)} disabled={elevation <= 0} aria-label="Alçalt" data-testid="road-elev-down">
          <Icon name="chevronDown" size={16} />
        </button>
      </div>
      <div className="divider vertical" />
      {ROAD_TYPES.filter((t) => t.category === cat).map((t) => {
        const unlocked = isRoadTypeUnlocked(t, population);
        const active = t.id === roadType;
        return (
          <button
            key={t.id}
            className={`road-type road-card ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`}
            disabled={!unlocked}
            onClick={() => getGame()?.setRoadType(t.id)}
            data-testid={`road-type-${t.id}`}
            title={
              unlocked
                ? `${t.description}\nGenişlik ${t.width} m · ${t.lanes} şerit · ${t.speedKmh} km/s · ${formatNumber(t.capacity)} araç/saat`
                : `${formatNumber(t.unlockPopulation)} nüfusta açılır`
            }
          >
            <RoadSketch t={t} />
            <span className="road-name">{t.name}</span>
            <span className="road-sub">
              {t.oneWay ? 'tek yön' : 'çift yön'} · {t.lanes} şerit{t.median ? ' · refüj' : ''}
            </span>
            <span className="road-meta">
              {unlocked ? (
                `${formatMoney(t.costPerMeter)}/m`
              ) : (
                <>
                  <Icon name="lock" size={11} /> {formatNumber(t.unlockPopulation)}
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DEMOLISH_FILTERS: { id: DemolishFilter; name: string; hint: string; icon: IconName }[] = [
  { id: 'all', name: 'Hepsi', hint: 'İmlecin altındaki her şey (hattın üzerinde: hat)', icon: 'demolish' },
  { id: 'road', name: 'Yollar', hint: 'Yalnızca yol parçaları', icon: 'road' },
  { id: 'building', name: 'Binalar', hint: 'Yalnızca binalar', icon: 'building' },
  { id: 'prop', name: 'Süsler', hint: 'Yalnızca süs eşyaları (bank, çardak…)', icon: 'bench' },
  { id: 'powerline', name: 'Elektrik hatları', hint: 'Yalnızca elektrik hatları (yolun üzerindekiler dahil)', icon: 'power' },
  { id: 'pipe', name: 'Borular', hint: 'Yalnızca su boruları (su görünümü açılır)', icon: 'water' },
];

function DemolishPicker() {
  const filter = useGameStore((s) => s.demolishFilter);
  return (
    <div className="subtoolbar panel" data-testid="demolish-picker">
      <div className="mode-group row" role="group" aria-label="Yıkılacak">
        {DEMOLISH_FILTERS.map((f) => (
          <button key={f.id} className={`mode-btn ${filter === f.id ? 'active' : ''}`} onClick={() => getGame()?.setDemolishFilter(f.id)} title={f.hint} data-testid={`demolish-filter-${f.id}`}>
            <Icon name={f.icon} size={14} /> <span>{f.name}</span>
          </button>
        ))}
      </div>
      <span className="muted small">Tab: değiştir</span>
    </div>
  );
}

function LineName({ id, name }: { id: number; name: string }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit === null)
    return (
      <span className="line-name" onDoubleClick={() => setEdit(name)} title="Çift tıklayın: adını değiştir">
        {name}
      </span>
    );
  const done = () => {
    if (edit.trim()) getGame()?.renameBusLine(id, edit);
    setEdit(null);
  };
  return (
    <input
      className="line-name-input"
      value={edit}
      autoFocus
      maxLength={24}
      onChange={(e) => setEdit(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done();
        if (e.key === 'Escape') setEdit(null);
      }}
      aria-label="Hat adı"
    />
  );
}

function TransitPicker() {
  const st = useGameStore((s) => s.transitTool);
  const t = useGameStore((s) => s.transit);
  return (
    <div className="subtoolbar panel transit-picker" data-testid="transit-picker">
      <div className="mode-group" role="group" aria-label="Otobüs aracı">
        <button className={`mode-btn ${st.mode === 'stop' ? 'active' : ''}`} onClick={() => getGame()?.setTransitMode('stop')} title={`Yola tıklayın: durak (${formatMoney(BUS_STOP_COST)}); durağa tıklayın: kaldır`} data-testid="transit-mode-stop">
          Durak
        </button>
        <button className={`mode-btn ${st.mode === 'line' ? 'active' : ''}`} onClick={() => getGame()?.setTransitMode('line')} title="Durakları sırayla seçin; ilk durağa ya da Enter: hattı aç" data-testid="transit-mode-line">
          Hat çiz
        </button>
        <button className="mode-btn" onClick={() => getGame()?.placeBusDepot()} title={`Otobüs garajı kur: her garaj ${DEPOT_BUSES} otobüs barındırır`} data-testid="transit-depot">
          Garaj
        </button>
      </div>
      <div className="divider vertical" />
      <div className="transit-lines" data-testid="transit-lines">
        {t.lines.length === 0 ? (
          <span className="muted small">Henüz hat yok. Garaj kurun, durak koyun, sonra "Hat çiz" ile durakları sırayla seçin.</span>
        ) : (
          t.lines.map((l) => {
            const editing = st.mode === 'edit' && st.editLine === l.id;
            return (
              <div key={l.id} className={`transit-line ${editing ? 'editing' : ''}`} data-testid="transit-line">
                <button className="line-swatch" style={{ background: l.color }} onClick={() => getGame()?.cycleLineColor(l.id)} title="Rengini değiştir" aria-label="Hat rengi" />
                <LineName id={l.id} name={l.name} />
                <span className="muted small">
                  {l.stops} durak · {l.km.toFixed(1)} km · {Math.round(l.riders).toLocaleString('tr-TR')}/{l.capacity.toLocaleString('tr-TR')} yolcu/gün
                  {l.transfers > 0 && ` · ${l.transfers} hatla aktarma`}
                  {!l.ok && <span className="text-red"> · duraklar arasında yol yok</span>}
                  {l.ok && l.running < l.buses && <span className="text-red"> · {l.buses - l.running} otobüs garajda yer yok</span>}
                </span>
                <button className={`mode-btn ${editing ? 'active' : ''}`} onClick={() => getGame()?.setTransitMode(editing ? 'line' : 'edit', l.id)} title="Durak ekle / çıkar: duraklara tıklayın" data-testid="transit-line-edit">
                  Düzenle
                </button>
                <button className="mode-btn" onClick={() => getGame()?.setLineBuses(l.id, l.buses - 1)} disabled={l.buses <= 0} title="Otobüs sat (yarı fiyatı iade)">−</button>
                <span className="line-buses" title="Otobüs sayısı">{l.buses} 🚌</span>
                <button className="mode-btn" onClick={() => getGame()?.setLineBuses(l.id, l.buses + 1)} title={`Otobüs al (${formatMoney(BUS_PRICE)}, günde ${formatMoney(BUS_DAILY_UPKEEP)} bakım)`} data-testid="transit-bus-add">+</button>
                <button className="icon-btn small" onClick={() => getGame()?.removeBusLine(l.id)} title="Hattı kapat (otobüsler yarı fiyatına satılır)">
                  <Icon name="close" size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="divider vertical" />
      <div className="transit-summary muted small">
        <div>{t.stops} durak · {Math.round(t.ridersPerDay).toLocaleString('tr-TR')} yolcu/gün</div>
        <div className={t.depotCapacity === 0 || t.buses > t.depotCapacity ? 'text-red' : ''} data-testid="transit-depots">
          {t.depotCapacity === 0 ? 'Garaj yok: otobüsler çalışmaz' : `Garaj: ${t.buses}/${t.depotCapacity} otobüs`}
        </div>
        <div>bilet {formatMoney(Math.round(t.faresPerDay))}/gün · işletme {formatMoney(Math.round(t.upkeepPerDay))}/gün</div>
        <div className="transit-hint">{st.hint ?? (st.mode === 'line' && st.draft.length ? `${st.draft.length} durak seçildi` : '')}</div>
      </div>
    </div>
  );
}

function PaintPicker() {
  const st = useGameStore((s) => s.paintTool);
  const set = (patch: Partial<PaintToolState>) => getGame()?.setPaintTool(patch);
  return (
    <div className="subtoolbar panel" data-testid="paint-picker">
      <div className="mode-group row" role="group" aria-label="Kaplama">
        {PAINTS.map((p) => (
          <button key={p.id} className={`mode-btn ${st.paint === p.id ? 'active' : ''}`} onClick={() => set({ paint: p.id })} title={`₺${p.price}/m²`} data-testid={`paint-${p.key}`}>
            <span className="surface-swatch" style={{ background: p.swatch }} aria-hidden />
            {p.name}
          </button>
        ))}
        <button className={`mode-btn ${st.paint === 0 ? 'active' : ''}`} onClick={() => set({ paint: 0 })} title="Kaplamayı sil (ücretsiz)" data-testid="paint-erase">
          <Icon name="demolish" size={14} /> Sil
        </button>
      </div>
      <div className="divider vertical" />
      <div className="mode-group row" role="group" aria-label="Fırça">
        {([2, 4, 8] as const).map((r) => (
          <button key={r} className={`mode-btn ${st.radius === r ? 'active' : ''}`} onClick={() => set({ radius: r })} title="Fırça yarıçapı ( [ / ] )">
            {r} m
          </button>
        ))}
      </div>
      <span className="muted small">Basılı tutup boyayın · yalnızca şehre ait kuru arazi · görünüm içindir · Ctrl+Z geri alır</span>
    </div>
  );
}

function DecorPicker() {
  const st = useGameStore((s) => s.decorTool);
  const [group, setGroup] = useState<PropGroup>(() => getProp(st.defId).group);
  const set = (patch: Partial<DecorToolState>) => getGame()?.setDecorTool(patch);
  return (
    <div className="subtoolbar panel" data-testid="decor-picker">
      <div className="mode-group" role="tablist" aria-label="Süs grupları">
        {PROP_GROUPS.map((g) => (
          <button key={g.id} role="tab" aria-selected={group === g.id} className={`mode-btn ${group === g.id ? 'active' : ''}`} onClick={() => setGroup(g.id)}>
            {g.name}
          </button>
        ))}
      </div>
      <div className="divider vertical" />
      {PROPS.filter((p) => p.group === group).map((p) => (
        <button key={p.id} className={`road-type road-card decor-card ${st.defId === p.id ? 'active' : ''}`} onClick={() => set({ defId: p.id })} data-testid={`decor-${p.id}`}>
          <span className="road-name">{p.name}</span>
          <span className="road-meta">{formatMoney(p.cost)}</span>
        </button>
      ))}
      <div className="divider vertical" />
      <span className="muted small decor-hint">
        {st.error ? <span className="text-red">{st.error}</span> : 'Tıklayın: yerleştir'} · R: döndür ({st.rot}°) · görünüm içindir
      </span>
    </div>
  );
}

const TERRAIN_OPS: { id: TerrainToolState['op']; name: string; hint: string }[] = [
  { id: 'raise', name: 'Yükselt', hint: 'Basılı tutun: zemin yükselir' },
  { id: 'lower', name: 'Alçalt', hint: 'Basılı tutun: zemin alçalır' },
  { id: 'flatten', name: 'Düzle', hint: 'Basmaya başladığınız noktanın yüksekliğine düzler' },
  { id: 'smooth', name: 'Yumuşat', hint: 'Engebeleri yumuşatır' },
  { id: 'pond', name: 'Gölet', hint: 'Su seviyesinin altına kazar; çukur suyla dolar' },
];

function TerrainPicker() {
  const st = useGameStore((s) => s.terrainTool);
  const set = (patch: Partial<TerrainToolState>) => getGame()?.setTerrainTool(patch);
  return (
    <div className="subtoolbar panel" data-testid="terrain-picker">
      <div className="mode-group row" role="group" aria-label="Arazi işlemi">
        {TERRAIN_OPS.map((o) => (
          <button key={o.id} className={`mode-btn ${st.op === o.id ? 'active' : ''}`} onClick={() => set({ op: o.id })} title={o.hint} data-testid={`terrain-op-${o.id}`}>
            {o.name}
          </button>
        ))}
      </div>
      <div className="divider vertical" />
      <div className="mode-group row" role="group" aria-label="Fırça boyutu">
        {(['S', 'M', 'L'] as const).map((s) => (
          <button key={s} className={`mode-btn ${st.size === s ? 'active' : ''}`} onClick={() => set({ size: s })} title={`Fırça yarıçapı ${TERRAIN_BRUSH[s]} m ( [ / ] )`} data-testid={`terrain-size-${s}`}>
            {s} · {TERRAIN_BRUSH[s]} m
          </button>
        ))}
      </div>
      <div className="divider vertical" />
      <label className="terrain-strength" title="Güç">
        Güç %{Math.round(st.strength * 100)}
        <input type="range" min={10} max={100} step={10} value={Math.round(st.strength * 100)} onChange={(e) => set({ strength: Number(e.target.value) / 100 })} data-testid="terrain-strength" />
      </label>
      <span className="muted small">Yol, bina ve satın alınmamış arazi değişmez · taşınan toprak ₺{TERRAIN_PRICE.toLocaleString('tr-TR')}/m³ · Ctrl+Z geri alır</span>
    </div>
  );
}

const TRAFFIC_MODES: { id: TrafficToolMode; name: string; hint: string; icon: IconName }[] = [
  { id: 'oneway', name: 'Tek yön', hint: 'Bir yol parçasına tıklayın: tek yön → ters yön → çift yön', icon: 'road' },
  { id: 'lights', name: 'Trafik lambası', hint: `Kavşağa sinyal kurun (${formatMoney(LIGHTS_COST)}). Yoğun kavşakları akıcı tutar; yayalar kırmızıda geçer.`, icon: 'traffic' },
  { id: 'stop', name: 'Dur levhası', hint: `Kavşağın tüm girişlerine dur levhası (${formatMoney(STOP_COST)}). Sakin kavşaklar için.`, icon: 'warning' },
  { id: 'roundabout', name: 'Döner kavşak', hint: 'En az 3 yolun birleştiği kavşağa tıklayın: kavşak tek yönlü bir halkaya dönüşür, araçlar kesişmeden döner. Halka yol fiyatına yapılır.', icon: 'roundabout' },
  { id: 'clear', name: 'Kaldır', hint: 'Kavşak kontrolünü kaldırın', icon: 'demolish' },
];

function TrafficPicker() {
  const st = useGameStore((s) => s.trafficTool);
  const t = st.target;
  return (
    <div className="subtoolbar panel" data-testid="traffic-picker">
      <div className="mode-group row" role="group" aria-label="Trafik düzenleme">
        {TRAFFIC_MODES.map((m) => (
          <button key={m.id} className={`mode-btn ${st.mode === m.id ? 'active' : ''}`} onClick={() => getGame()?.setTrafficMode(m.id)} title={m.hint} data-testid={`traffic-mode-${m.id}`}>
            <Icon name={m.icon} size={14} /> <span>{m.name}</span>
          </button>
        ))}
      </div>
      <div className="traffic-target" data-testid="traffic-target">
        {t ? (
          <>
            <strong>{t.name}</strong> <span className="muted small">{t.detail}</span>
            <div className="small">
              {t.action}
              {t.cost > 0 ? ` · ${formatMoney(t.cost)}` : ''}
            </div>
          </>
        ) : (
          <span className="muted small">{TRAFFIC_MODES.find((m) => m.id === st.mode)!.hint} · Tab: mod değiştir</span>
        )}
      </div>
    </div>
  );
}

const ZONE_HEX = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function ZonePicker() {
  const zt = useGameStore((s) => s.zoneTool);
  const maxPop = useGameStore((s) => (s.sandbox ? Infinity : s.maxPopulation));
  const set = (patch: Partial<ZoneToolState>) => getGame()?.setZoneTool(patch);
  return (
    <div className="subtoolbar panel" data-testid="zone-picker">
      {ZONES.map((z) => {
        const unlocked = maxPop >= z.unlockPopulation;
        return (
          <button
            key={z.id}
            className={`road-type zone-card ${zt.zone === z.type ? 'active' : ''} ${unlocked ? '' : 'locked'}`}
            disabled={!unlocked}
            onClick={() => set({ zone: z.type })}
            title={unlocked ? z.description : `Kilitli — ${formatNumber(z.unlockPopulation)} nüfusta açılır`}
            data-testid={`zone-${z.id}`}
          >
            <span className="zone-swatch" style={{ background: ZONE_HEX(z.color) }} />
            <span className="road-name">{z.name}</span>
            <span className="road-meta">
              {unlocked ? z.description.split('.')[0] : (<><Icon name="lock" size={11} /> {formatNumber(z.unlockPopulation)} nüfus</>)}
            </span>
          </button>
        );
      })}
      <button className={`road-type zone-card ${zt.zone === 0 ? 'active' : ''}`} onClick={() => set({ zone: 0 })} data-testid="zone-erase" title="Bölgeyi kaldır">
        <span className="zone-swatch erase" />
        <span className="road-name">Kaldır</span>
        <span className="road-meta">Bölgelemeyi sil</span>
      </button>
      <div className="divider vertical" />
      <div className="mode-group">
        <button className={`mode-btn ${zt.mode === 'fill' ? 'active' : ''}`} onClick={() => set({ mode: 'fill' })} data-testid="zone-mode-fill" title="İmleci yolun yanındaki boş alana getirin: yolun o tarafı seçilir (yolun üzerinde iki taraf). Tıklayın veya sürükleyin.">
          <Icon name="road" size={14} /> <span>Yol kenarı</span>
        </button>
        <button className={`mode-btn ${zt.mode === 'brush' ? 'active' : ''}`} onClick={() => set({ mode: 'brush' })} data-testid="zone-mode-brush" title="Sürükleyerek boya">
          <Icon name="zone" size={14} /> <span>Fırça</span>
        </button>
      </div>
      <div className="divider vertical" />
      <StylePicker />
      {zt.zone !== 0 && <DistrictRulesPicker />}
      <div className="stepper" title={zt.mode === 'fill' ? 'Parsel derinliği (hücre)' : 'Fırça boyutu'}>
        <span className="stepper-label">{zt.mode === 'fill' ? 'Derinlik' : 'Fırça'}</span>
        <div className="stepper-row">
          <button onClick={() => set(zt.mode === 'fill' ? { depth: Math.max(1, zt.depth - 1) } : { brush: Math.max(1, zt.brush - 1) })} aria-label="Azalt">−</button>
          <strong data-testid="zone-size">{zt.mode === 'fill' ? `${zt.depth} hücre` : `${zt.brush * 2 - 1}×${zt.brush * 2 - 1}`}</strong>
          <button onClick={() => set(zt.mode === 'fill' ? { depth: Math.min(4, zt.depth + 1) } : { brush: Math.min(3, zt.brush + 1) })} aria-label="Artır">+</button>
        </div>
      </div>
    </div>
  );
}

const WEALTH_OPTIONS = [
  { v: 0, name: 'Karışık', tip: 'Her gelir düzeyinden evler' },
  { v: 1, name: 'Mütevazı', tip: 'Sıra evler, lojmanlar, toplu konut: çok sakin, küçük daireler' },
  { v: 2, name: 'Orta', tip: 'Apartmanlar, avlulu bloklar, kent evleri' },
  { v: 3, name: 'Varlıklı', tip: 'Villalar, konaklar, rezidanslar: az sakin, arazi değerini yükseltir' },
] as const;
const HEIGHT_OPTIONS = [
  { v: 0, name: 'Sınırsız', tip: 'Kuleler dahil her yükseklik' },
  { v: 1, name: 'Alçak', tip: 'En çok 3 kat: binalar bu sınırı aşan seviyeye yükselemez' },
  { v: 2, name: 'Orta', tip: 'En çok 7 kat' },
] as const;

/** What the zone asks of the buildings growing in it: who they are for and how tall they may get. */
function DistrictRulesPicker() {
  const zt = useGameStore((s) => s.zoneTool);
  const set = (patch: Partial<ZoneToolState>) => getGame()?.setZoneTool(patch);
  return (
    <div className="style-picker" data-testid="district-rules">
      {zt.zone === 1 && (
        <>
          <span className="stepper-label">Refah</span>
          <div className="style-row" role="group" aria-label="Refah">
            {WEALTH_OPTIONS.map((o) => (
              <button key={o.v} className={`style-btn ${zt.wealth === o.v ? 'active' : ''}`} onClick={() => set({ wealth: o.v })} title={o.tip} data-testid={`wealth-${o.v}`}>
                {o.name}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="stepper-label">Kat sınırı</span>
      <div className="style-row" role="group" aria-label="Kat sınırı">
        {HEIGHT_OPTIONS.map((o) => (
          <button key={o.v} className={`style-btn ${zt.height === o.v ? 'active' : ''}`} onClick={() => set({ height: o.v })} title={o.tip} data-testid={`height-${o.v}`}>
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Architecture for zoning and hand-placed buildings (shared by both tools). */
function StylePicker() {
  const style = useGameStore((s) => s.zoneTool.style);
  const pick = (id: ArchStyle) => getGame()?.setZoneTool({ style: id });
  return (
    <div className="style-picker" role="group" aria-label="Mimari stil" data-testid="style-picker">
      <span className="stepper-label">Stil</span>
      <div className="style-row">
        {ARCH_STYLES.map((id) => {
          const d = ARCH_STYLE_DEFS[id];
          return (
            <button key={id} className={`style-btn ${style === id ? 'active' : ''}`} onClick={() => pick(id)} title={`${d.name}: ${d.description}`} data-testid={`style-${id}`}>
              <span className="style-swatch" aria-hidden>
                {d.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span>{d.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What a card shows under the name: production, coverage or footprint. */
function buildingMeta(b: BuildingDef): string {
  if (b.utility?.power) return `${(b.utility.power / 1000).toFixed(1)} MW · ${formatMoney(b.cost)}`;
  if (b.utility?.water) return `${b.utility.water} m³ su · ${formatMoney(b.cost)}`;
  if (b.utility?.sewage) return `${b.utility.sewage} m³ atık · ${formatMoney(b.cost)}`;
  if (b.service) return `${b.service.radius * 8} m · ${formatMoney(b.cost)}`;
  return `${b.footprint[0]}×${b.footprint[1]} hücre · ${formatMoney(b.cost)}`;
}

const LINE_TOOL = { power: 'powerline', water: 'pipe' } as const;

function InfraPicker({ group, lineKind }: { group: 'power' | 'water' | 'service'; lineKind?: 'power' | 'pipe' }) {
  const buildingType = useGameStore((s) => s.buildingType);
  const tool = useGameStore((s) => s.tool);
  const maxPop = useGameStore((s) => (s.sandbox ? Infinity : s.maxPopulation));
  const lineTool = group === 'power' ? LINE_TOOL.power : group === 'water' ? LINE_TOOL.water : null;
  const buildingTool = group === 'service' ? 'services' : group;
  const catalog = useCatalog(buildingsInGroup(group));
  return (
    <div className="subtoolbar panel" data-testid={`picker-${group}`}>
      {catalog.controls}
      {lineKind && lineTool && (
        <button
          className={`road-type building-card line-card ${tool === lineTool ? 'active' : ''}`}
          onClick={() => getGame()?.setTool(lineTool)}
          title={LINE_TYPES[lineKind].description}
          data-testid={`line-tool-${lineKind}`}
        >
          <span className="road-name">{LINE_TYPES[lineKind].name}</span>
          <span className="road-meta">{formatMoney(LINE_TYPES[lineKind].costPerMeter)}/m · çizerek</span>
        </button>
      )}
      {catalog.empty}
      {catalog.items.map((b) => {
        const locked = maxPop < b.unlockPopulation;
        return (
          <button
            key={b.id}
            className={`road-type building-card ${tool === buildingTool && b.id === buildingType ? 'active' : ''} ${locked ? 'locked' : ''}`}
            disabled={locked}
            onClick={() => {
              if (tool !== buildingTool) getGame()?.setTool(buildingTool);
              getGame()?.setBuildingType(b.id);
            }}
            title={locked ? `${formatNumber(b.unlockPopulation)} nüfusta açılır` : b.description}
            data-testid={`building-type-${b.id}`}
          >
            <Thumb id={b.id} />
            <span className="road-name">{b.name}</span>
            <FavStar id={b.id} />
            <span className="road-meta">
              {locked ? (
                <>
                  <Icon name="lock" size={11} /> {formatNumber(b.unlockPopulation)} nüfus
                </>
              ) : (
                buildingMeta(b)
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LayersPopover() {
  const open = useGameStore((s) => s.layersOpen);
  const layer = useGameStore((s) => s.infoLayer);
  if (!open) return null;
  return (
    <div className="subtoolbar panel layers" data-testid="layers">
      <button className={`layer-btn ${layer === null ? 'active' : ''}`} onClick={() => getGame()?.setInfoLayer(null)}>
        Kapalı
      </button>
      {INFO_LAYERS.map((l) => (
        <button
          key={l.id}
          className={`layer-btn ${layer === l.id ? 'active' : ''}`}
          onClick={() => getGame()?.setInfoLayer(l.id)}
          data-testid={`layer-${l.id}`}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}

const BUILD_TABS = [
  { id: 'landmark', name: 'Simgeler', zone: 0 },
  { id: 'res', name: 'Konut', zone: 1 },
  { id: 'com', name: 'Ticaret', zone: 2 },
  { id: 'ind', name: 'Sanayi', zone: 3 },
  { id: 'off', name: 'Ofis', zone: 4 },
] as const;

type HeightBand = 'all' | 'low' | 'mid' | 'high';

const HEIGHT_BANDS: { id: HeightBand; name: string; hint: string }[] = [
  { id: 'all', name: 'Hepsi', hint: 'Tüm binalar' },
  { id: 'low', name: 'Alçak', hint: '1–2 kat' },
  { id: 'mid', name: 'Az katlı', hint: '3–5 kat' },
  { id: 'high', name: 'Yüksek', hint: '6 kat ve üzeri' },
];

function inBand(b: BuildingDef, band: HeightBand): boolean {
  if (band === 'all') return true;
  const s = storeysOf(b);
  return band === 'low' ? s <= 2 : band === 'mid' ? s >= 3 && s <= 5 : s >= 6;
}

function BuildingPicker() {
  const buildingType = useGameStore((s) => s.buildingType);
  const maxPop = useGameStore((s) => (s.sandbox ? Infinity : s.maxPopulation));
  const current = ZONED_BUILDINGS.find((b) => b.id === buildingType);
  const [tab, setTab] = useState<(typeof BUILD_TABS)[number]['id']>(current ? BUILD_TABS.find((t) => t.zone === current.zone)!.id : 'landmark');
  const zone = BUILD_TABS.find((t) => t.id === tab)!.zone;
  const style = useGameStore((s) => s.zoneTool.style);
  const [height, setHeight] = useState<HeightBand>('all');
  const zoneList = ZONED_BUILDINGS.filter((b) => b.zone === zone);
  const catalog = useCatalog(zone === 0 ? buildingsInGroup('landmark') : zoneList.filter((b) => inBand(b, height)));
  const choose = (id: (typeof BUILD_TABS)[number]['id']) => {
    setTab(id);
    const z = BUILD_TABS.find((t) => t.id === id)!.zone;
    const first = z ? ZONED_BUILDINGS.find((b) => b.zone === z) : buildingsInGroup('landmark')[0];
    if (first) getGame()?.setBuildingType(first.id);
  };
  return (
    <div className="subtoolbar panel building-picker" data-testid="building-types">
      <div className="tabs build-tabs" role="tablist">
        {BUILD_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => choose(t.id)} data-testid={`build-tab-${t.id}`}>
            {t.name}
          </button>
        ))}
      </div>
      {zone !== 0 && (
        <div className="mode-group height-bands" role="group" aria-label="Kat sayısı">
          {HEIGHT_BANDS.map((h) => (
            <button
              key={h.id}
              className={`mode-btn ${height === h.id ? 'active' : ''}`}
              onClick={() => setHeight(h.id)}
              title={h.hint}
              data-testid={`height-band-${h.id}`}
            >
              <span>{zone === 1 && h.id === 'low' ? 'Evler' : h.name}</span>
              <span className="count">{zoneList.filter((b) => inBand(b, h.id)).length}</span>
            </button>
          ))}
        </div>
      )}
      {catalog.controls}
      {catalog.empty}
      {zone === 0 ? (
        <LandmarkCards buildingType={buildingType} items={catalog.items} />
      ) : (
        <>
          <div className="growable-cards">
            {catalog.items.map((b) => {
              const locked = maxPop < (ZONES.find((z) => z.type === zone)?.unlockPopulation ?? 0);
              const people = b.residents ? `${b.residents} kişi` : `${b.workers} iş`;
              return (
                <button
                  key={b.id}
                  className={`road-type building-card ${b.id === buildingType ? 'active' : ''} ${locked ? 'locked' : ''}`}
                  disabled={locked}
                  onClick={() => getGame()?.setBuildingType(b.id)}
                  title={`${b.name} — ${b.level}. seviye, ${people}. Elle yerleştirilir, bölgesi kendiliğinden atanır.`}
                  data-testid={`building-type-${b.id}`}
                >
                  <Thumb id={b.id} style={style} />
                  <span className="road-name">{b.name}</span>
                  <FavStar id={b.id} />
                  <span className="road-meta">
                    Sv {b.level} · {b.footprint[0]}×{b.footprint[1]} · {people} · {formatMoney(growablePrice(b))}
                  </span>
                </button>
              );
            })}
          </div>
          <StylePicker />
        </>
      )}
    </div>
  );
}

function LandmarkCards({ buildingType, items }: { buildingType: string; items: BuildingDef[] }) {
  return (
    <>
      {items.map((b) => (
        <button
          key={b.id}
          className={`road-type building-card ${b.id === buildingType ? 'active' : ''}`}
          onClick={() => getGame()?.setBuildingType(b.id)}
          title={b.description}
          data-testid={`building-type-${b.id}`}
        >
          <Thumb id={b.id} />
          <span className="road-name">{b.name}</span>
          <FavStar id={b.id} />
          <span className="road-meta">
            {b.footprint[0]}×{b.footprint[1]} hücre · {formatMoney(b.cost)}
          </span>
          {b.unique && <span className="badge">Tek</span>}
        </button>
      ))}
      <div className="subtoolbar-note">Konut, ticaret ve sanayi binaları bölgelemeyle (Z) kendiliğinden gelişir ya da yandaki sekmelerden tek tek yerleştirilir.</div>
    </>
  );
}

function LayersButton() {
  const open = useGameStore((s) => s.layersOpen);
  const layer = useGameStore((s) => s.infoLayer);
  const set = useGameStore((s) => s.set);
  return (
    <button
      className={`tool ${open || layer ? 'active' : ''}`}
      onClick={() => set({ layersOpen: !open })}
      title="Bilgi katmanları (L)"
      data-testid="tool-layers"
    >
      <Icon name="layers" size={22} />
      <span className="tool-label">Katmanlar</span>
      <kbd>L</kbd>
    </button>
  );
}

export function Toolbar() {
  const tool = useGameStore((s) => s.tool);
  const grid = useGameStore((s) => s.grid);
  const undoState = useGameStore((s) => s.undoState);

  return (
    <div className="toolbar-wrap">
      {tool === 'road' && <RoadPicker />}
      {tool === 'building' && <BuildingPicker />}
      {tool === 'zone' && <ZonePicker />}
      {tool === 'demolish' && <DemolishPicker />}
      {tool === 'traffic' && <TrafficPicker />}
      {tool === 'terrain' && <TerrainPicker />}
      {tool === 'paint' && <PaintPicker />}
      {tool === 'transit' && <TransitPicker />}
      {tool === 'decor' && <DecorPicker />}
      {(tool === 'power' || tool === 'powerline') && <InfraPicker group="power" lineKind="power" />}
      {(tool === 'water' || tool === 'pipe') && <InfraPicker group="water" lineKind="pipe" />}
      {tool === 'services' && <InfraPicker group="service" />}
      <LayersPopover />
      <nav className="toolbar panel" aria-label="İnşaat araçları">
        {TOOLS.map((t) => {
          const available = t.tool !== undefined;
          const active = available && (tool === t.tool || (t.tool === 'power' && tool === 'powerline') || (t.tool === 'water' && tool === 'pipe'));
          return (
            <button
              key={t.id}
              className={`tool ${active ? 'active' : ''} ${available ? '' : 'locked'} ${t.id === 'demolish' ? 'danger' : ''}`}
              disabled={!available}
              onClick={() => t.tool && getGame()?.setTool(t.tool)}
              title={available ? `${t.label} (${t.hotkey})` : `${t.label} — Aşama ${t.phase} ile gelecek`}
              data-testid={`tool-${t.id}`}
            >
              <Icon name={t.icon} size={22} />
              <span className="tool-label">{t.label}</span>
              {available ? <kbd>{t.hotkey}</kbd> : <span className="tool-lock"><Icon name="lock" size={10} /></span>}
            </button>
          );
        })}
        <div className="divider vertical" />
        <button
          className="tool"
          disabled={!undoState.undo}
          onClick={() => getGame()?.undo()}
          title={undoState.undo ? `Geri al: ${undoState.undo} (Ctrl+Z)` : 'Geri alınacak bina işlemi yok'}
          data-testid="tool-undo"
        >
          <Icon name="undo" size={22} />
          <span className="tool-label">Geri al</span>
          <kbd>⌃Z</kbd>
        </button>
        <button
          className="tool"
          disabled={!undoState.redo}
          onClick={() => getGame()?.redo()}
          title={undoState.redo ? `Yinele: ${undoState.redo} (Ctrl+Y)` : 'Yinelenecek işlem yok'}
          data-testid="tool-redo"
        >
          <Icon name="redo" size={22} />
          <span className="tool-label">Yinele</span>
          <kbd>⌃Y</kbd>
        </button>
        <div className="divider vertical" />
        <button
          className={`tool ${grid ? 'active' : ''}`}
          onClick={() => getGame()?.toggleGrid()}
          title="Izgarayı göster/gizle (G)"
          data-testid="tool-grid"
        >
          <Icon name="grid" size={22} />
          <span className="tool-label">Izgara</span>
          <kbd>G</kbd>
        </button>
        <LayersButton />
        <button className="tool" onClick={() => getGame()?.centerCamera()} title="Şehir merkezine dön (C / Home)" data-testid="tool-home">
          <Icon name="home" size={22} />
          <span className="tool-label">Merkez</span>
          <kbd>C</kbd>
        </button>
      </nav>
    </div>
  );
}
