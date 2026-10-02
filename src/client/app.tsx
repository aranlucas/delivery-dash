import { lazy, Suspense } from "react";
import { useGameStore } from "./store";
import { Menu } from "./ui/menu";

let gameSessionPromise: ReturnType<typeof importGameSession> | undefined;

function importGameSession() {
  return import("./game-session");
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
      <output className="arcade-panel game-loading" aria-live="polite">
        <span>LOADING CITY</span>
        <strong>PREPARING THE STARTING GRID...</strong>
      </output>
    </main>
  );
}

export function App() {
  const screen = useGameStore((s) => s.screen);
  if (screen === "menu") return <Menu onGameIntent={() => void loadGameSession()} />;
  return (
    <Suspense fallback={<GameLoading />}>
      <GameSession />
    </Suspense>
  );
}
