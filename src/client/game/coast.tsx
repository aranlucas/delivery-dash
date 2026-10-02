import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CITY_ZONES, COAST_ROAD_ENDS, WORLD_HALF } from "../../shared/city";
import { useStreetPropAssets } from "./model-assets";
import { StaticInstances, type StaticInstance } from "./static-instances";

const SEGMENTS = 256;
const HARBOR = CITY_ZONES.find((zone) => zone.id === "harbor")!;

/** Keep the street grid intact, then soften its silhouette with coves and rounded headlands. */
function shorePoint(angle: number) {
  const x = Math.cos(angle),
    z = Math.sin(angle);
  const inner = (WORLD_HALF - 0.25) / Math.max(Math.abs(x), Math.abs(z));
  const rounded = 355 / Math.pow(Math.abs(x) ** 5 + Math.abs(z) ** 5, 1 / 5);
  // The existing dock and boat need open water at Lighthouse Point.
  const harborCove = Math.exp(-Math.pow((angle - 2.71) / 0.17, 2)) * 38;
  const outer = Math.max(
    inner + 22,
    rounded + Math.sin(angle * 7 + 0.6) * 12 + Math.sin(angle * 13) * 6 - harborCove,
  );
  return { x, z, inner, outer };
}

function makeShoreGeometry() {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const tint = new THREE.Color();
  const layers = [
    { t: 0, y: 0.018, color: "#9f9a70" },
    { t: 0.2, y: 0.12, color: "#ddc393" },
    { t: 0.83, y: -0.55, color: "#e8cc9c" },
    { t: 1, y: -1.4, color: "#a0b8aa" },
  ];
  for (const layer of layers) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      const { x, z, inner, outer } = shorePoint(angle);
      const radius = THREE.MathUtils.lerp(inner, outer, layer.t);
      positions.push(x * radius, layer.y, z * radius);
      tint.set(layer.color).multiplyScalar(1 + Math.sin(angle * 17) * 0.035);
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  for (let layer = 0; layer < layers.length - 1; layer++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = layer * (SEGMENTS + 1) + i,
        b = a + 1;
      const c = a + SEGMENTS + 1,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const ROCKS: StaticInstance[] = [];
const SHRUBS: StaticInstance[] = [];
const PALM_TRUNKS: StaticInstance[] = [];
const PALM_FRONDS: StaticInstance[] = [];
for (let i = 0; i < 160; i++) {
  const angle = (i / 160) * Math.PI * 2;
  const { x, z, inner, outer } = shorePoint(angle);
  // Clusters alternate with open beaches, rather than tracing another continuous border.
  if (Math.sin(angle * 5 + 0.5) > -0.15) {
    const t = 0.3 + (i % 4) * 0.16;
    const radius = THREE.MathUtils.lerp(inner, outer, t);
    const size = 1.2 + (i % 5) * 0.5;
    // Leave the dock's gangway and landing clear of decorative boulders.
    const atGangway =
      x * radius < -WORLD_HALF &&
      x * radius > -WORLD_HALF - 50 &&
      Math.abs(z * radius - HARBOR.z) < 7;
    if (!atGangway)
      ROCKS.push({
        position: [x * radius, -0.35 + size * 0.38, z * radius],
        rotation: [0.18 * Math.sin(i), angle, 0.12 * Math.cos(i)],
        scale: [size * 1.6, size * 0.8, size],
        color: ["#71837f", "#8c9182", "#a0a18c"][i % 3]!,
      });
  }
  if (i % 3 === 0 && Math.sin(angle * 7) > -0.5) {
    const radius = inner + 4 + (i % 5) * 0.8;
    SHRUBS.push({
      position: [x * radius, 0.5, z * radius],
      rotation: [0, angle, 0],
      scale: [2.8 + (i % 4), 0.8 + (i % 3) * 0.25, 2.1],
      color: i % 2 ? "#758451" : "#92965e",
    });
  }
  if (i % 8 === 2 && Math.abs(angle - 2.71) > 0.22) {
    const radius = THREE.MathUtils.lerp(inner, outer, 0.28);
    const px = x * radius,
      pz = z * radius;
    const height = 6.6 + (i % 5) * 0.3;
    PALM_TRUNKS.push({
      position: [px, height / 2 + 0.035, pz],
      rotation: [0, angle, 0],
      scale: [1.35, height / 7, 1.35],
    });
    for (let frond = 0; frond < 7; frond++) {
      PALM_FRONDS.push({
        position: [px, height + 0.535, pz],
        rotation: [0, (frond / 7) * Math.PI * 2 + angle, 0],
        scale: [0.95, 0.9, 0.95],
      });
    }
  }
}

function BeachPalms() {
  const { palmTrunk, palmFrond } = useStreetPropAssets();
  return (
    <>
      <StaticInstances items={PALM_TRUNKS} geometry={palmTrunk} shadows>
        <meshStandardMaterial color="#8e542d" roughness={0.96} />
      </StaticInstances>
      <StaticInstances items={PALM_FRONDS} geometry={palmFrond} shadows>
        <meshStandardMaterial color="#438452" flatShading roughness={0.9} side={THREE.DoubleSide} />
      </StaticInstances>
    </>
  );
}

const RAILS: StaticInstance[] = [];
const POSTS: StaticInstance[] = [];
const REFLECTORS: StaticInstance[] = [];
for (const box of COAST_ROAD_ENDS) {
  const x = (box.minX + box.maxX) / 2,
    z = (box.minZ + box.maxZ) / 2;
  const alongX = box.maxX - box.minX > box.maxZ - box.minZ;
  const width = Math.max(box.maxX - box.minX, box.maxZ - box.minZ);
  for (const y of [0.48, 1.12]) {
    RAILS.push({ position: [x, y, z], scale: alongX ? [width, 0.22, 0.32] : [0.32, 0.22, width] });
  }
  for (const offset of [-width / 2 + 0.2, 0, width / 2 - 0.2]) {
    POSTS.push({
      position: [x + (alongX ? offset : 0), 0.65, z + (alongX ? 0 : offset)],
      scale: [0.28, 1.3, 0.28],
    });
    REFLECTORS.push({
      position: [x + (alongX ? offset : 0), 1.12, z + (alongX ? 0 : offset)],
      scale: alongX ? [0.38, 0.24, 0.35] : [0.35, 0.24, 0.38],
    });
  }
}

const ISLANDS: StaticInstance[] = Array.from({ length: 11 }, (_, i) => {
  const angle = (i * Math.PI * 2) / 11;
  const radius = 90 + (i % 3) * 25;
  return {
    position: [Math.cos(angle) * (700 + i * 13), -18, Math.sin(angle) * (700 + i * 13)],
    scale: [radius * 1.8, 65 + (i % 4) * 30, radius * 1.15],
    color: i % 2 ? "#547d83" : "#648d87",
  };
});

export function Coast() {
  const water = useRef<THREE.Mesh>(null);
  const shore = useMemo(() => makeShoreGeometry(), []);
  useEffect(() => () => shore.dispose(), [shore]);
  useFrame(({ clock }) => {
    if (water.current) water.current.position.y = -1.2 + Math.sin(clock.elapsedTime * 0.45) * 0.08;
  });
  return (
    <group name="coastal-shoreline">
      <mesh ref={water} rotation-x={-Math.PI / 2} position={[0, -1.2, 0]}>
        <planeGeometry args={[20000, 20000]} />
        <meshStandardMaterial color="#228f9f" roughness={0.38} metalness={0.18} />
      </mesh>
      <mesh geometry={shore} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <StaticInstances items={ROCKS} shadows>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial flatShading roughness={1} />
      </StaticInstances>
      <StaticInstances items={SHRUBS} shadows>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial flatShading roughness={1} />
      </StaticInstances>
      <BeachPalms />
      <group name="coastal-road-rails">
        <StaticInstances items={RAILS} shadows>
          <boxGeometry />
          <meshStandardMaterial color="#c0c9c5" metalness={0.4} roughness={0.65} />
        </StaticInstances>
        <StaticInstances items={POSTS} shadows>
          <boxGeometry />
          <meshStandardMaterial color="#455a5c" roughness={0.85} />
        </StaticInstances>
        <StaticInstances items={REFLECTORS}>
          <boxGeometry />
          <meshStandardMaterial color="#f3cb6e" roughness={0.7} />
        </StaticInstances>
      </group>
      <StaticInstances items={ISLANDS}>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial flatShading roughness={1} />
      </StaticInstances>
    </group>
  );
}
