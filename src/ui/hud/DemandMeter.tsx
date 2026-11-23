import { memo } from 'react';
import { ZONES } from '../../game/data/zones';
import { useGameStore } from '../../store/gameStore';

/** RCI demand bars (0–100), coloured like the zones. */
export const DemandMeter = memo(function DemandMeter() {
  const demand = useGameStore((s) => s.demand);
  const maxPop = useGameStore((s) => (s.sandbox ? Infinity : s.maxPopulation));
  const values = [demand.residential, demand.commercial, demand.industrial];
  return (
    <div className="panel demand" data-testid="demand" title="Bölge talebi: binalar talep olan bölgelerde gelişir">
      <div className="demand-title">Talep</div>
      <div className="demand-bars">
        {ZONES.map((z, i) => {
          const locked = maxPop < z.unlockPopulation;
          return (
            <div key={z.id} className={`demand-col ${locked ? 'locked' : ''}`} title={locked ? `${z.name}: ${z.unlockPopulation} nüfusta açılır` : `${z.name}: ${Math.round(values[i])}`}>
              <div className="demand-track">
                <span style={{ height: `${Math.max(2, values[i])}%`, background: `#${z.color.toString(16).padStart(6, '0')}` }} />
              </div>
              <span className="demand-label">{z.short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
