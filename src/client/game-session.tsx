import { useMemo } from "react";
import { generateCity, generateOrders } from "../shared/city";
import { ArcadeAudio } from "./game/arcade-audio";
import { Game } from "./game/game";
import { useGameStore } from "./store";
import { Countdown, HUD, Lobby, WinnerScreen } from "./ui/overlays";
import { PerfOverlay } from "./ui/perf-overlay";
import { CityViewOverlay } from "./ui/city-view";

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
      <CityViewOverlay />
      {phase === "countdown" || phase === "racing" ? <Countdown /> : null}
      {phase === "finished" ? <WinnerScreen /> : null}
      <PerfOverlay />
    </div>
  );
}
