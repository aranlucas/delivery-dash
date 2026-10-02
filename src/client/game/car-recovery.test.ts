import assert from "node:assert/strict";
import { test } from "node:test";
import { blocked, generateCity, groundHeightAt, roadCenter } from "../../shared/city.ts";
import { findCarRecovery, isRecoverySpotClear } from "./car-recovery.ts";

test("recovery from buildings, ramps, roofs and map edges finds a flat clear nearby street", () => {
  for (const seed of [1, 99, 777, 2026, 12345]) {
    const city = generateCity(seed);
    const spawn = city.spawns[0]!;
    const fallback = { x: spawn.pos[0], z: spawn.pos[1], yaw: spawn.yaw };
    const positions = [
      ...city.buildings.filter((_, index) => index % 20 === 0),
      ...city.ramps,
      { x: 298, z: 298 },
      { x: -298, z: -298 },
    ];
    for (const pose of positions) {
      const recovered = findCarRecovery(city, { ...pose, yaw: Math.PI / 4 }, fallback);
      assert.equal(blocked(city, recovered.x, recovered.z, 0), false, `seed ${seed}`);
      assert.equal(groundHeightAt(city, recovered.x, recovered.z, 0), 0);
      assert.ok(isRecoverySpotClear(city, recovered.x, recovered.z, []));
      assert.ok(Math.hypot(recovered.x - pose.x, recovered.z - pose.z) < 85);
    }
  }
});

test("a clear street preserves the driving direction and avoids nearby traffic", () => {
  const city = generateCity(99);
  const pose = { x: roadCenter(3), z: roadCenter(4), yaw: Math.PI / 2 };
  const recovered = findCarRecovery(city, pose, pose);
  assert.equal(recovered.yaw, Math.PI / 2);
  assert.equal(Math.hypot(recovered.x - pose.x, recovered.z - pose.z), 0);
  const traffic = [
    { x: pose.x, z: pose.z },
    { x: pose.x + 6, z: pose.z },
  ];
  const away = findCarRecovery(city, pose, pose, traffic);
  assert.ok(isRecoverySpotClear(city, away.x, away.z, traffic));
  assert.ok(Math.hypot(away.x - pose.x, away.z - pose.z) >= 7);
});
