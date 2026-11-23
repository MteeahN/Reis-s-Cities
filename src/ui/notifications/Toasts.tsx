import { useGameStore } from '../../store/gameStore';

/** In-game toasts (with the pause banner); `menu` shows them above the menu screens. */
export function Toasts({ menu = false }: { menu?: boolean }) {
  const toasts = useGameStore((s) => s.toasts);
  const dismiss = useGameStore((s) => s.dismissToast);
  const paused = useGameStore((s) => s.paused);
  return (
    <div className={menu ? 'toasts menu-toasts' : 'toasts'} aria-live="polite">
      {paused && !menu && (
        <div className="pause-banner" data-testid="pause-banner">
          DURAKLATILDI <span>Space ile devam</span>
        </div>
      )}
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} data-testid="toast">
          {t.text}
        </button>
      ))}
    </div>
  );
}
