import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

/**
 * First-city guide. Each step is ticked off by the real city state (the
 * matching mission's progress), never by a timer or a click on "next".
 */
const STEPS = [
  { mission: 'first_road', title: 'Yol çizin', text: 'Yollar (Y) aracını seçip haritaya sürükleyerek bir cadde çizin. Şehir girişindeki otoyola bağlayın.' },
  { mission: 'first_zone', title: 'Konut bölgesi açın', text: 'Bölgeleme (Z) → Konut. Yolun iki yanını boyayın; evler yalnızca yola bakan hücrelerde gelişir.' },
  { mission: 'first_power', title: 'Elektrik verin', text: 'Elektrik (P) menüsünden bir santral kurun; uzak bölgeler için elektrik hattı çekin.' },
  { mission: 'first_water', title: 'Su verin', text: 'Su (U) menüsünden kıyıya bir su pompası kurup borularla mahalleye bağlayın.' },
  { mission: 'first_residents', title: 'İlk sakinleri bekleyin', text: 'Konut talebi doluysa evler inşa edilir ve sakinler taşınır. Hızı 2× veya 3× yapabilirsiniz.' },
  { mission: 'mixed_city', title: 'İş yerleri açın', text: 'Ticaret ve sanayi bölgeleri çizin. Sakinlerin çalışacak ve alışveriş yapacak yerlere ihtiyacı var.' },
] as const;

export function Tutorial() {
  const enabled = useGameStore((s) => s.settings.gameplay.tutorial);
  const achievements = useGameStore((s) => s.achievements);
  if (!enabled || achievements.length === 0) return null;
  const done = (id: string) => {
    const a = achievements.find((x) => x.id === id);
    return !!a && (a.earnedAt !== null || a.progress >= 0.99);
  };
  const index = STEPS.findIndex((s) => !done(s.mission));
  if (index < 0) return null;
  const step = STEPS[index];
  const close = () => getGame()?.setGameplay({ tutorial: false });
  return (
    <aside className="panel tutorial" data-testid="tutorial" aria-live="polite">
      <div className="tutorial-head">
        <span className="chip">
          Öğretici {index + 1} / {STEPS.length}
        </span>
        <button className="icon-btn small" onClick={close} title="Öğreticiyi kapat (Ayarlar'dan yeniden açılır)" data-testid="tutorial-close">
          <Icon name="close" size={14} />
        </button>
      </div>
      <strong className="tutorial-title">{step.title}</strong>
      <p className="tutorial-text">{step.text}</p>
      <ol className="tutorial-steps">
        {STEPS.map((s, n) => (
          <li key={s.mission} className={done(s.mission) ? 'done' : n === index ? 'current' : ''}>
            {s.title}
          </li>
        ))}
      </ol>
    </aside>
  );
}
