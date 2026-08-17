import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCity, rampSurface } from "./city.ts";
import { TARGET_RADIUS } from "./protocol.ts";

for (const seed of [1, 99, 777, 2026, 12345]) {
  test(`seed ${seed} has reachable curbside delivery targets`, () => {
    const city = generateCity(seed);
    for (const place of [...city.restaurants, ...city.houses]) {
      const [x, z] = place.stop;
      const distance = Math.hypot(x - place.pos[0], z - place.pos[1]);
      assert.ok(distance < TARGET_RADIUS, `${place.name} is ${distance.toFixed(1)}m from its stop`);
      assert.ok(distance > 4.25, `${place.name} stop is inside its shell`);
      assert.ok(
        !city.buildingAABBs.some(
          (box) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ,
        ),
        `${place.name} stop overlaps a solid`,
      );
      assert.ok(
        !city.ramps.some((ramp) => (rampSurface(ramp, x, z) ?? 0) > 0.4),
        `${place.name} stop overlaps a ramp`,
      );
    }
  });
}
