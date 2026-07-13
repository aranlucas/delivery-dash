import { Game } from "./game/Game";
import { ArcadeAudio } from "./game/ArcadeAudio";
import { Countdown, HUD, Lobby, Menu, WinnerScreen } from "./ui/Overlays";
import { useGameStore } from "./store";

export function App() {
  const screen = useGameStore((s) => s.screen);
  const phase = useGameStore((s) => s.phase);
  if (screen === "menu") return <Menu />;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        color: "white",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <ArcadeAudio />
      <Game />
      <Lobby />
      <HUD />
      {(phase === "countdown" || phase === "racing") && <Countdown />}
      {phase === "finished" && <WinnerScreen />}
    </div>
  );
}
