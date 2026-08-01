import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Geometry for the city's background cars, authored at final size with the wheels on y=0 so an
 * instance only ever needs a position and a heading. Split into four merged parts: painted bodywork
 * carries the per-instance colour, the rest are shared trim, headlamp and tail-lamp materials.
 */
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
};

const wheel = (x: number, z: number) => {
  const geometry = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(x, 0.42, z);
  return geometry;
};

export function makeFleetGeometry() {
  const painted = mergeGeometries([
    box(2.36, 0.72, 4.5, 0, 0.82, 0), // sills and flanks
    box(2.2, 0.34, 1.35, 0, 1.32, 1.5), // bonnet
    box(2.2, 0.34, 1.05, 0, 1.32, -1.68), // boot
    box(2.02, 0.66, 2.25, 0, 1.5, -0.15), // roof shell
    box(2.42, 0.2, 0.34, 0, 1.02, 2.24), // front lip
    box(2.42, 0.2, 0.34, 0, 1.02, -2.24), // rear lip
  ]);
  const trim = mergeGeometries([
    box(1.9, 0.44, 0.1, 0, 1.52, 1.02), // windscreen
    box(1.9, 0.44, 0.1, 0, 1.52, -1.32), // rear screen
    box(0.1, 0.4, 2.0, -1.02, 1.5, -0.15), // side glass
    box(0.1, 0.4, 2.0, 1.02, 1.5, -0.15),
    box(2.5, 0.26, 0.24, 0, 0.72, 2.2), // bumpers
    box(2.5, 0.26, 0.24, 0, 0.72, -2.2),
    wheel(-1.14, 1.42),
    wheel(1.14, 1.42),
    wheel(-1.14, -1.42),
    wheel(1.14, -1.42),
  ]);
  const headlights = mergeGeometries([
    box(0.52, 0.2, 0.12, -0.78, 1.06, 2.32),
    box(0.52, 0.2, 0.12, 0.78, 1.06, 2.32),
  ]);
  const taillights = mergeGeometries([
    box(0.46, 0.18, 0.12, -0.8, 1.06, -2.32),
    box(0.46, 0.18, 0.12, 0.8, 1.06, -2.32),
  ]);
  return { painted, trim, headlights, taillights };
}
