import { useGameStore } from '../../store/gameStore';
import { formatGameDate } from '../../utils/format';
import { Icon } from '../components/Icon';

export function AchievementsPanel() {
  const sandbox = useGameStore((s) => s.sandbox);
  const open = useGameStore((s) => s.popup === 'achievements');
  const list = useGameStore((s) => s.achievements);
  const set = useGameStore((s) => s.set);
  if (!open) return null;
  const earned = list.filter((a) => a.earnedAt !== null).length;
  // Earned first (newest first), then the closest to completion.
  const sorted = [...list].sort((a, b) => {
    if ((a.earnedAt !== null) !== (b.earnedAt !== null)) return a.earnedAt !== null ? -1 : 1;
    if (a.earnedAt !== null && b.earnedAt !== null) return b.earnedAt - a.earnedAt;
    return b.progress - a.progress;
  });
  return (
    <div className="panel popover achievements-panel" data-testid="achievements-panel">
      <div className="panel-header">
        <h3>
          <Icon name="trophy" size={16} /> Başarımlar
        </h3>
        <span className="muted small" data-testid="achievements-count">
          {earned} / {list.length}
        </span>
        <button className="icon-btn small" onClick={() => set({ popup: null })} title="Kapat">
          <Icon name="close" size={14} />
        </button>
      </div>
      {sandbox && <p className="hint" data-testid="achievements-sandbox">Yaratıcı modda başarımlar kazanılmaz; ilerleme yalnızca gösterilir.</p>}
      <div className="bar">
        <span className="fill-green" style={{ width: `${list.length ? (earned / list.length) * 100 : 0}%` }} />
      </div>
      <ul className="achievement-list">
        {sorted.map((a) => {
          const done = a.earnedAt !== null;
          return (
            <li key={a.id} className={`achievement ${done ? 'done' : ''}`} data-testid={`achievement-${a.id}`} data-earned={done}>
              <div className="achievement-icon">
                <Icon name={done ? 'trophy' : 'lock'} size={16} />
              </div>
              <div className="achievement-text">
                <div className="achievement-title">{a.title}</div>
                <div className="achievement-desc">{a.description}</div>
                {done ? (
                  <div className="achievement-when">Kazanıldı: {formatGameDate(a.earnedAt!).date}</div>
                ) : (
                  <div className="achievement-progress">
                    <div className="bar thin">
                      <span className="fill-blue" style={{ width: `${a.progress * 100}%` }} />
                    </div>
                    <span>%{Math.floor(a.progress * 100)}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
