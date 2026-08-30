import { ArcadeAudio } from "./game/ArcadeAudio";
import { Game } from "./game/Game";
import { useGameStore } from "./store";
import { Countdown, HUD, Lobby, WinnerScreen } from "./ui/Overlays";
import { PerfOverlay } from "./ui/PerfOverlay";

export default function GameSession() {
  const phase = useGameStore((state) => state.phase);
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
      {phase === "countdown" || phase === "racing" ? <Countdown /> : null}
      {phase === "finished" ? <WinnerScreen /> : null}
      <PerfOverlay />
    </div>
  );
}
