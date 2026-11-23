import { useEffect, useRef } from 'react';
import { startGame, stopGame } from './store/gameBridge';
import { useGameStore } from './store/gameStore';
import { GameHud } from './ui/GameHud';
import { ErrorScreen, LoadingScreen } from './ui/menus/LoadingScreen';
import { MainMenu } from './ui/menus/MainMenu';
import { HudErrorBoundary } from './ui/ErrorBoundary';
import { Toasts } from './ui/notifications/Toasts';

/** Hosts the engine canvas. Mounting starts a city; unmounting disposes it. */
function GameView() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    void startGame(el);
    return () => stopGame();
  }, []);
  return <div ref={ref} className="game-root" data-testid="game-root" />;
}

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const inGame = screen === 'loading' || screen === 'playing';
  return (
    <>
      {inGame && <GameView />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'loading' && <LoadingScreen />}
      {screen === 'playing' && (
        <HudErrorBoundary>
          <GameHud />
        </HudErrorBoundary>
      )}
      {screen === 'error' && <ErrorScreen />}
      {screen !== 'playing' && <Toasts menu />}
    </>
  );
}
