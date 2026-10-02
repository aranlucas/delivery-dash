import assert from "node:assert/strict";
import { test } from "node:test";
import { crossesBoostPad } from "./boost-pads.ts";
import type { BoostPad } from "./city.ts";

const pad: BoostPad = { x: 10, z: 20, y: 0, yaw: 0 };

test("boost strips activate once on a forward entry, not while driving or waiting inside", () => {
  assert.equal(crossesBoostPad(pad, 10, 15, 10, 17, 0, 28), true);
  assert.equal(crossesBoostPad(pad, 10, 17, 10, 20, 0, 28), false);
  assert.equal(crossesBoostPad(pad, 10, 20, 10, 20, 0, 0), false);
  assert.equal(crossesBoostPad(pad, 10, 20, 10, 25, 0, 28), false);
});

test("backward, sideways and slow passes cannot collect a boost", () => {
  assert.equal(crossesBoostPad(pad, 10, 25, 10, 22, 0, 28), false);
  assert.equal(crossesBoostPad(pad, 6, 20, 10, 20, 0, 28), false);
  assert.equal(crossesBoostPad(pad, 10, 15, 10, 17, 0, 4), false);
  assert.equal(crossesBoostPad(pad, 13, 15, 13, 18, 0, 28), false);
});

test("a frame spanning the strip entrance still triggers, but teleports and other elevations do not", () => {
  assert.equal(crossesBoostPad(pad, 10, 14, 10, 21, 0, 64), true);
  assert.equal(crossesBoostPad(pad, 10, 10, 10, 30, 0, 64), false);
  assert.equal(crossesBoostPad(pad, 10, 15, 10, 17, 11, 28), false);
  assert.equal(crossesBoostPad({ ...pad, y: 11 }, 10, 15, 10, 17, 11, 28), true);
});

test("the strip footprint and direction rotate with all four road headings", () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const rotated = { ...pad, yaw };
    const point = (along: number, across = 0) =>
      [
        pad.x + along * Math.sin(yaw) + across * Math.cos(yaw),
        pad.z + along * Math.cos(yaw) - across * Math.sin(yaw),
      ] as const;
    const from = point(-5),
      to = point(-2);
    assert.equal(crossesBoostPad(rotated, ...from, ...to, 0, 30), true);
    assert.equal(crossesBoostPad(rotated, ...point(5), ...point(2), 0, 30), false);
    assert.equal(crossesBoostPad(rotated, ...point(-5, 3), ...point(-2, 3), 0, 30), false);
  }
});
