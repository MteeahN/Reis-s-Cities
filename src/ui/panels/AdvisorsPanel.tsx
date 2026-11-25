import type { AdviceLevel } from '../../game/systems/Advisors';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

const LEVEL: Record<AdviceLevel, string> = { high: 'Acil', medium: 'Önemli', low: 'Öneri' };
const TOOL_LABEL: Record<string, string> = {
  power: 'Elektrik', water: 'Su', services: 'Hizmetler', zone: 'Bölgeleme', traffic: 'Trafik', select: 'Seç',
};

/** Advisors: what the city needs, from the simulation's own numbers, with the tool that fixes it. */
export function AdvisorsPanel() {
  const open = useGameStore((s) => s.popup === 'advisors');
  const advice = useGameStore((s) => s.advice);
  const set = useGameStore((s) => s.set);
  if (!open) return null;
  return (
    <div className="panel popover advisors-panel" data-testid="advisors-panel">
      <div className="panel-header">
        <h3>
          <Icon name="advisor" size={16} /> Danışmanlar
        </h3>
        <span className="muted small">{advice.length} konu</span>
        <button className="icon-btn small" onClick={() => set({ popup: null })} title="Kapat">
          <Icon name="close" size={14} />
        </button>
      </div>
      {advice.length === 0 ? (
        <p className="hint" data-testid="advisors-empty">Danışmanların şu an bir uyarısı yok: altyapı, hizmetler, iş, bütçe ve trafik yolunda.</p>
      ) : (
        <ul className="advice-list">
          {advice.map((a) => (
            <li key={a.id} className={`advice level-${a.level}`} data-testid="advice" data-id={a.id}>
              <div className="advice-head">
                <span className={`advice-level level-${a.level}`}>{LEVEL[a.level]}</span>
                <span className="advice-advisor">{a.advisor}</span>
              </div>
              <div className="advice-title">{a.title}</div>
              <p className="advice-text">{a.text}</p>
              <div className="advice-foot">
                <span className="muted small">{a.metric}</span>
                {a.tool && (
                  <button
                    className="feed-show"
                    onClick={() => {
                      getGame()?.setTool(a.tool!);
                      set({ popup: null });
                    }}
                    data-testid="advice-tool"
                  >
                    {TOOL_LABEL[a.tool] ?? 'Aracı aç'} aracını aç
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
