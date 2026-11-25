import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

const hours = (days: number) => (days >= 1 ? `${days.toFixed(1)} gün` : `${Math.max(1, Math.round(days * 24))} saat`);

/** A citizen's petition waiting for the mayor's answer. */
export function PetitionCard() {
  const p = useGameStore((s) => s.petitions.open);
  if (!p) return null;
  return (
    <div className="panel petition-card" data-testid="petition-card" role="dialog" aria-label="Vatandaş dilekçesi">
      <div className="petition-head">
        <Icon name="people" size={14} />
        <span>Başkana bir dilekçe geldi</span>
        <span className="muted small">yanıt için {hours(p.daysLeft)}</span>
      </div>
      <div className="petition-author">{p.author}</div>
      <p className="petition-text">«{p.text}»</p>
      <p className="petition-ask small">
        İstek: <strong>{p.ask}</strong>. Söz verirseniz 7 gün içinde yapmanız gerekir; tutulan söz güveni artırır, tutulmayan çok düşürür.
      </p>
      <div className="petition-actions">
        <button className="btn primary" onClick={() => getGame()?.answerPetition(p.id, true)} data-testid="petition-promise">
          Söz ver
        </button>
        <button className="btn" onClick={() => getGame()?.answerPetition(p.id, false)} data-testid="petition-refuse">
          Reddet
        </button>
        <button className="btn ghost" onClick={() => getGame()?.focusPetition(p.id)} title="Kameraya evi göster">
          <Icon name="target" size={13} /> Nerede
        </button>
      </div>
    </div>
  );
}

/** Promises in progress and the residents' trust (inside the advisors panel). */
export function PetitionSummary() {
  const v = useGameStore((s) => s.petitions);
  if (!v.promised.length && !v.recent.length && v.trust === 0) return null;
  const STATE: Record<string, string> = { kept: 'tutuldu', broken: 'tutulmadı', refused: 'reddedildi', expired: 'yanıtsız' };
  return (
    <div className="petition-summary" data-testid="petition-summary">
      <div className="petition-trust">
        Belediyeye güven <strong className={v.trust < 0 ? 'text-red' : ''}>{v.trust >= 0 ? '+' : ''}{v.trust.toFixed(1)}</strong>
        <span className="muted small"> (mutluluğa {v.happiness >= 0 ? '+' : ''}{v.happiness.toFixed(1)})</span>
      </div>
      {v.promised.map((p) => (
        <div key={p.id} className="petition-row">
          <span>Söz: {p.ask}</span>
          <span className="muted small">{p.daysLeft.toFixed(1)} gün kaldı</span>
          <button className="icon-btn small" onClick={() => getGame()?.focusPetition(p.id)} title="Göster">
            <Icon name="target" size={12} />
          </button>
        </div>
      ))}
      {v.recent.map((p) => (
        <div key={p.id} className="petition-row muted small">
          <span>{p.ask}</span>
          <span className={p.state === 'kept' ? 'text-green' : 'text-red'}>{STATE[p.state]}</span>
        </div>
      ))}
    </div>
  );
}
