import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCity, rampSurface, STEP_UP, WORLD_HALF, type AABB, type City } from "./city.ts";
import { buildGrid, queryRange } from "./collision.ts";
import { mulberry32 } from "./rng.ts";

function randomBoxes(seed: number, count: number): AABB[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const x = (random() - 0.5) * 800;
    const z = (random() - 0.5) * 800;
    const width = 4 + random() * 30;
    const depth = 4 + random() * 30;
    const base = random() * 12;
    return {
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      base,
      top: base + 2 + random() * 30,
    };
  });
}

test("queryRange exactly matches a brute-force XZ query", () => {
  const boxes = randomBoxes(777, 300);
  const grid = buildGrid(boxes);
  const random = mulberry32(555);
  const out: number[] = [];
  for (let iteration = 0; iteration < 3000; iteration++) {
    const x = (random() - 0.5) * 900;
    const z = (random() - 0.5) * 900;
    const width = random() * 60;
    const depth = random() * 60;
    const range = [x - width, z - depth, x + width, z + depth] as const;
    const count = queryRange(grid, ...range, out);
    const got = new Set(out.slice(0, count));
    const wanted = new Set(
      boxes.flatMap((box, index) =>
        box.maxX >= range[0] &&
        box.minX <= range[2] &&
        box.maxZ >= range[1] &&
        box.minZ <= range[3]
          ? [index]
          : [],
      ),
    );
    assert.deepEqual(got, wanted);
  }
});

const bruteBlocked = (city: City, x: number, z: number, height: number) => {
  if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) return true;
  for (const ramp of city.ramps) {
    const surface = rampSurface(ramp, x, z);
    if (surface !== undefined && surface > height + STEP_UP) return true;
  }
  return city.buildingAABBs.some(
    (box) =>
      height < box.top - 0.6 &&
      height > box.base - 1.4 &&
      x > box.minX - 2 &&
      x < box.maxX + 2 &&
      z > box.minZ - 2 &&
      z < box.maxZ + 2,
  );
};

test("altitude-aware grid collision matches the previous full scan", async () => {
  const { blocked } = await import("./city.ts");
  const city = generateCity(42);
  const random = mulberry32(4242);
  for (let iteration = 0; iteration < 20_000; iteration++) {
    const x = (random() * 2 - 1) * WORLD_HALF;
    const z = (random() * 2 - 1) * WORLD_HALF;
    const height = random() * 24;
    assert.equal(blocked(city, x, z, height), bruteBlocked(city, x, z, height));
  }
});

test("current city buckets keep candidate sets small", () => {
  const grid = generateCity(42).collisionGrid;
  let largest = 0;
  for (let index = 0; index < grid.cols * grid.rows; index++)
    largest = Math.max(largest, grid.bucketStart[index + 1]! - grid.bucketStart[index]!);
  assert.ok(largest < 30, `largest bucket contains ${largest} boxes`);
});
