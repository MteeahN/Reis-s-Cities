import { INFO_LAYERS } from '../../game/rendering/InfoLayers';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

/** Active info layer name + colour legend, with a close button. */
export function LayerLegend() {
  const layer = useGameStore((s) => s.infoLayer);
  const def = INFO_LAYERS.find((l) => l.id === layer);
  if (!def) return null;
  return (
    <div className="panel layer-legend" data-testid="layer-legend">
      <Icon name="layers" size={14} />
      <strong>{def.name}</strong>
      {def.legend.map(([color, label]) => (
        <span key={label} className="legend-item">
          <i style={{ background: color }} />
          {label}
        </span>
      ))}
      <button className="icon-btn small" onClick={() => getGame()?.setInfoLayer(null)} title="Katmanı kapat">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
