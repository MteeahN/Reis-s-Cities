import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

/** Shown while walking the streets in first person: the controls and a way back. */
export function WalkHud() {
  const walking = useGameStore((s) => s.walking);
  if (!walking) return null;
  return (
    <div className="walk-hud panel" data-testid="walk-hud">
      <Icon name="walk" size={16} />
      <span>
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> yürü · <kbd>Shift</kbd> koş · haritaya tıklayıp fareyle bak (ya da <kbd>Q</kbd>/<kbd>E</kbd>) · <kbd>Esc</kbd> çık
      </span>
      <button className="btn" onClick={() => getGame()?.stopWalk()} data-testid="walk-exit">
        Şehre dön
      </button>
    </div>
  );
}
