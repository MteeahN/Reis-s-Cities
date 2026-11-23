import { useState } from 'react';
import type { DemolishFilter, RoadMode, ToolId, TrafficToolMode, ZoneToolState } from '../../game/core/events';
import { LIGHTS_COST, STOP_COST } from '../../game/tools/TrafficTool';
import { ZONES } from '../../game/data/zones';
import { buildingsInGroup, growablePrice, ZONED_BUILDINGS, type BuildingDef } from '../../game/data/buildings';
import { ARCH_STYLE_DEFS, ARCH_STYLES, type ArchStyle } from '../../game/data/styles';
import { LINE_TYPES } from '../../game/data/infrastructure';
import { INFO_LAYERS } from '../../game/rendering/InfoLayers';
import { ROAD_TYPES, isRoadTypeUnlocked } from '../../game/data/roads';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { formatMoney, formatNumber } from '../../utils/format';
import { Icon, type IconName } from '../components/Icon';
import { FavStar, useCatalog } from './catalog';

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
  { id: 'landscape', label: 'Peyzaj', icon: 'tree', phase: 7 },
  { id: 'traffic', label: 'Trafik', icon: 'traffic', tool: 'traffic', hotkey: 'K' },
  { id: 'move', label: 'Taşı', icon: 'move', tool: 'move', hotkey: 'M' },
  { id: 'demolish', label: 'Yıkım', icon: 'demolish', tool: 'demolish', hotkey: 'X' },
];

const MODES: { id: RoadMode; label: string; icon: IconName; hint: string }[] = [
  { id: 'straight', label: 'Düz', icon: 'road', hint: 'Tıkla-tıkla veya sürükle-bırak ile düz yol' },
  { id: 'curve', label: 'Kavisli', icon: 'curve', hint: 'Başlangıç → kontrol noktası → bitiş' },
  { id: 'upgrade', label: 'Yenile', icon: 'upgrade', hint: 'Mevcut bir yolu seçili türe dönüştür' },
];

function RoadPicker() {
  const roadType = useGameStore((s) => s.roadType);
  const roadMode = useGameStore((s) => s.roadMode);
  const population = useGameStore((s) => (s.sandbox ? Infinity : s.maxPopulation));
  return (
    <div className="subtoolbar panel" data-testid="road-types">
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
      {ROAD_TYPES.map((t) => {
        const unlocked = isRoadTypeUnlocked(t, population);
        const active = t.id === roadType;
        return (
          <button
            key={t.id}
            className={`road-type ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`}
            disabled={!unlocked}
            onClick={() => getGame()?.setRoadType(t.id)}
            data-testid={`road-type-${t.id}`}
            title={
              unlocked
                ? `${t.description}\nGenişlik ${t.width} m · ${t.lanes} şerit · ${t.speedKmh} km/s · ${formatNumber(t.capacity)} araç/saat`
                : `${formatNumber(t.unlockPopulation)} nüfusta açılır`
            }
          >
            <span className="road-swatch" style={{ background: `#${t.previewColor.toString(16).padStart(6, '0')}` }}>
              <span style={{ width: `${Math.min(100, t.width * 3.4)}%` }} />
            </span>
            <span className="road-name">{t.name}</span>
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

const TRAFFIC_MODES: { id: TrafficToolMode; name: string; hint: string; icon: IconName }[] = [
  { id: 'oneway', name: 'Tek yön', hint: 'Bir yol parçasına tıklayın: tek yön → ters yön → çift yön', icon: 'road' },
  { id: 'lights', name: 'Trafik lambası', hint: `Kavşağa sinyal kurun (${formatMoney(LIGHTS_COST)}). Yoğun kavşakları akıcı tutar; yayalar kırmızıda geçer.`, icon: 'traffic' },
  { id: 'stop', name: 'Dur levhası', hint: `Kavşağın tüm girişlerine dur levhası (${formatMoney(STOP_COST)}). Sakin kavşaklar için.`, icon: 'warning' },
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

function BuildingPicker() {
  const buildingType = useGameStore((s) => s.buildingType);
  const maxPop = useGameStore((s) => (s.sandbox ? Infinity : s.maxPopulation));
  const current = ZONED_BUILDINGS.find((b) => b.id === buildingType);
  const [tab, setTab] = useState<(typeof BUILD_TABS)[number]['id']>(current ? BUILD_TABS.find((t) => t.zone === current.zone)!.id : 'landmark');
  const zone = BUILD_TABS.find((t) => t.id === tab)!.zone;
  const catalog = useCatalog(zone === 0 ? buildingsInGroup('landmark') : ZONED_BUILDINGS.filter((b) => b.zone === zone));
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
