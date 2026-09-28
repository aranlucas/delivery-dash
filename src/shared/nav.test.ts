import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { relativeBearing, worldBearing } from "./nav.ts";

const HALF_PI = Math.PI / 2;
const near = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: got ${actual}, want ${expected}`);

test("worldBearing matches the three.js rotation convention", () => {
  for (const [tx, tz, expected] of [
    [0, 10, 0],
    [10, 0, HALF_PI],
    [0, -10, Math.PI],
    [-10, 0, -HALF_PI],
  ] as const)
    near(worldBearing(0, 0, tx, tz), expected, `bearing to (${tx}, ${tz})`);
});

function screenX(yaw: number, tx: number, tz: number): number {
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.35, 6000);
  camera.position.set(-Math.sin(yaw) * 9.4, 4.65, -Math.cos(yaw) * 9.4);
  camera.lookAt(new THREE.Vector3(Math.sin(yaw) * 7, 1.35, Math.cos(yaw) * 7));
  camera.updateMatrixWorld(true);
  return new THREE.Vector3(tx, 1, tz).project(camera).x;
}

test("relativeBearing agrees with three.js screen placement", () => {
  for (const [yaw, tx, tz] of [
    [0, 30, 0],
    [0, -30, 0],
    [HALF_PI, 0, 30],
    [HALF_PI, 0, -30],
    [Math.PI / 4, 40, 0],
    [Math.PI / 4, 0, 40],
  ] as const) {
    const bearing = relativeBearing(0, 0, yaw, tx, tz);
    assert.equal(
      bearing > 0,
      screenX(yaw, tx, tz) > 0,
      `yaw ${yaw.toFixed(2)} target (${tx}, ${tz})`,
    );
  }
});

test("relativeBearing is stable after accumulated spins", () => {
  for (const yaw of [-9 * Math.PI, -Math.PI, 0, Math.PI, 7 * Math.PI]) {
    const bearing = relativeBearing(0, 0, yaw, 10, 3);
    assert.ok(bearing > -Math.PI - 1e-9 && bearing <= Math.PI + 1e-9);
  }
});
