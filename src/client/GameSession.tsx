import { useMemo } from "react";
import { generateCity, generateOrders } from "../shared/city";
import { ArcadeAudio } from "./game/ArcadeAudio";
import { Game } from "./game/Game";
import { useGameStore } from "./store";
import { Countdown, HUD, Lobby, WinnerScreen } from "./ui/Overlays";
import { PerfOverlay } from "./ui/PerfOverlay";

export default function GameSession() {
  const phase = useGameStore((state) => state.phase);
  const seed = useGameStore((state) => state.seed);
  // Same per-seed cache idea as RaceRoom.route(): generate the city once for this session.
  const world = useMemo(
    () =>
      seed === undefined
        ? undefined
        : { seed, city: generateCity(seed), orders: generateOrders(seed) },
    [seed],
  );
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
      {world ? <Game seed={world.seed} city={world.city} orders={world.orders} /> : null}
      <Lobby />
      <HUD city={world?.city} orders={world?.orders} />
      {phase === "countdown" || phase === "racing" ? <Countdown /> : null}
      {phase === "finished" ? <WinnerScreen /> : null}
      <PerfOverlay />
    </div>
  );
}
