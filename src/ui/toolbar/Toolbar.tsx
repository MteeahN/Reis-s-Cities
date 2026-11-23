import type { RoadMode, ToolId, ZoneToolState } from '../../game/core/events';
import { ZONES } from '../../game/data/zones';
import { buildingsInGroup, type BuildingDef } from '../../game/data/buildings';
import { LINE_TYPES } from '../../game/data/infrastructure';
import { INFO_LAYERS } from '../../game/rendering/InfoLayers';
import { ROAD_TYPES, isRoadTypeUnlocked } from '../../game/data/roads';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { formatMoney, formatNumber } from '../../utils/format';
import { Icon, type IconName } from '../components/Icon';

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
  return (
    <div className="subtoolbar panel" data-testid={`picker-${group}`}>
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
      {buildingsInGroup(group).map((b) => {
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

function BuildingPicker() {
  const buildingType = useGameStore((s) => s.buildingType);
  return (
    <div className="subtoolbar panel" data-testid="building-types">
      {buildingsInGroup('landmark').map((b) => (
        <button
          key={b.id}
          className={`road-type building-card ${b.id === buildingType ? 'active' : ''}`}
          onClick={() => getGame()?.setBuildingType(b.id)}
          title={b.description}
          data-testid={`building-type-${b.id}`}
        >
          <span className="road-name">{b.name}</span>
          <span className="road-meta">
            {b.footprint[0]}×{b.footprint[1]} hücre · {formatMoney(b.cost)}
          </span>
          {b.unique && <span className="badge">Tek</span>}
        </button>
      ))}
      <div className="subtoolbar-note">
        Konut, ticaret ve sanayi binaları bölgeleme aracıyla (Z) kendiliğinden gelişir.
      </div>
    </div>
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

  return (
    <div className="toolbar-wrap">
      {tool === 'road' && <RoadPicker />}
      {tool === 'building' && <BuildingPicker />}
      {tool === 'zone' && <ZonePicker />}
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
