/** Deterministic exporter for the coastal world kit.
 *
 * This is the canonical editable recipe for the checked-in GLBs. It runs without
 * a renderer, keeping local and headless rebuilds reproducible.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "public/models/world");
await mkdir(OUT, { recursive: true });

const colors = {
  wood: 0x612111,
  cream: 0xfac466,
  coral: 0xf0212e,
  teal: 0x087f85,
  gold: 0xf27a0a,
  navy: 0x09151f,
  pale: 0xb89a6b,
  green: 0x20612f,
  glass: 0x1aa6aa,
};
const materials = Object.fromEntries(
  Object.entries(colors).map(([name, color]) => [
    name,
    new THREE.MeshStandardMaterial({
      color,
      roughness: name === "glass" ? 0.22 : 0.78,
      metalness: name === "gold" ? 0.35 : 0,
    }),
  ]),
);

function add(
  list,
  geometry,
  material,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
) {
  const mesh = new THREE.Mesh(geometry, materials[material]);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.updateMatrix();
  list.push(mesh);
  return mesh;
}
function box(list, material, position, size) {
  return add(list, new THREE.BoxGeometry(...size), material, position);
}
function cylinder(list, material, position, radius, height, segments = 12, top = radius) {
  return add(list, new THREE.CylinderGeometry(top, radius, height, segments), material, position);
}
function sphere(list, material, position, scale) {
  return add(list, new THREE.SphereGeometry(1, 16, 8), material, position, [0, 0, 0], scale);
}
function cone(list, material, position, radius, height) {
  return add(
    list,
    new THREE.ConeGeometry(1, height, 16),
    material,
    position,
    [0, 0, 0],
    [radius, 1, radius],
  );
}
function beam(list, material, start, end, radius, segments = 10) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const delta = b.clone().sub(a);
  const mesh = cylinder(
    list,
    material,
    a.clone().add(b).multiplyScalar(0.5),
    radius,
    delta.length(),
    segments,
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.updateMatrix();
  return mesh;
}
function mergedScene(list) {
  const byMaterial = new Map();
  for (const mesh of list) {
    const material = Object.entries(materials).find(([, value]) => value === mesh.material)?.[0];
    const geometries = byMaterial.get(material) ?? [];
    geometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
    byMaterial.set(material, geometries);
  }
  const scene = new THREE.Scene();
  for (const [name, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries, false);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[name]);
    mesh.name = name;
    scene.add(mesh);
  }
  return scene;
}
async function exportModel(name, list) {
  const exporter = new GLTFExporter();
  const result = await new Promise((resolveResult, reject) =>
    exporter.parse(mergedScene(list), resolveResult, reject, { binary: true }),
  );
  await writeFile(resolve(OUT, `${name}.glb`), Buffer.from(result));
}

const market = [];
for (const [x, material] of [
  [-7.5, "coral"],
  [0, "teal"],
  [7.5, "gold"],
]) {
  box(market, "wood", [x, 1.15, 0], [6.4, 0.38, 3.4]);
  box(market, "wood", [x, 2.55, 1.25], [6.4, 2.8, 0.28]);
  box(market, material, [x, 4.1, 1.05], [6.8, 0.34, 2.9]);
  box(market, material, [x, 3.45, -0.35], [6.8, 0.22, 1.55]);
  box(market, "cream", [x, 3.59, -0.75], [6.45, 0.06, 0.22]);
  box(market, "cream", [x, 3.59, 0.05], [6.45, 0.06, 0.22]);
  box(market, "cream", [x, 3.0, -0.78], [3.4, 0.65, 0.08]);
  for (const side of [-2.6, 2.6]) {
    beam(market, material, [x + side, 1.3, 1], [x + side, 4.15, 1], 0.12);
    beam(market, material, [x + side, 1.3, -1.0], [x + side, 3.5, -1.0], 0.12);
  }
}
for (const [x, material] of [
  [-7.5, "coral"],
  [7.5, "teal"],
]) {
  cylinder(market, "navy", [x, 2.2, -2.15], 0.09, 4.4);
  cone(market, material, [x, 4.42, -2.15], 2.65, 0.52);
  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4])
    beam(
      market,
      "cream",
      [x, 4.5, -2.15],
      [x + Math.cos(angle) * 2.2, 4.18, -2.15 + Math.sin(angle) * 2.2],
      0.055,
    );
}
for (const [x, z] of [
  [-10.8, -0.55],
  [10.8, -0.55],
  [-9.8, 1.15],
  [9.8, 1.15],
])
  box(market, "gold", [x, 0.55, z], [1.1, 1.1, 1.1]);
box(market, "wood", [0, 0.75, -2], [3.4, 0.38, 1.4]);
sphere(market, "teal", [0, 1.75, -2], [1.45, 0.55, 0.42]);
beam(market, "coral", [-1.25, 1.75, -2], [-2.1, 2.35, -2], 0.16);
for (const [x, material] of [
  [-1.0, "coral"],
  [0, "gold"],
  [1.0, "teal"],
])
  sphere(market, material, [x, 1.12, -2.0], [0.28, 0.28, 0.28]);
await exportModel("market", market);

const harbor = [];
const boatZ = -7;
box(harbor, "wood", [0, 0.35, 0], [26, 0.7, 10]);
for (let x = -12; x <= 12; x += 3) box(harbor, "pale", [x, 0.78, 0], [2.55, 0.12, 9.8]);
for (const x of [-11.5, 11.5]) {
  cylinder(harbor, "navy", [x, 1.8, -3.8], 0.3, 3.1);
  cylinder(harbor, "gold", [x, 3.38, -3.8], 0.48, 0.18);
}
const boatPartsStart = harbor.length;
sphere(harbor, "navy", [3.5, 2, boatZ + 0.2], [6.5, 1.25, 2.4]);
box(harbor, "coral", [3.5, 2.55, boatZ - 2.05], [10.6, 0.28, 0.22]);
box(harbor, "cream", [3.8, 3.55, boatZ + 0.25], [3.6, 1.9, 3.2]);
box(harbor, "glass", [3.8, 4.05, boatZ - 1.4], [2.6, 0.85, 0.08]);
box(harbor, "glass", [1.98, 3.85, boatZ + 0.25], [0.08, 0.8, 1.25]);
box(harbor, "glass", [5.62, 3.85, boatZ + 0.25], [0.08, 0.8, 1.25]);
beam(harbor, "gold", [3.5, 4.4, boatZ + 0.2], [3.5, 10.3, boatZ + 0.2], 0.12);
beam(harbor, "gold", [3.5, 8.2, boatZ + 0.2], [0.8, 8.2, boatZ + 0.2], 0.09);
box(harbor, "cream", [2.15, 6.8, boatZ + 0.2], [0.12, 2.6, 0.2]);
add(
  harbor,
  new THREE.ConeGeometry(1.2, 3, 6),
  "navy",
  [9.3, 1.8, boatZ + 0.2],
  [0, 0, -Math.PI / 2],
);
// Lower the entire boat together so the hull sits in the water beside the raised dock.
for (const part of harbor.slice(boatPartsStart)) {
  part.position.y -= 1.6;
  part.updateMatrix();
}
for (const [x, material] of [
  [-8, "teal"],
  [-5.4, "coral"],
  [-2.8, "gold"],
]) {
  box(harbor, material, [x, 2.2, 2.5], [2.3, 2.7, 3.3]);
  for (const y of [1.2, 2, 2.8, 3.2]) box(harbor, "navy", [x, y, 0.82], [1.9, 0.055, 0.06]);
}
for (const x of [-9, -6, -3, 9]) box(harbor, "gold", [x, 1.25, -2.5], [1.4, 1.4, 1.4]);
await exportModel("harbor", harbor);

const plaza = [];
box(plaza, "pale", [0, 0.25, 0], [20, 0.5, 12]);
for (const x of [-6.5, 0, 6.5]) {
  box(plaza, "wood", [x, 1, -2], [4.2, 0.3, 0.85]);
  box(plaza, "wood", [x, 1.9, -2.35], [4.2, 1.5, 0.28]);
  for (const lx of [x - 1.45, x + 1.45]) beam(plaza, "navy", [lx, 0.8, -2], [lx, 0.25, -2], 0.12);
}
for (const x of [-7.5, 7.5]) {
  cylinder(plaza, "teal", [x, 0.9, 2], 1.4, 1.8, 12, 1.15);
  sphere(plaza, "green", [x, 2.6, 2], [1.1, 1.25, 1.1]);
}
for (const x of [-3.8, 3.8]) {
  cylinder(plaza, "navy", [x, 3.4, 2], 0.12, 6.8);
  sphere(plaza, "gold", [x, 7, 2], [0.42, 0.42, 0.42]);
}
box(plaza, "coral", [0, 3.2, 2.45], [3.8, 1.7, 0.2]);
box(plaza, "cream", [0, 3.2, 2.34], [2.6, 0.22, 0.04]);
await exportModel("plaza", plaza);
