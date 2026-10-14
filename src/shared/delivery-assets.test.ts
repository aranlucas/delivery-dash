import { z as schema } from "zod";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { generateCity, blocked, safeTravel, CITY_ZONES } from "./city.ts";
import {
  modelColliders,
  storefrontModel,
  storefrontYaw,
  jumpGatePosition,
} from "./delivery-assets.ts";

const gltfSchema = schema.object({
  materials: schema.array(schema.unknown()),
  textures: schema.array(schema.unknown()).optional(),
  meshes: schema.array(
    schema.object({
      primitives: schema.array(
        schema.object({
          indices: schema.number().int().nonnegative(),
          attributes: schema.record(schema.string(), schema.number()),
        }),
      ),
    }),
  ),
  accessors: schema.array(schema.object({ count: schema.number().int().nonnegative() })),
});

test("authored storefronts keep pickup stops and their approach clear across seeds", () => {
  for (let seed = 1; seed <= 32; seed++) {
    const city = generateCity(seed);
    const shops = city.restaurants.filter((p) => storefrontModel(p.name));
    assert.equal(shops.length, 3);

    for (const p of shops) {
      assert.equal(blocked(city, ...p.stop, 0), false, `${seed}: ${p.name} pickup blocked`);
      const model = storefrontModel(p.name);
      assert.ok(model);
      const boxes = modelColliders(model, ...p.pos, storefrontYaw(p));
      assert.ok(
        boxes.every((box) =>
          city.buildingAABBs.some((b) => JSON.stringify(b) === JSON.stringify(box)),
        ),
      );
      assert.equal(blocked(city, ...p.pos, 0), true, `${p.name} shell not solid`);
    }
  }
});

test("jump gate posts and overhead beam are solid while the whole jump lane stays open", () => {
  const city = generateCity(2026);

  for (const zone of CITY_ZONES.filter(
    (candidate) => candidate.id === "stunt" || candidate.id === "freight",
  )) {
    const [x, z] = jumpGatePosition(zone);
    assert.equal(blocked(city, x + 10, z, 0), true);
    assert.equal(blocked(city, x - 10, z, 0), true);
    assert.equal(blocked(city, x, z, 15), true, "header missing collision");

    for (const height of [0, 4, 9, 12]) {
      assert.equal(safeTravel(city, x, z - 3, 0, 6, height), 1, `gate blocked at height ${height}`);
      assert.equal(blocked(city, x - 6, z, height), false, "left lane obstructed");
      assert.equal(blocked(city, x + 6, z, height), false, "right lane obstructed");
    }
  }
});

test("shipping Blender kit stays within its geometry, material and texture budgets", async () => {
  const names = ["sushi", "pizza", "depot", "jump-gate", "landing-target"] as const;

  const results = await Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(
        new URL(`../../public/models/delivery/${name}.glb`, import.meta.url),
      );

      return { name, bytes };
    }),
  );

  let totalBytes = 0;

  for (const { name, bytes } of results) {
    totalBytes += bytes.length;
    assert.equal(bytes.toString("utf8", 0, 4), "glTF");

    const json = gltfSchema.parse(
      JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12))),
    );

    assert.equal(json.materials.length, 1, `${name} has extra materials`);
    assert.equal(json.textures?.length ?? 0, 0, `${name} unexpectedly downloads textures`);
    const primitives = json.meshes.flatMap((m) => m.primitives);
    assert.equal(primitives.length, 1, `${name} needs more than one draw call`);

    const triangles = primitives.reduce((sum, p) => sum + json.accessors[p.indices].count / 3, 0);

    assert.ok(triangles < 3000, `${name} has ${triangles} triangles`);
    assert.ok(
      primitives.every((p) => p.attributes.COLOR_0 !== undefined),
      "missing vertex palette",
    );
  }

  assert.ok(totalBytes < 450_000, `kit is ${totalBytes} bytes`);
});

test("storefront lookup leaves unauthored restaurants without a model", () => {
  assert.equal(storefrontModel("Sushi Express"), "sushi");
  assert.equal(storefrontModel("Pizza Planet"), "pizza");
  assert.equal(storefrontModel("Dumpling Depot"), "depot");
  assert.equal(storefrontModel("Unknown storefront"), undefined);
});
