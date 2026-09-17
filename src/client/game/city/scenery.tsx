import { useMemo, useRef } from "react";
import * as THREE from "three";
import {
  BLOCK_SIZE,
  GRID_SIZE,
  ROAD_WIDTH,
  WORLD_HALF,
  blockCenter,
  zoneAt,
  nearExpressway,
  roadCenter,
  type City as CityData,
  type Pos2,
} from "../../../shared/city";
import { mulberry32 } from "../../../shared/rng";
import { useStreetPropAssets } from "../modelAssets";
import { useInstances, type Instance } from "./instances";

export function PalmTrees({ city, seed }: { city: CityData; seed: number }) {
  const { palmTrunk, palmFrond } = useStreetPropAssets();
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
      if (zoneAt(x, z, 2) || nearExpressway(city, x, z, 3)) continue;
      const h = 6.6 + rng() * 2.3;
      trunks.push({
        pos: [x, h / 2, z],
        scale: [1.35, h / 7, 1.35],
        rotY: rng(),
      });
      for (let f = 0; f < 7; f++) {
        const yaw = (f / 7) * Math.PI * 2 + rng() * 0.2;
        fronds.push({
          pos: [x, h + 0.5, z],
          scale: [0.88 + rng() * 0.2, 0.85 + rng() * 0.15, 0.9 + rng() * 0.16],
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
      <instancedMesh ref={trunkMesh} args={[palmTrunk, undefined, trunks.length]} castShadow>
        <meshStandardMaterial color="#8e542d" roughness={0.96} />
      </instancedMesh>
      <instancedMesh ref={frondMesh} args={[palmFrond, undefined, fronds.length]} castShadow>
        <meshStandardMaterial
          color="#27a653"
          roughness={0.88}
          flatShading
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </>
  );
}

export function Greenery({ city, seed }: { city: CityData; seed: number }) {
  const { trunks, canopies } = useMemo(() => {
    const rng = mulberry32(seed ^ 0x7ee5);
    const trunks: Instance[] = [];
    const canopies: Instance[] = [];
    const put = (x: number, z: number) => {
      if (zoneAt(x, z, 2) || nearExpressway(city, x, z, 2.5)) return;
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

export function StreetLights({ city }: { city: CityData }) {
  const { streetlightPole: poleGeometry, streetlightLens: lensGeometry } = useStreetPropAssets();
  const { poles, heads } = useMemo(() => {
    const poles: Instance[] = [];
    const heads: Instance[] = [];
    const put = (x: number, z: number, yaw: number) => {
      if (nearExpressway(city, x, z, 1)) return;
      poles.push({ pos: [x, 0, z], rotY: yaw });
      heads.push({ pos: [x, 0, z], rotY: yaw });
    };
    for (let i = 0; i < GRID_SIZE; i++) {
      const c = roadCenter(i);
      for (let d = -WORLD_HALF + 20; d < WORLD_HALF - 10; d += 55) {
        // on the sidewalk slab (which extends 1.5 into the road), not on the asphalt
        const side = (Math.round(d / 55) % 2 === 0 ? 1 : -1) * (ROAD_WIDTH / 2 + 1.2);
        put(c + side, d, side > 0 ? -Math.PI / 2 : Math.PI / 2);
        put(d, c + side, side > 0 ? Math.PI : 0);
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
      <instancedMesh ref={poleMesh} args={[poleGeometry, undefined, poles.length]} castShadow>
        <meshStandardMaterial color="#3a3f46" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={headMesh} args={[lensGeometry, undefined, heads.length]}>
        <meshStandardMaterial color="#ffe9bd" emissive="#ffdf9e" emissiveIntensity={2.4} />
      </instancedMesh>
    </>
  );
}

/** Signals face the traffic they hold: one head per axis, lit green for through traffic. */
export function TrafficSignals() {
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
        if (zoneAt(x, z, 8)) continue;
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
          dark.push({
            pos: [lx, goes ? LAMP_Y.red : LAMP_Y.green, lz],
            scale: 0.23,
          });
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
export function StreetFurniture({ city, seed }: { city: CityData; seed: number }) {
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
          if (zoneAt(x, z, 4) || nearExpressway(city, x, z, 2)) continue;
          const roll = rng();
          if (roll < 0.34) hydrants.push({ pos: [x, 0, z] });
          else if (roll < 0.68) bins.push({ pos: [x, 0, z] });
          else
            benches.push({
              pos: [x, 0, z],
              rotY: n < 2 ? 0 : Math.PI / 2,
            });
        }
      }
    return { hydrants, bins, benches };
  }, [city, seed]);
  const {
    hydrant: hydrantGeometry,
    bin: binGeometry,
    bench: benchGeometry,
  } = useStreetPropAssets();
  const hydrantMesh = useRef<THREE.InstancedMesh>(null),
    binMesh = useRef<THREE.InstancedMesh>(null),
    benchMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(hydrantMesh, hydrants);
  useInstances(binMesh, bins);
  useInstances(benchMesh, benches);
  return (
    <>
      <instancedMesh
        ref={hydrantMesh}
        args={[hydrantGeometry, undefined, hydrants.length]}
        castShadow
      >
        <meshStandardMaterial color="#d43a2a" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={binMesh} args={[binGeometry, undefined, bins.length]} castShadow>
        <meshStandardMaterial color="#2f3a34" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={benchMesh} args={[benchGeometry, undefined, benches.length]} castShadow>
        <meshStandardMaterial color="#8a5a33" roughness={0.95} />
      </instancedMesh>
    </>
  );
}

/** Plant rooms, water tanks and masts break up the flat tops of the taller blocks. */
export function Rooftops({ city, seed }: { city: CityData; seed: number }) {
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
