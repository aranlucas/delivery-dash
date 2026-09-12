import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCity, generateOrders } from "./city.ts";
import {
  CHECKPOINT_COUNT,
  DEFAULT_MODE,
  GAME_MODE_IDS,
  GAME_MODES,
  RUSH_DURATION_MS,
  comparePlayers,
  getCheckpoints,
  getObjective,
  isGameMode,
} from "./gameModes.ts";

test("game mode registry has the stable public modes", () => {
  assert.deepEqual(GAME_MODE_IDS, ["delivery", "rush", "checkpoint", "free"]);
  assert.equal(DEFAULT_MODE, "delivery");
  assert.equal(RUSH_DURATION_MS, 180_000);
  for (const id of GAME_MODE_IDS) {
    assert.ok(GAME_MODES[id].name);
    assert.ok(GAME_MODES[id].description);
    assert.ok(GAME_MODES[id].tagline);
    assert.match(GAME_MODES[id].color, /^#[0-9a-f]{6}$/i);
    assert.equal(isGameMode(id), true);
  }
  assert.equal(isGameMode("unknown"), false);
  assert.equal(isGameMode(null), false);
});

for (const seed of [1, 99, 777, 2026, 12345]) {
  test(`checkpoint route is deterministic and reachable for seed ${seed}`, () => {
    const city = generateCity(seed);
    const checkpoints = getCheckpoints(city);
    assert.equal(checkpoints.length, CHECKPOINT_COUNT);
    assert.deepEqual(checkpoints, getCheckpoints(generateCity(seed)));
    for (const checkpoint of checkpoints) {
      assert.ok(city.restaurants.includes(checkpoint) || city.houses.includes(checkpoint));
      assert.ok(
        !city.buildingAABBs.some(
          (box) =>
            checkpoint.stop[0] > box.minX &&
            checkpoint.stop[0] < box.maxX &&
            checkpoint.stop[1] > box.minZ &&
            checkpoint.stop[1] < box.maxZ,
        ),
      );
    }
    for (let index = 1; index < checkpoints.length; index++)
      assert.ok(
        Math.hypot(
          checkpoints[index]!.stop[0] - checkpoints[index - 1]!.stop[0],
          checkpoints[index]!.stop[1] - checkpoints[index - 1]!.stop[1],
        ) >= 20,
        "consecutive checkpoints must not overlap their target radii",
      );
  });
}

test("delivery and rush objectives follow their distinct order rules", () => {
  const city = generateCity(2026);
  const orders = generateOrders(2026);
  const pickup = { orderIndex: 0, leg: "pickup" as const, checkpointIndex: 0 };
  assert.equal(
    getObjective("delivery", city, orders, pickup),
    city.restaurants[orders[0]!.restaurantId],
  );
  assert.equal(
    getObjective("rush", city, orders, { ...pickup, orderIndex: orders.length }),
    city.restaurants[orders[0]!.restaurantId],
  );
  assert.equal(getObjective("free", city, orders, pickup), undefined);
  assert.equal(getObjective("checkpoint", city, orders, pickup), getCheckpoints(city)[0]);
});

test("mode standings rank progress and keep timed ties honest", () => {
  const a = { id: "a", deliveries: 2, orderIndex: 3, checkpointIndex: 0 };
  const b = { id: "b", deliveries: 1, orderIndex: 4, checkpointIndex: 0 };
  assert.ok(comparePlayers("delivery", a, b) < 0);
  assert.ok(comparePlayers("rush", a, b) < 0);
  assert.ok(
    comparePlayers("checkpoint", { ...a, checkpointIndex: 4 }, { ...b, checkpointIndex: 5 }) > 0,
  );
  assert.equal(comparePlayers("free", a, b), -1);
});
