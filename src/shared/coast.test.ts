import assert from "node:assert/strict";
import { test } from "node:test";
import { blocked, COAST_ROAD_ENDS, generateCity, safeTravel, WORLD_HALF } from "./city.ts";
import { buildGrid } from "./collision.ts";

test("waterfront rails stop a boost-speed approach at every street end", () => {
  const city = generateCity(42);
  // Isolate the rails so parking, shops, and landmark collisions cannot mask a missing barrier.
  city.buildingAABBs = COAST_ROAD_ENDS;
  city.collisionGrid = buildGrid(COAST_ROAD_ENDS);
  city.ramps = [];
  city.decks = [];
  for (const box of COAST_ROAD_ENDS) {
    const alongX = box.maxX - box.minX < box.maxZ - box.minZ;
    const x = (box.minX + box.maxX) / 2,
      z = (box.minZ + box.maxZ) / 2;
    const sign = Math.sign(alongX ? x : z);
    const startX = alongX ? sign * (WORLD_HALF - 15) : x;
    const startZ = alongX ? z : sign * (WORLD_HALF - 15);
    const dx = alongX ? sign * 12 : 0,
      dz = alongX ? 0 : sign * 12;
    assert.equal(blocked(city, startX, startZ, 0), false);
    const travel = safeTravel(city, startX, startZ, dx, dz, 0);
    assert.ok(travel > 0.7 && travel < 0.9, `unreadable stop at ${x}, ${z}`);
    // Existing curbside stops reach the world limit, so the rails must preserve that last metre.
    assert.equal(blocked(city, alongX ? sign * 295 : x, alongX ? z : sign * 295, 0), false);
    assert.equal(blocked(city, alongX ? sign * 295.1 : x, alongX ? z : sign * 295.1, 0), true);
  }
});

test("waterfront rails enter the shared collision grid without blocking the starting grid", () => {
  for (const seed of [1, 99, 777, 2026, 12345]) {
    const city = generateCity(seed);
    for (const rail of COAST_ROAD_ENDS) assert.ok(city.collisionGrid.boxes.includes(rail));
    for (const { pos } of city.spawns) assert.equal(blocked(city, ...pos, 0), false);
  }
});
