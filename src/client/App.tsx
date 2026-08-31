import { lazy, Suspense } from "react";
import { useGameStore } from "./store";
import { Menu } from "./ui/Menu";

let gameSessionPromise: ReturnType<typeof importGameSession> | undefined;

function importGameSession() {
  return import("./GameSession");
}

function loadGameSession() {
  gameSessionPromise ??= importGameSession();
  return gameSessionPromise;
}

const GameSession = lazy(loadGameSession);

function GameLoading() {
  return (
    <main className="arcade-menu">
      <div className="menu-speed-lines" aria-hidden="true" />
      <section
        className="arcade-panel game-loading"
        role="status"
        aria-live="polite"
      >
        <span>LOADING CITY</span>
        <strong>PREPARING THE STARTING GRID...</strong>
      </section>
    </main>
  );
}

export function App() {
  const screen = useGameStore((s) => s.screen);
  if (screen === "menu")
    return <Menu onGameIntent={() => void loadGameSession()} />;
  return (
    <Suspense fallback={<GameLoading />}>
      <GameSession />
    </Suspense>
  );
}
