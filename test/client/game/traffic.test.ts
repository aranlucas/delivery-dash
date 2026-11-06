import assert from "node:assert/strict";
import { test } from "vitest";
import { trafficCars, updateTraffic } from "@/client/game/traffic.ts";
import { WORLD_HALF, type City } from "@/shared/city.ts";

test("traffic follows the room clock on both axes and wraps at the island edge", () => {
  const city: Pick<City, "trafficRoutes"> = {
    trafficRoutes: [
      { axis: "x", cross: 10, offset: WORLD_HALF - 2, direction: 1, speed: 5, color: "red" },
      { axis: "z", cross: -10, offset: -WORLD_HALF + 2, direction: -1, speed: 5, color: "blue" },
    ],
  };

  updateTraffic(city, 1);
  assert.deepEqual(trafficCars, [
    { x: -WORLD_HALF + 3, z: 10, yaw: Math.PI / 2 },
    { x: -10, z: WORLD_HALF - 3, yaw: Math.PI },
  ]);
  const first = trafficCars[0];
  updateTraffic({ trafficRoutes: city.trafficRoutes.slice(0, 1) }, 0);
  assert.equal(trafficCars.length, 1, "changing cities removes old traffic");
  assert.equal(trafficCars[0], first, "frame consumers retain a stable car reference");
  assert.equal(first.x, WORLD_HALF - 2, "positions depend on clock time, not previous frames");
});
