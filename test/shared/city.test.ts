import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  CITY_ZONES,
  blocked,
  generateCity,
  groundHeightAt,
  rampSurface,
  zoneAt,
  type Ramp,
} from "@/shared/city.ts";
import { TARGET_RADIUS } from "@/shared/protocol.ts";

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

// Authored map features must remain driveable for every procedural building/parking seed.

for (const seed of [1, 99, 777, 2026, 12345]) {
  test(`seed ${seed} preserves landmark plazas and clear stunt approaches`, () => {
    const city = generateCity(seed);
    assert.deepEqual(city, generateCity(seed), "client and worker generation must agree");

    for (const building of city.buildings) {
      assert.equal(zoneAt(building.x, building.z), undefined, "building occupies a reserved plaza");
    }

    for (const place of [...city.restaurants, ...city.houses]) {
      assert.equal(zoneAt(...place.pos), undefined, "delivery shell occupies a reserved plaza");
      assert.equal(blocked(city, ...place.stop, 0), false, `${place.name} has a blocked stop`);
    }

    for (const zone of CITY_ZONES) {
      // Landmark drift circuits stay clear. Freight Yard has a separate straight launch lane.
      for (let i = 0; zone.id !== "freight" && i < 64; i++) {
        const angle = (i * Math.PI) / 32;
        const x = zone.x + Math.cos(angle) * 29;
        const z = zone.z + Math.sin(angle) * 29;
        assert.equal(blocked(city, x, z, 0), false, `${zone.name} drift ring obstructed at ${i}`);
      }

      if (zone.radius) {
        assert.equal(blocked(city, zone.x, zone.z, 0), true, "landmark must be solid");
      }

      if (zone.id !== "stunt" && zone.id !== "freight") {
        continue;
      }

      const x = zone.x + (zone.id === "freight" ? 24 : 0);

      for (const direction of [-1, 1]) {
        const ramp: Ramp | undefined = city.ramps.find(
          (r) => r.x === x && r.z === zone.z - direction * 18,
        );

        assert.ok(ramp, "missing authored launch");

        for (let distance = 42; distance >= 26; distance -= 1) {
          assert.equal(
            blocked(city, x, zone.z - direction * distance, 0),
            false,
            "run-up obstructed",
          );
        }

        // Sample the slope as a car climbs it; the shared height solver must agree with rendering.
        let height = 0;

        for (let along = -ramp.length / 2; along <= ramp.length / 2; along += 0.25) {
          const z: number = ramp.z + direction * along;
          height = groundHeightAt(city, x, z, height);
          assert.equal(blocked(city, x, z, height), false, "launch surface blocked");
        }

        assert.ok(Math.abs(height - ramp.height) < 0.001);
        assert.equal(blocked(city, x, zone.z + direction * 40, 0), false, "landing obstructed");
      }
    }
  });
}

// Captured from the pre-cleanup generator: preserve RNG consumption and placement order.
const layoutHashes = new Map<number, string>([
  [1, "e61199a5eafb4e6b99cc11fb8f5cfa8950c7678ec586ab2ca2919d7c71995d2b"],
  [7, "48fd8ec91db13917463b3ce6842e241a2272100b9de4a133038b0016dc698b3f"],
  [42, "1ca985cecd1443e4fecba3e05018db06f7115df80b8aaf69712e491f7a071e08"],
  [99, "e7f92aeae922d99d05861542e4f9cb8e66070b966a32ce9df3424535e36e72ee"],
  [777, "41f6e76594dcb55d93a737e34fc0f83a777ec02ee9c758fb0bb2741a927850fc"],
  [2026, "fe97ff21f35baf6f39dab08c32d972b1b920504ad0d06c09cbde8f0180b28453"],
  [12345, "f1af6f9ce6d2b39cce0e45bb05c63f1ee90b8793d2f6f2bcec3cd59874cc320b"],
]);

test("seeded city layouts retain their complete deterministic output", () => {
  for (const [seed, expected] of layoutHashes) {
    const digest = createHash("sha256")
      .update(JSON.stringify(generateCity(seed)))
      .digest("hex");

    assert.equal(digest, expected, `City layout changed for seed ${seed}`);
  }
});
