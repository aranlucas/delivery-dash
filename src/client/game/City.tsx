import { Billboard, RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BLOCK_SIZE,
  GRID_SIZE,
  PITCH,
  ROAD_WIDTH,
  WORLD_HALF,
  blockCenter,
  nearExpressway,
  roadCenter,
  type AABB,
  type City as CityData,
  type Pos2,
  type Ramp,
} from "../../shared/city";
import { mulberry32 } from "../../shared/rng";
import { makeFleetGeometry } from "./carGeometry";
import { trafficCars, updateTraffic } from "./traffic";
import {
  FACADE_STYLES,
  FACADE_TILE_X,
  FACADE_TILE_Y,
  makeAsphaltTexture,
  makeBoostPadTexture,
  makeConcreteTexture,
  makeFacade,
  makeGrassTexture,
  makePavingTexture,
  makeRampHazardTexture,
} from "./textures";

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const tint = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Yaw that turns a place's +z front toward the street corner it sits in. */
function outwardYaw([x, z]: Pos2) {
  const grid = (v: number) =>
    blockCenter(
      Math.max(
        0,
        Math.min(GRID_SIZE - 1, Math.round((v + WORLD_HALF - ROAD_WIDTH - BLOCK_SIZE / 2) / PITCH)),
      ),
    );
  return Math.atan2(Math.sign(x - grid(x)) || 1, Math.sign(z - grid(z)) || 1);
}

/**
 * Facades tile per storey instead of stretching over the whole box: a per-instance size attribute
 * scales the UVs in the shader, picking the right pair of dimensions for whichever face is drawn.
 * Without this a forty-metre tower and a nine-metre shop wear windows of wildly different sizes.
 */
function facadeMaterial(map: THREE.Texture, emissiveMap: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: new THREE.Color("#ffb65e"),
    emissiveIntensity: 0.3,
    roughness: 0.82,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 facadeSize;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vec2 facadeScale = abs(normal.x) > 0.5
          ? vec2(facadeSize.z, facadeSize.y)
          : abs(normal.y) > 0.5
            ? vec2(facadeSize.x, facadeSize.z)
            : vec2(facadeSize.x, facadeSize.y);
        #ifdef USE_MAP
          vMapUv *= facadeScale;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv *= facadeScale;
        #endif`,
      );
  };
  return material;
}

function BuildingDistrict({
  buildings,
  style,
}: {
  buildings: CityData["buildings"];
  style: (typeof FACADE_STYLES)[number];
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => {
    const { mapTexture, glowTexture } = makeFacade(style);
    return facadeMaterial(mapTexture, glowTexture);
  }, [style]);
  const geometry = useMemo(() => {
    const shape = new RoundedBoxGeometry(1, 1, 1, 2, 0.035);
    shape.setAttribute(
      "facadeSize",
      new THREE.InstancedBufferAttribute(
        new Float32Array(
          buildings.flatMap((b) => [b.w / FACADE_TILE_X, b.h / FACADE_TILE_Y, b.d / FACADE_TILE_X]),
        ),
        3,
      ),
    );
    return shape;
  }, [buildings]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.emissiveMap?.dispose();
      material.dispose();
      geometry.dispose();
    },
    [geometry, material],
  );
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    buildings.forEach((b, i) => {
      instanced.setMatrixAt(
        i,
        matrix.compose(
          position.set(b.x, b.h / 2, b.z),
          quaternion.identity(),
          scale.set(b.w, b.h, b.d),
        ),
      );
      instanced.setColorAt(i, tint.set(b.color).multiplyScalar(1.22));
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [buildings]);
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, Math.max(1, buildings.length)]}
      castShadow
      receiveShadow
    />
  );
}

function Buildings({ city }: { city: CityData }) {
  const districts = useMemo(
    () => FACADE_STYLES.map((_, index) => city.buildings.filter((b) => b.district === index)),
    [city],
  );
  return (
    <>
      {FACADE_STYLES.map((style, index) => (
        <BuildingDistrict key={style.seed} buildings={districts[index]!} style={style} />
      ))}
    </>
  );
}

type Instance = {
  pos: [number, number, number];
  scale?: number | [number, number, number];
  rotY?: number;
  rotX?: number;
  color?: string;
};

function useInstances(ref: React.RefObject<THREE.InstancedMesh | null>, items: Instance[]) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(1, 0, 0);
    const color = new THREE.Color();
    items.forEach((it, i) => {
      const s = it.scale ?? 1;
      const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
      q.setFromAxisAngle(up, it.rotY ?? 0);
      if (it.rotX) q.multiply(tilt.setFromAxisAngle(right, it.rotX));
      matrix.compose(new THREE.Vector3(...it.pos), q, sv);
      mesh.setMatrixAt(i, matrix);
      if (it.color) mesh.setColorAt(i, color.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, items]);
}

/** Box instance that exactly fills a solid AABB, so visuals and collision never disagree. */
const boxInstance = (box: AABB): Instance => ({
  pos: [(box.minX + box.maxX) / 2, (box.base + box.top) / 2, (box.minZ + box.maxZ) / 2],
  scale: [box.maxX - box.minX, box.top - box.base, box.maxZ - box.minZ],
});

/** City blocks are all the same size, so the sidewalk slab and its surface instance cleanly. */
function Blocks({ city }: { city: CityData }) {
  const { slabs, parkTops, cityTops } = useMemo(() => {
    const slabs: Instance[] = [],
      parkTops: Instance[] = [],
      cityTops: Instance[] = [];
    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const x = blockCenter(gx),
          z = blockCenter(gz);
        slabs.push({ pos: [x, 0.06, z] });
        const park = city.parks.some((p) => Math.abs(p[0] - x) < 1 && Math.abs(p[1] - z) < 1);
        (park ? parkTops : cityTops).push({ pos: [x, 0.2, z] });
      }
    return { slabs, parkTops, cityTops };
  }, [city]);
  const slabGeometry = useMemo(
    () => new RoundedBoxGeometry(BLOCK_SIZE + 3, 0.24, BLOCK_SIZE + 3, 2, 0.1),
    [],
  );
  const topGeometry = useMemo(
    () => new RoundedBoxGeometry(BLOCK_SIZE - 1, 0.16, BLOCK_SIZE - 1, 2, 0.07),
    [],
  );
  const paving = useMemo(makePavingTexture, []);
  const grass = useMemo(makeGrassTexture, []);
  useEffect(
    () => () => {
      slabGeometry.dispose();
      topGeometry.dispose();
      paving.dispose();
      grass.dispose();
    },
    [grass, paving, slabGeometry, topGeometry],
  );
  const slabMesh = useRef<THREE.InstancedMesh>(null),
    parkMesh = useRef<THREE.InstancedMesh>(null),
    cityMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(slabMesh, slabs);
  useInstances(parkMesh, parkTops);
  useInstances(cityMesh, cityTops);
  return (
    <>
      <instancedMesh ref={slabMesh} args={[slabGeometry, undefined, slabs.length]} receiveShadow>
        <meshStandardMaterial color="#ffd36e" roughness={0.86} />
      </instancedMesh>
      <instancedMesh
        ref={parkMesh}
        args={[topGeometry, undefined, Math.max(1, parkTops.length)]}
        receiveShadow
      >
        <meshStandardMaterial map={grass} roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={cityMesh}
        args={[topGeometry, undefined, Math.max(1, cityTops.length)]}
        receiveShadow
      >
        <meshStandardMaterial map={paving} roughness={0.92} />
      </instancedMesh>
    </>
  );
}

function RoadMarkings({ city }: { city: CityData }) {
  const dashes = useMemo(() => {
    const items: Instance[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      const c = roadCenter(i);
      for (let d = -WORLD_HALF + 4; d < WORLD_HALF - 4; d += 7) {
        items.push({ pos: [c, 0.03, d + 1.5], scale: [0.35, 1, 3] });
        items.push({ pos: [d + 1.5, 0.03, c], scale: [3, 1, 0.35] });
      }
    }
    // Lane dashes carry on across the elevated decks.
    for (const deck of city.decks) {
      const alongX = deck.maxX - deck.minX > deck.maxZ - deck.minZ;
      const from = alongX ? deck.minX : deck.minZ,
        to = alongX ? deck.maxX : deck.maxZ;
      const cross = alongX ? (deck.minZ + deck.maxZ) / 2 : (deck.minX + deck.maxX) / 2;
      for (let d = from + 3; d < to - 3; d += 7)
        items.push(
          alongX
            ? { pos: [d + 1.5, deck.height + 0.03, cross], scale: [3, 1, 0.35] }
            : { pos: [cross, deck.height + 0.03, d + 1.5], scale: [0.35, 1, 3] },
        );
    }
    return items;
  }, [city]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useInstances(mesh, dashes);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, dashes.length]}>
      <boxGeometry args={[1, 0.02, 1]} />
      <meshStandardMaterial color="#c9cdd3" roughness={0.8} />
    </instancedMesh>
  );
}

function ArcadeCurbs() {
  const { yellow, black } = useMemo(() => {
    const yellow: Instance[] = [];
    const black: Instance[] = [];
    const edge = BLOCK_SIZE / 2 + 1.62;
    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const cx = blockCenter(gx),
          cz = blockCenter(gz);
        for (let n = -BLOCK_SIZE / 2 + 2; n < BLOCK_SIZE / 2; n += 4) {
          const target = (Math.floor((n + BLOCK_SIZE / 2) / 4) + gx + gz) % 2 ? black : yellow;
          target.push({ pos: [cx + n, 0.31, cz - edge], scale: [4.05, 0.38, 0.46] });
          target.push({ pos: [cx + n, 0.31, cz + edge], scale: [4.05, 0.38, 0.46] });
          target.push({ pos: [cx - edge, 0.31, cz + n], scale: [0.46, 0.38, 4.05] });
          target.push({ pos: [cx + edge, 0.31, cz + n], scale: [0.46, 0.38, 4.05] });
        }
      }
    return { yellow, black };
  }, []);
  const yellowMesh = useRef<THREE.InstancedMesh>(null),
    blackMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(yellowMesh, yellow);
  useInstances(blackMesh, black);
  return (
    <>
      <instancedMesh ref={yellowMesh} args={[undefined, undefined, yellow.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#ffd400" roughness={0.72} />
      </instancedMesh>
      <instancedMesh ref={blackMesh} args={[undefined, undefined, black.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#15191d" roughness={0.82} />
      </instancedMesh>
    </>
  );
}

function Crosswalks() {
  const stripes = useMemo(() => {
    const items: Instance[] = [];
    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const x = roadCenter(gx),
          z = roadCenter(gz);
        for (let s = -2; s <= 2; s++) {
          items.push({
            pos: [x + s * 1.65, 0.05, z + ROAD_WIDTH / 2 - 1.2],
            scale: [0.92, 0.025, 3.8],
          });
          items.push({
            pos: [x + ROAD_WIDTH / 2 - 1.2, 0.05, z + s * 1.65],
            scale: [3.8, 0.025, 0.92],
          });
        }
      }
    return items;
  }, []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useInstances(mesh, stripes);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, stripes.length]}>
      <boxGeometry />
      <meshBasicMaterial color="#fff2c4" />
    </instancedMesh>
  );
}

/**
 * Wedge whose top face follows the same profile the physics samples, so what you see is what you
 * drive. Local +z climbs; the mesh is rotated into place by the ramp's yaw.
 */
function makeRampGeometry(ramp: Pick<Ramp, "kind" | "length" | "width" | "height">) {
  const segments = ramp.kind === "kicker" ? 10 : 16;
  const halfW = ramp.width / 2,
    halfL = ramp.length / 2;
  const TILE = 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  type Vertex = [number, number, number];
  type UV = [number, number];
  const quad = (corners: [Vertex, Vertex, Vertex, Vertex], texels: [UV, UV, UV, UV]) => {
    const [a, b, c, d] = corners;
    const [ta, tb, tc, td] = texels;
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    uvs.push(...ta, ...tb, ...tc, ...ta, ...tc, ...td);
  };
  const profile = (t: number) =>
    ramp.height * (ramp.kind === "kicker" ? t ** 1.7 : t * t * (3 - 2 * t));
  const across = ramp.width / TILE;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments,
      t1 = (i + 1) / segments;
    const z0 = -halfL + t0 * ramp.length,
      z1 = -halfL + t1 * ramp.length;
    const y0 = profile(t0),
      y1 = profile(t1);
    const v0 = (z0 + halfL) / TILE,
      v1 = (z1 + halfL) / TILE;
    quad(
      [
        [-halfW, y0, z0],
        [-halfW, y1, z1],
        [halfW, y1, z1],
        [halfW, y0, z0],
      ],
      [
        [0, v0],
        [0, v1],
        [across, v1],
        [across, v0],
      ],
    );
    quad(
      [
        [-halfW, 0, z0],
        [-halfW, 0, z1],
        [-halfW, y1, z1],
        [-halfW, y0, z0],
      ],
      [
        [v0, 0],
        [v1, 0],
        [v1, y1 / TILE],
        [v0, y0 / TILE],
      ],
    );
    quad(
      [
        [halfW, 0, z0],
        [halfW, y0, z0],
        [halfW, y1, z1],
        [halfW, 0, z1],
      ],
      [
        [v0, 0],
        [v0, y0 / TILE],
        [v1, y1 / TILE],
        [v1, 0],
      ],
    );
  }
  quad(
    [
      [-halfW, 0, halfL],
      [halfW, 0, halfL],
      [halfW, ramp.height, halfL],
      [-halfW, ramp.height, halfL],
    ],
    [
      [0, 0],
      [across, 0],
      [across, ramp.height / TILE],
      [0, ramp.height / TILE],
    ],
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function Ramps({ city }: { city: CityData }) {
  const grades = useMemo(() => city.ramps.filter((r) => r.kind === "grade"), [city]);
  const kickers = useMemo(() => city.ramps.filter((r) => r.kind === "kicker"), [city]);
  const gradeGeometries = useMemo(() => grades.map(makeRampGeometry), [grades]);
  const kickerGeometry = useMemo(
    () => makeRampGeometry(kickers[0] ?? { kind: "kicker", length: 10, width: 9.5, height: 2.8 }),
    [kickers],
  );
  const kickerItems = useMemo<Instance[]>(
    () => kickers.map((r) => ({ pos: [r.x, 0, r.z], rotY: r.yaw })),
    [kickers],
  );
  // Glowing lip along the launch edge of every kicker.
  const lips = useMemo<Instance[]>(
    () =>
      kickers.map((r) => ({
        pos: [
          r.x + Math.sin(r.yaw) * (r.length / 2 - 0.2),
          r.height + 0.12,
          r.z + Math.cos(r.yaw) * (r.length / 2 - 0.2),
        ],
        scale: [r.width, 0.24, 0.5],
        rotY: r.yaw,
      })),
    [kickers],
  );
  const concrete = useMemo(makeConcreteTexture, []);
  const hazard = useMemo(makeRampHazardTexture, []);
  useEffect(
    () => () => {
      for (const geometry of gradeGeometries) geometry.dispose();
      kickerGeometry.dispose();
      concrete.dispose();
      hazard.dispose();
    },
    [concrete, gradeGeometries, hazard, kickerGeometry],
  );
  const kickerMesh = useRef<THREE.InstancedMesh>(null),
    lipMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(kickerMesh, kickerItems);
  useInstances(lipMesh, lips);
  return (
    <>
      {grades.map((ramp, i) => (
        <mesh
          key={`${ramp.x}:${ramp.z}:${ramp.yaw}`}
          geometry={gradeGeometries[i]}
          position={[ramp.x, 0, ramp.z]}
          rotation-y={ramp.yaw}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial map={concrete} roughness={0.94} />
        </mesh>
      ))}
      <instancedMesh
        ref={kickerMesh}
        args={[kickerGeometry, undefined, Math.max(1, kickers.length)]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={hazard} roughness={0.72} />
      </instancedMesh>
      <instancedMesh ref={lipMesh} args={[undefined, undefined, Math.max(1, lips.length)]}>
        <boxGeometry />
        <meshStandardMaterial color="#ffe89a" emissive="#ffd400" emissiveIntensity={1.6} />
      </instancedMesh>
    </>
  );
}

function Expressway({ city }: { city: CityData }) {
  const concrete = useMemo(makeConcreteTexture, []);
  useEffect(() => () => concrete.dispose(), [concrete]);
  const pillars = useMemo(() => city.pillars.map(boxInstance), [city]);
  const rails = useMemo(() => city.rails.map(boxInstance), [city]);
  const pillarMesh = useRef<THREE.InstancedMesh>(null),
    railMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(pillarMesh, pillars);
  useInstances(railMesh, rails);
  return (
    <>
      {city.decks.map((deck) => (
        <mesh
          key={`${deck.minX}:${deck.minZ}`}
          position={[(deck.minX + deck.maxX) / 2, deck.height - 0.45, (deck.minZ + deck.maxZ) / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[deck.maxX - deck.minX, 0.9, deck.maxZ - deck.minZ]} />
          <meshStandardMaterial color="#4a525b" roughness={0.95} />
        </mesh>
      ))}
      <instancedMesh
        ref={pillarMesh}
        args={[undefined, undefined, Math.max(1, pillars.length)]}
        castShadow
        receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial map={concrete} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={railMesh} args={[undefined, undefined, Math.max(1, rails.length)]}>
        <boxGeometry />
        <meshStandardMaterial
          color="#ffd400"
          emissive="#a35c00"
          emissiveIntensity={0.35}
          roughness={0.6}
        />
      </instancedMesh>
    </>
  );
}

function BoostPads({ city }: { city: CityData }) {
  const texture = useMemo(makeBoostPadTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const pads = useMemo<Instance[]>(
    () =>
      city.boostPads.map((p) => ({
        pos: [p.x, p.y + 0.09, p.z],
        scale: [3.4, 0.1, 8],
        rotY: p.yaw,
      })),
    [city],
  );
  const mesh = useRef<THREE.InstancedMesh>(null);
  useInstances(mesh, pads);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, pads.length)]}>
      <boxGeometry />
      <meshStandardMaterial
        map={texture}
        emissiveMap={texture}
        emissive="#3ad9ff"
        emissiveIntensity={1.5}
      />
    </instancedMesh>
  );
}

function PalmTrees({ city, seed }: { city: CityData; seed: number }) {
  const { trunks, fronds } = useMemo(() => {
    const rng = mulberry32(seed ^ 0xc0a57),
      trunks: Instance[] = [],
      fronds: Instance[] = [];
    const spots: Pos2[] = [];
    for (const [x, z] of city.parks)
      for (let i = 0; i < 3; i++) spots.push([x + (rng() - 0.5) * 23, z + (rng() - 0.5) * 23]);
    for (let i = 0; i < GRID_SIZE; i++) {
      spots.push([blockCenter(i), -WORLD_HALF + ROAD_WIDTH + 2.2]);
      if (i % 2 === 0) spots.push([WORLD_HALF - ROAD_WIDTH - 2.2, blockCenter(i)]);
    }
    for (const [x, z] of spots) {
      if (nearExpressway(city, x, z, 3)) continue;
      const h = 6.6 + rng() * 2.3;
      trunks.push({ pos: [x, h / 2, z], scale: [0.42, h, 0.42], rotY: rng() });
      for (let f = 0; f < 6; f++) {
        const yaw = (f / 6) * Math.PI * 2 + rng() * 0.24;
        fronds.push({
          pos: [x + Math.sin(yaw) * 1.8, h + 0.45, z + Math.cos(yaw) * 1.8],
          scale: [0.58, 0.2, 3.5],
          rotY: yaw,
        });
      }
    }
    return { trunks, fronds };
  }, [city, seed]);
  const trunkMesh = useRef<THREE.InstancedMesh>(null),
    frondMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(trunkMesh, trunks);
  useInstances(frondMesh, fronds);
  return (
    <>
      <instancedMesh ref={trunkMesh} args={[undefined, undefined, trunks.length]} castShadow>
        <cylinderGeometry args={[0.7, 1, 1, 7]} />
        <meshStandardMaterial color="#8e542d" roughness={0.96} />
      </instancedMesh>
      <instancedMesh ref={frondMesh} args={[undefined, undefined, fronds.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#27a653" roughness={0.88} flatShading />
      </instancedMesh>
    </>
  );
}

const arcadeSigns = [
  { label: "RUSH RADIO", color: "#00d9ff", pos: [blockCenter(2), 30, blockCenter(9)] as const },
  { label: "COAST FUEL", color: "#ffd400", pos: [blockCenter(9), 26, blockCenter(2)] as const },
  { label: "SUNSET MALL", color: "#ff5b35", pos: [blockCenter(5), 44, blockCenter(6)] as const },
  { label: "DASH FM", color: "#7cff66", pos: [blockCenter(10), 22, blockCenter(8)] as const },
  { label: "SKY EXPRESSWAY", color: "#ff9d33", pos: [blockCenter(4), 34, blockCenter(1)] as const },
];

function ArcadeSigns() {
  return (
    <Suspense fallback={null}>
      {arcadeSigns.map((sign) => (
        <Billboard key={sign.label} position={sign.pos}>
          <RoundedBox args={[10.5, 4.2, 0.45]} radius={0.18} smoothness={3}>
            <meshStandardMaterial color="#12161b" roughness={0.7} />
          </RoundedBox>
          <Text
            position={[0, 0, 0.28]}
            fontSize={1.35}
            fontWeight={800}
            color={sign.color}
            outlineWidth={0.045}
            outlineColor="#050708"
          >
            {sign.label}
          </Text>
        </Billboard>
      ))}
    </Suspense>
  );
}

function Greenery({ city, seed }: { city: CityData; seed: number }) {
  const { trunks, canopies } = useMemo(() => {
    const rng = mulberry32(seed ^ 0x7ee5);
    const trunks: Instance[] = [];
    const canopies: Instance[] = [];
    const put = (x: number, z: number) => {
      if (nearExpressway(city, x, z, 2.5)) return;
      const h = 2.6 + rng() * 2.2;
      trunks.push({ pos: [x, h / 2, z], scale: [0.35, h, 0.35] });
      canopies.push({ pos: [x, h + 1.1, z], scale: 1.7 + rng() * 1.3 });
    };
    for (const [px, pz] of city.parks)
      for (let n = 0; n < 8; n++)
        put(px + (rng() - 0.5) * (BLOCK_SIZE - 8), pz + (rng() - 0.5) * (BLOCK_SIZE - 8));
    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++)
        if (rng() < 0.55)
          put(
            blockCenter(gx) + (rng() < 0.5 ? -1 : 1) * (BLOCK_SIZE / 2 + 1.2),
            blockCenter(gz) + (rng() - 0.5) * BLOCK_SIZE * 0.8,
          );
    return { trunks, canopies };
  }, [city, seed]);
  const trunkMesh = useRef<THREE.InstancedMesh>(null),
    canopyMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(trunkMesh, trunks);
  useInstances(canopyMesh, canopies);
  return (
    <>
      <instancedMesh ref={trunkMesh} args={[undefined, undefined, trunks.length]} castShadow>
        <cylinderGeometry args={[0.5, 0.65, 1, 6]} />
        <meshStandardMaterial color="#5d4630" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={canopyMesh} args={[undefined, undefined, canopies.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#3f7443" roughness={0.95} flatShading />
      </instancedMesh>
    </>
  );
}

function StreetLights({ city }: { city: CityData }) {
  const { poles, heads } = useMemo(() => {
    const poles: Instance[] = [];
    const heads: Instance[] = [];
    const put = (x: number, z: number) => {
      if (nearExpressway(city, x, z, 1)) return;
      poles.push({ pos: [x, 3.1, z], scale: [0.16, 6.2, 0.16] });
      heads.push({ pos: [x, 6.4, z], scale: 0.42 });
    };
    for (let i = 0; i < GRID_SIZE; i++) {
      const c = roadCenter(i);
      for (let d = -WORLD_HALF + 20; d < WORLD_HALF - 10; d += 55) {
        // on the sidewalk slab (which extends 1.5 into the road), not on the asphalt
        const side = (Math.round(d / 55) % 2 === 0 ? 1 : -1) * (ROAD_WIDTH / 2 + 1.2);
        put(c + side, d);
        put(d, c + side);
      }
    }
    return { poles, heads };
  }, [city]);
  const poleMesh = useRef<THREE.InstancedMesh>(null),
    headMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(poleMesh, poles);
  useInstances(headMesh, heads);
  return (
    <>
      <instancedMesh ref={poleMesh} args={[undefined, undefined, poles.length]}>
        <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
        <meshStandardMaterial color="#3a3f46" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={headMesh} args={[undefined, undefined, heads.length]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#ffe9bd" emissive="#ffdf9e" emissiveIntensity={2.4} />
      </instancedMesh>
    </>
  );
}

const ONE = new THREE.Vector3(1, 1, 1);

/** One fleet of background cars: painted bodywork plus shared trim, headlamp and tail-lamp passes. */
function useCarFleet(colors: string[]) {
  const parts = useMemo(makeFleetGeometry, []);
  useEffect(
    () => () => {
      parts.painted.dispose();
      parts.trim.dispose();
      parts.headlights.dispose();
      parts.taillights.dispose();
    },
    [parts],
  );
  const painted = useRef<THREE.InstancedMesh>(null),
    trim = useRef<THREE.InstancedMesh>(null),
    heads = useRef<THREE.InstancedMesh>(null),
    tails = useRef<THREE.InstancedMesh>(null);
  const fleet = useMemo(() => [painted, trim, heads, tails] as const, []);
  useLayoutEffect(() => {
    if (!painted.current) return;
    colors.forEach((color, i) => painted.current!.setColorAt(i, tint.set(color)));
    if (painted.current.instanceColor) painted.current.instanceColor.needsUpdate = true;
  }, [colors]);
  const write = useCallback(
    (index: number, x: number, z: number, yaw: number) => {
      matrix.compose(position.set(x, 0, z), quaternion.setFromAxisAngle(UP, yaw), ONE);
      for (const ref of fleet) ref.current?.setMatrixAt(index, matrix);
    },
    [fleet],
  );
  const flush = useCallback(() => {
    for (const ref of fleet) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [fleet]);
  const count = Math.max(1, colors.length);
  const meshes = (
    <>
      <instancedMesh ref={painted} args={[parts.painted, undefined, count]} castShadow>
        <meshStandardMaterial roughness={0.34} metalness={0.32} />
      </instancedMesh>
      <instancedMesh ref={trim} args={[parts.trim, undefined, count]} castShadow>
        <meshStandardMaterial color="#191d23" roughness={0.4} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[parts.headlights, undefined, count]}>
        <meshStandardMaterial color="#fff6da" emissive="#ffedb8" emissiveIntensity={1.5} />
      </instancedMesh>
      <instancedMesh ref={tails} args={[parts.taillights, undefined, count]}>
        <meshStandardMaterial color="#8a1a12" emissive="#ff2b1e" emissiveIntensity={1.3} />
      </instancedMesh>
    </>
  );
  return { write, flush, meshes };
}

function Traffic({ city }: { city: CityData }) {
  const colors = useMemo(() => city.trafficRoutes.map((route) => route.color), [city]);
  const { write, flush, meshes } = useCarFleet(colors);
  useFrame(({ clock }) => {
    updateTraffic(city, clock.elapsedTime);
    for (let i = 0; i < trafficCars.length; i++) {
      const car = trafficCars[i]!;
      write(i, car.x, car.z, car.yaw);
    }
    flush();
  });
  return meshes;
}

function ParkedCars({ city }: { city: CityData }) {
  const colors = useMemo(() => city.parkedCars.map((car) => car.color), [city]);
  const { write, flush, meshes } = useCarFleet(colors);
  useLayoutEffect(() => {
    city.parkedCars.forEach((car, i) => write(i, car.x, car.z, car.yaw));
    flush();
  }, [city, flush, write]);
  return meshes;
}

/** Signals face the traffic they hold: one head per axis, lit green for through traffic. */
function TrafficSignals() {
  const { poles, heads, green, red, dark } = useMemo(() => {
    const poles: Instance[] = [],
      heads: Instance[] = [],
      green: Instance[] = [],
      red: Instance[] = [],
      dark: Instance[] = [];
    const edge = ROAD_WIDTH / 2 + 1.1;
    const LAMP_Y = { red: 6.15, amber: 5.6, green: 5.05 };
    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const x = roadCenter(gx),
          z = roadCenter(gz);
        for (const [sx, sz, goes] of [
          [1, -1, true],
          [-1, 1, false],
        ] as const) {
          const px = x + sx * edge,
            pz = z + sz * edge;
          poles.push({ pos: [px, 2.7, pz], scale: [0.18, 5.4, 0.18] });
          heads.push({ pos: [px, LAMP_Y.amber, pz], scale: [0.62, 1.7, 0.62] });
          // Lenses sit proud of the housing, on the face turned toward the junction.
          const lx = px - sx * 0.36,
            lz = pz - sz * 0.36;
          (goes ? green : red).push({
            pos: [lx, goes ? LAMP_Y.green : LAMP_Y.red, lz],
            scale: 0.23,
          });
          dark.push({ pos: [lx, LAMP_Y.amber, lz], scale: 0.23 });
          dark.push({ pos: [lx, goes ? LAMP_Y.red : LAMP_Y.green, lz], scale: 0.23 });
        }
      }
    return { poles, heads, green, red, dark };
  }, []);
  const poleMesh = useRef<THREE.InstancedMesh>(null),
    headMesh = useRef<THREE.InstancedMesh>(null),
    greenMesh = useRef<THREE.InstancedMesh>(null),
    redMesh = useRef<THREE.InstancedMesh>(null),
    darkMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(poleMesh, poles);
  useInstances(headMesh, heads);
  useInstances(greenMesh, green);
  useInstances(redMesh, red);
  useInstances(darkMesh, dark);
  return (
    <>
      <instancedMesh ref={poleMesh} args={[undefined, undefined, poles.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#2c3138" metalness={0.5} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={headMesh} args={[undefined, undefined, heads.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#15191d" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={greenMesh} args={[undefined, undefined, green.length]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#8bffb0" emissive="#25e06a" emissiveIntensity={2.6} />
      </instancedMesh>
      <instancedMesh ref={redMesh} args={[undefined, undefined, red.length]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#ffb0a6" emissive="#ff2d1a" emissiveIntensity={2.6} />
      </instancedMesh>
      <instancedMesh ref={darkMesh} args={[undefined, undefined, dark.length]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#242a30" roughness={0.4} />
      </instancedMesh>
    </>
  );
}

/** Kerbside clutter: hydrants, bins and benches spread along the sidewalks. */
function StreetFurniture({ city, seed }: { city: CityData; seed: number }) {
  const { hydrants, bins, benches } = useMemo(() => {
    const rng = mulberry32(seed ^ 0x51de);
    const hydrants: Instance[] = [],
      bins: Instance[] = [],
      benches: Instance[] = [];
    const walk = BLOCK_SIZE / 2 + 0.9;
    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const cx = blockCenter(gx),
          cz = blockCenter(gz);
        for (let n = 0; n < 4; n++) {
          const side = n % 2 ? 1 : -1;
          const alongEdge = (rng() - 0.5) * (BLOCK_SIZE - 8);
          const [x, z] =
            n < 2 ? [cx + alongEdge, cz + side * walk] : [cx + side * walk, cz + alongEdge];
          if (nearExpressway(city, x, z, 2)) continue;
          const roll = rng();
          if (roll < 0.34) hydrants.push({ pos: [x, 0.68, z], scale: [0.34, 0.9, 0.34] });
          else if (roll < 0.68) bins.push({ pos: [x, 0.75, z], scale: [0.7, 1.05, 0.7] });
          else
            benches.push({
              pos: [x, 0.62, z],
              scale: n < 2 ? [2.8, 0.36, 0.7] : [0.7, 0.36, 2.8],
            });
        }
      }
    return { hydrants, bins, benches };
  }, [city, seed]);
  const hydrantMesh = useRef<THREE.InstancedMesh>(null),
    binMesh = useRef<THREE.InstancedMesh>(null),
    benchMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(hydrantMesh, hydrants);
  useInstances(binMesh, bins);
  useInstances(benchMesh, benches);
  return (
    <>
      <instancedMesh ref={hydrantMesh} args={[undefined, undefined, hydrants.length]} castShadow>
        <cylinderGeometry args={[0.5, 0.6, 1, 8]} />
        <meshStandardMaterial color="#d43a2a" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={binMesh} args={[undefined, undefined, bins.length]} castShadow>
        <cylinderGeometry args={[0.5, 0.42, 1, 10]} />
        <meshStandardMaterial color="#2f3a34" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={benchMesh} args={[undefined, undefined, benches.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#8a5a33" roughness={0.95} />
      </instancedMesh>
    </>
  );
}

/** Plant rooms, water tanks and masts break up the flat tops of the taller blocks. */
function Rooftops({ city, seed }: { city: CityData; seed: number }) {
  const { huts, tanks, masts } = useMemo(() => {
    const rng = mulberry32(seed ^ 0x2f00f);
    const huts: Instance[] = [],
      tanks: Instance[] = [],
      masts: Instance[] = [];
    for (const b of city.buildings) {
      if (b.h < 14) continue;
      const hutW = Math.min(b.w, b.d) * 0.34;
      huts.push({
        pos: [b.x + (rng() - 0.5) * b.w * 0.3, b.h + 1.1, b.z + (rng() - 0.5) * b.d * 0.3],
        scale: [hutW, 2.2, hutW],
      });
      if (rng() < 0.45)
        tanks.push({
          pos: [b.x - (rng() - 0.5) * b.w * 0.4, b.h + 1.7, b.z - (rng() - 0.5) * b.d * 0.4],
          scale: [1.5, 3.4, 1.5],
        });
      if (b.h > 30 && rng() < 0.7)
        masts.push({ pos: [b.x, b.h + 4.5, b.z], scale: [0.22, 9, 0.22] });
    }
    return { huts, tanks, masts };
  }, [city, seed]);
  const hutMesh = useRef<THREE.InstancedMesh>(null),
    tankMesh = useRef<THREE.InstancedMesh>(null),
    mastMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(hutMesh, huts);
  useInstances(tankMesh, tanks);
  useInstances(mastMesh, masts);
  return (
    <>
      <instancedMesh
        ref={hutMesh}
        args={[undefined, undefined, Math.max(1, huts.length)]}
        castShadow
      >
        <boxGeometry />
        <meshStandardMaterial color="#9aa1a8" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={tankMesh}
        args={[undefined, undefined, Math.max(1, tanks.length)]}
        castShadow
      >
        <cylinderGeometry args={[0.5, 0.5, 1, 10]} />
        <meshStandardMaterial color="#7d5a3c" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={mastMesh} args={[undefined, undefined, Math.max(1, masts.length)]}>
        <boxGeometry />
        <meshStandardMaterial color="#c8ccd2" metalness={0.6} roughness={0.4} />
      </instancedMesh>
    </>
  );
}

const awningColors = ["#ff4f2e", "#00aeea", "#25bd69", "#f03363", "#9b62e7", "#ff8a20"];
const houseColors = ["#ffd28f", "#8bd1ea", "#ff9e96", "#9ddd85", "#d7a2ee"];

/** Convert an offset inside a yawed place group to an instance in world space. */
function placeOffset(
  [px, pz]: Pos2,
  yaw: number,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [px + x * cosine + z * sine, y, pz - x * sine + z * cosine];
}

/** All repeated place geometry is instanced; only restaurant text remains per-place. */
function PlaceProps({ city }: { city: CityData }) {
  const groups = useMemo(() => {
    const restaurantShells: Instance[] = [];
    const houseShells: Instance[] = [];
    const roofs: Instance[] = [];
    const doors: Instance[] = [];
    const windows: Instance[] = [];
    const signPanels: Instance[] = [];
    const awnings: Instance[] = [];
    const signBoards: Instance[] = [];

    city.houses.forEach((place, index) => {
      const yaw = outwardYaw(place.pos);
      houseShells.push({
        pos: [place.pos[0], 1.5, place.pos[1]],
        rotY: yaw,
        color: houseColors[index % houseColors.length]!,
      });
      roofs.push({ pos: placeOffset(place.pos, yaw, 0, 4.05, 0), rotY: yaw + Math.PI / 4 });
      doors.push({ pos: placeOffset(place.pos, yaw, 0, 0.95, 3.02), rotY: yaw });
      windows.push({ pos: placeOffset(place.pos, yaw, -1.8, 1.6, 3.02), rotY: yaw });
      windows.push({ pos: placeOffset(place.pos, yaw, 1.8, 1.6, 3.02), rotY: yaw });
    });

    city.restaurants.forEach((place, index) => {
      const yaw = outwardYaw(place.pos);
      restaurantShells.push({ pos: [place.pos[0], 1.9, place.pos[1]], rotY: yaw });
      signPanels.push({ pos: placeOffset(place.pos, yaw, 0, 1.35, 3.02), rotY: yaw });
      awnings.push({
        pos: placeOffset(place.pos, yaw, 0, 2.85, 3.4),
        rotY: yaw,
        rotX: 0.5,
        color: awningColors[index % awningColors.length]!,
      });
      signBoards.push({ pos: placeOffset(place.pos, yaw, 0, 4.15, 3.05), rotY: yaw });
    });

    return { restaurantShells, houseShells, roofs, doors, windows, signPanels, awnings, signBoards };
  }, [city]);

  const geometries = useMemo(
    () => ({
      restaurant: new RoundedBoxGeometry(8.5, 3.8, 6, 3, 0.22),
      house: new RoundedBoxGeometry(6, 3, 6, 3, 0.2),
      awning: new RoundedBoxGeometry(7.6, 0.16, 1.7, 2, 0.07),
      signBoard: new RoundedBoxGeometry(7, 1.1, 0.3, 2, 0.1),
    }),
    [],
  );
  const restaurantMesh = useRef<THREE.InstancedMesh>(null);
  const houseMesh = useRef<THREE.InstancedMesh>(null);
  const roofMesh = useRef<THREE.InstancedMesh>(null);
  const doorMesh = useRef<THREE.InstancedMesh>(null);
  const windowMesh = useRef<THREE.InstancedMesh>(null);
  const panelMesh = useRef<THREE.InstancedMesh>(null);
  const awningMesh = useRef<THREE.InstancedMesh>(null);
  const boardMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(restaurantMesh, groups.restaurantShells);
  useInstances(houseMesh, groups.houseShells);
  useInstances(roofMesh, groups.roofs);
  useInstances(doorMesh, groups.doors);
  useInstances(windowMesh, groups.windows);
  useInstances(panelMesh, groups.signPanels);
  useInstances(awningMesh, groups.awnings);
  useInstances(boardMesh, groups.signBoards);

  return (
    <>
      <instancedMesh
        ref={restaurantMesh}
        args={[geometries.restaurant, undefined, groups.restaurantShells.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#ffd09b" roughness={0.86} />
      </instancedMesh>
      <instancedMesh
        ref={houseMesh}
        args={[geometries.house, undefined, groups.houseShells.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="white" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={roofMesh} args={[undefined, undefined, groups.roofs.length]} castShadow>
        <coneGeometry args={[4.7, 2.1, 4]} />
        <meshStandardMaterial color="#e85c42" roughness={0.86} flatShading />
      </instancedMesh>
      <instancedMesh ref={doorMesh} args={[undefined, undefined, groups.doors.length]}>
        <planeGeometry args={[1.1, 1.9]} />
        <meshStandardMaterial color="#4a3527" />
      </instancedMesh>
      <instancedMesh ref={windowMesh} args={[undefined, undefined, groups.windows.length]}>
        <planeGeometry args={[1.2, 1.1]} />
        <meshStandardMaterial color="#ffe6b0" emissive="#ffd98c" emissiveIntensity={0.9} />
      </instancedMesh>
      <instancedMesh ref={panelMesh} args={[undefined, undefined, groups.signPanels.length]}>
        <planeGeometry args={[6.4, 1.9]} />
        <meshStandardMaterial color="#fff0bd" emissive="#ffb84c" emissiveIntensity={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={awningMesh}
        args={[geometries.awning, undefined, groups.awnings.length]}
        castShadow
      >
        <meshStandardMaterial color="white" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={boardMesh} args={[geometries.signBoard, undefined, groups.signBoards.length]}>
        <meshStandardMaterial color="#241f1c" />
      </instancedMesh>
    </>
  );
}

function RestaurantSign({ place }: { place: { name: string; pos: Pos2 } }) {
  return (
    <group position={[place.pos[0], 0, place.pos[1]]} rotation-y={outwardYaw(place.pos)}>
      <Suspense fallback={null}>
        <Text
          position={[0, 4.15, 3.25]}
          fontSize={0.78}
          color="#ffd98c"
          anchorX="center"
          anchorY="middle"
          maxWidth={6.6}
        >
          {place.name}
        </Text>
      </Suspense>
    </group>
  );
}

export function City({ city, seed }: { city: CityData; seed: number }) {
  const asphalt = useMemo(makeAsphaltTexture, []);
  useEffect(() => () => asphalt.dispose(), [asphalt]);
  return (
    <group>
      {/* asphalt ground */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[WORLD_HALF * 2 + 160, WORLD_HALF * 2 + 160]} />
        <meshStandardMaterial map={asphalt} roughness={0.96} />
      </mesh>
      <Blocks city={city} />
      <RoadMarkings city={city} />
      <Crosswalks />
      <ArcadeCurbs />
      <Buildings city={city} />
      <Rooftops city={city} seed={seed} />
      <Ramps city={city} />
      <Expressway city={city} />
      <BoostPads city={city} />
      <ParkedCars city={city} />
      <Traffic city={city} />
      <TrafficSignals />
      <StreetFurniture city={city} seed={seed} />
      <Greenery city={city} seed={seed} />
      <PalmTrees city={city} seed={seed} />
      <StreetLights city={city} />
      <ArcadeSigns />
      <PlaceProps city={city} />
      {city.restaurants.map((place) => (
        <RestaurantSign key={`r${place.id}`} place={place} />
      ))}
    </group>
  );
}
