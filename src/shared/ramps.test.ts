import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { generateCity, groundHeightAt, safeTravel, STEP_UP, type City, type Ramp } from "./city.ts";
import { buildGrid } from "./collision.ts";
import { rampSurface, rampBlocks, crossesLanding, rampUnderside } from "./ramps.ts";
import { makeRampGeometry } from "../client/game/ramp-geometry.ts";

const point = (ramp: Ramp, across: number, along: number): [number, number] => [
  ramp.x + Math.cos(ramp.yaw) * across + Math.sin(ramp.yaw) * along,
  ramp.z - Math.sin(ramp.yaw) * across + Math.cos(ramp.yaw) * along,
];
const ramp: Ramp = { x: 0, z: 0, yaw: 0, length: 14, width: 11, height: 3.8, kind: "kicker" };
function emptyCity(ramps: Ramp[]): City {
  const city = generateCity(1);
  return { ...city, ramps, decks: [], buildingAABBs: [], collisionGrid: buildGrid([]) };
}

for (const yaw of [0, Math.PI / 2, Math.PI, -0.63]) {
  test(`ramp side/back collisions include the car footprint at yaw ${yaw}`, () => {
    const r = { ...ramp, yaw };
    assert.equal(rampBlocks(r, ...point(r, 0, -8), 0, STEP_UP), false, "entry must stay open");
    assert.equal(
      rampBlocks(r, ...point(r, 6.5, 2), 0, STEP_UP),
      true,
      "side must stop the car before its centre penetrates",
    );
    assert.equal(
      rampBlocks(r, ...point(r, 0, 8), 0, STEP_UP),
      true,
      "back wall must include the bumper",
    );
    assert.equal(
      rampBlocks(r, ...point(r, 8, 2), 0, STEP_UP),
      false,
      "outside the footprint must remain clear",
    );
    assert.equal(
      rampBlocks(r, ...point(r, 0, 8), 4, STEP_UP),
      false,
      "launch clearance above the lip",
    );
  });
}

test("both ramp sizes and expressway grades render exactly where their collision surface is", () => {
  const unit = makeRampGeometry({ kind: "kicker", length: 1, width: 1, height: 1 });
  const material = new THREE.MeshBasicMaterial();
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  for (const r of generateCity(2026).ramps) {
    const geometry = r.kind === "kicker" ? unit : makeRampGeometry(r);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(r.x, 0, r.z);
    mesh.rotation.y = r.yaw;
    if (r.kind === "kicker") mesh.scale.set(r.width, r.height, r.length);
    mesh.updateMatrixWorld(true);
    for (const t of [0.02, 0.13, 0.31, 0.58, 0.79, 0.99]) {
      const [x, z] = point(r, r.width * 0.2, (t - 0.5) * r.length);
      ray.set(new THREE.Vector3(x, r.height + 10, z), down);
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, "visible ramp surface missing");
      const physics = rampSurface(r, x, z)!;
      assert.ok(
        Math.abs(hit.point.y - physics) < 1e-4,
        `${r.kind} mesh=${hit.point.y} physics=${physics}`,
      );
    }
    if (geometry !== unit) geometry.dispose();
  }
  unit.dispose();
  material.dispose();
});

test("swept collision cannot skip a ramp side or a thin elevated guardrail", () => {
  const city = emptyCity([ramp]);
  const t = safeTravel(city, 8, 1, -4, 0, 0);
  assert.ok(t < 1, "a single frame crossed the side face");
  assert.ok(8 - 4 * t > ramp.width / 2, "car centre entered the wedge");
  const rail = { minX: 0, maxX: 0.2, minZ: -5, maxZ: 5, base: 8, top: 10 };
  city.buildingAABBs = [rail];
  city.collisionGrid = buildGrid([rail]);
  city.ramps = [];
  assert.ok(safeTravel(city, -5, 0, 10, 0, 8) < 1, "high-speed movement skipped the rail");
  assert.equal(safeTravel(city, -5, 0, 10, 0, 0), 1, "ground-level cars must pass underneath");
});

test("boost-speed approach can climb and leave the lip without a collision", () => {
  const city = emptyCity([ramp]);
  for (const step of [0.4, 1.6, 3.2]) {
    let height = 0;
    for (let z = -10; z < 7; z += step) {
      assert.equal(safeTravel(city, 0, z, 0, step, height), 1, `approach blocked at ${z}`);
      height = groundHeightAt(city, 0, z + step, height);
    }
  }
});

test("raised approaches have a visible underside and allow cars through with roof clearance", () => {
  const grade: Ramp = { ...ramp, length: 70, width: 13, height: 11, kind: "grade" };
  const geometry = makeRampGeometry(grade);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  const hit = ray.intersectObject(mesh)[0];
  assert.ok(hit, "approach has no visible soffit");
  assert.ok(Math.abs(hit.point.y - rampUnderside(grade, 0.5)) < 1e-5);
  for (const yaw of [0, Math.PI / 2, Math.PI, -0.63]) {
    const r = { ...grade, yaw };
    assert.equal(rampBlocks(r, ...point(r, 0, 0), 0, STEP_UP), false, "centre underpass blocked");
    assert.equal(rampBlocks(r, ...point(r, 7, 0), 0, STEP_UP), false, "side underpass blocked");
    assert.equal(rampBlocks(r, ...point(r, 0, 0), 4, STEP_UP), true, "roof penetrates slab");
    assert.equal(rampBlocks(r, ...point(r, 0, -25), 0, STEP_UP), true, "low soffit admits a car");
    assert.equal(rampBlocks(r, ...point(r, 0, 0), 5.5, STEP_UP), false, "road surface blocked");
    assert.equal(rampBlocks(r, ...point(r, 5, 0), 5.5, STEP_UP), true, "barrier permits side exit");
    assert.equal(
      rampBlocks(r, ...point(r, 5, 0), 6.5, STEP_UP),
      false,
      "jump above barrier blocked",
    );
  }
  geometry.dispose();
  material.dispose();
});

test("expressway approaches remain clear to climb, descend and merge with their decks", () => {
  const city = generateCity(2026);
  for (const r of city.ramps.filter((r) => r.kind === "grade")) {
    let height = 0;
    for (let along = -r.length / 2; along < r.length / 2 + 3; along += 0.7) {
      const [x, z] = point(r, 0, along);
      assert.equal(
        safeTravel(city, x, z, Math.sin(r.yaw) * 0.7, Math.cos(r.yaw) * 0.7, height),
        1,
        `grade ascent or merge blocked at ${x},${z}`,
      );
      height = groundHeightAt(city, ...point(r, 0, along + 0.7), height);
    }
    height = r.height;
    for (let along = r.length / 2 - 0.1; along > -r.length / 2; along -= 0.7) {
      const [x, z] = point(r, 0, along);
      assert.equal(
        safeTravel(city, x, z, -Math.sin(r.yaw) * 0.7, -Math.cos(r.yaw) * 0.7, height),
        1,
        `grade descent blocked at ${x},${z} height=${height}`,
      );
      height = groundHeightAt(city, ...point(r, 0, along - 0.7), height);
    }
  }
});

test("a sweep along a ramp cannot lift an airborne car into its side", () => {
  const city = emptyCity([ramp]);
  assert.ok(safeTravel(city, 8, 3, -8, 0, 0.5) < 1);
});

test("airborne height queries and landings do not snap up to a ramp or deck", () => {
  const city = emptyCity([ramp]);
  city.decks = [{ minX: 20, maxX: 40, minZ: -10, maxZ: 10, height: 8 }];
  assert.equal(groundHeightAt(city, 30, 0, 7, 0), 0, "deck above airborne wheels must be ignored");
  assert.equal(
    crossesLanding(7, 7.4, 8, 8),
    false,
    "ascending into the underside is not a landing",
  );
  assert.equal(
    crossesLanding(7, 6, 8, -10),
    false,
    "cannot land on a deck above the previous position",
  );
  assert.equal(crossesLanding(10, 7, 8, -20), true, "fast descent must catch the deck");
  assert.equal(crossesLanding(0.3, -0.2, 0, -10), true, "ground catches a low landing");
  const surface = rampSurface(ramp, 0, 2)!;
  assert.equal(groundHeightAt(city, 0, 2, surface + 1, 0), surface);
  assert.equal(
    crossesLanding(surface + 1, surface - 0.2, surface, -12),
    true,
    "ramp catches a landing from above",
  );
});

test("seeded stunts never overlap any starting-grid slot", () => {
  for (let seed = 1; seed <= 32; seed++) {
    const city = generateCity(seed);
    for (const spawn of city.spawns) {
      assert.equal(groundHeightAt(city, ...spawn.pos, 0), 0, `seed ${seed} spawns on a slope`);
      assert.equal(safeTravel(city, ...spawn.pos, 0, 1, 0), 1, `seed ${seed} spawn is obstructed`);
    }
  }
});
