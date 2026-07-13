import { Billboard, RoundedBox, Text } from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BLOCK_SIZE,
  GRID_SIZE,
  PITCH,
  ROAD_WIDTH,
  WORLD_HALF,
  type City as CityData,
  type Pos2,
} from "../../shared/city";
import { mulberry32 } from "../../shared/rng";

const blockCenter = (i: number) => -WORLD_HALF + ROAD_WIDTH + BLOCK_SIZE / 2 + i * PITCH;
const roadCenter = (i: number) => -WORLD_HALF + i * PITCH + ROAD_WIDTH / 2;
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

/** Facade texture: concrete panels + window grid; separate emissive canvas lights a random subset warm. */
function makeFacadeTextures() {
  const size = 256,
    map = document.createElement("canvas"),
    glow = document.createElement("canvas");
  map.width = map.height = glow.width = glow.height = size;
  const m = map.getContext("2d")!,
    g = glow.getContext("2d")!;
  m.fillStyle = "#f4d6a2";
  m.fillRect(0, 0, size, size);
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const rng = mulberry32(7);
  const cols = 6,
    rows = 8,
    cw = size / cols,
    rh = size / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const x = c * cw + cw * 0.22,
        y = r * rh + rh * 0.2,
        w = cw * 0.56,
        h = rh * 0.55;
      const lit = rng() < 0.38;
      m.fillStyle = lit ? "#fff0a8" : "#14344c";
      m.beginPath();
      m.roundRect(x, y, w, h, 4);
      m.fill();
      if (lit) {
        g.fillStyle = `rgba(255, ${200 + Math.floor(rng() * 40)}, 140, 1)`;
        g.beginPath();
        g.roundRect(x, y, w, h, 4);
        g.fill();
      }
    }
  const mapTexture = new THREE.CanvasTexture(map),
    glowTexture = new THREE.CanvasTexture(glow);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  return { mapTexture, glowTexture };
}

function makeAsphaltTexture() {
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#242b31";
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(11);
  for (let i = 0; i < 1400; i++) {
    const v = 28 + Math.floor(rng() * 28);
    ctx.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
    ctx.fillRect(rng() * size, rng() * size, 1.6, 1.6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(48, 48);
  return texture;
}

function Buildings({ city }: { city: CityData }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { mapTexture, glowTexture } = useMemo(makeFacadeTextures, []);
  const colors = useMemo(
    () => city.buildings.map((b) => new THREE.Color(b.color).multiplyScalar(1.28)),
    [city],
  );
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.035), []);
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const matrix = new THREE.Matrix4();
    city.buildings.forEach((b, i) => {
      matrix.compose(
        new THREE.Vector3(b.x, b.h / 2, b.z),
        new THREE.Quaternion(),
        new THREE.Vector3(b.w, b.h, b.d),
      );
      instanced.setMatrixAt(i, matrix);
      instanced.setColorAt(i, colors[i]!);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [city, colors]);
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, city.buildings.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        map={mapTexture}
        emissiveMap={glowTexture}
        emissive="#ffb65e"
        emissiveIntensity={0.26}
        roughness={0.78}
      />
    </instancedMesh>
  );
}

function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  items: {
    pos: [number, number, number];
    scale?: number | [number, number, number];
    rotY?: number;
  }[],
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((it, i) => {
      const s = it.scale ?? 1;
      const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
      q.setFromAxisAngle(up, it.rotY ?? 0);
      matrix.compose(new THREE.Vector3(...it.pos), q, sv);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [ref, items]);
}

function RoadMarkings() {
  const dashes = useMemo(() => {
    const items: {
      pos: [number, number, number];
      scale: [number, number, number];
      rotY?: number;
    }[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      const c = roadCenter(i);
      for (let d = -WORLD_HALF + 4; d < WORLD_HALF - 4; d += 7) {
        items.push({ pos: [c, 0.03, d + 1.5], scale: [0.35, 1, 3] });
        items.push({ pos: [d + 1.5, 0.03, c], scale: [3, 1, 0.35] });
      }
    }
    return items;
  }, []);
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
    const yellow: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
    const black: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
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
    const items: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const x = roadCenter(gx),
          z = roadCenter(gz);
        for (let s = -2; s <= 2; s++) {
          items.push({ pos: [x + s * 1.65, 0.05, z + ROAD_WIDTH / 2 - 1.2], scale: [0.92, 0.025, 3.8] });
          items.push({ pos: [x + ROAD_WIDTH / 2 - 1.2, 0.05, z + s * 1.65], scale: [3.8, 0.025, 0.92] });
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

function PalmTrees({ city, seed }: { city: CityData; seed: number }) {
  const { trunks, fronds } = useMemo(() => {
    const rng = mulberry32(seed ^ 0xc0a57),
      trunks: { pos: [number, number, number]; scale: [number, number, number]; rotY?: number }[] = [],
      fronds: { pos: [number, number, number]; scale: [number, number, number]; rotY?: number }[] = [];
    const spots: Pos2[] = [];
    for (const [x, z] of city.parks)
      for (let i = 0; i < 3; i++) spots.push([x + (rng() - 0.5) * 23, z + (rng() - 0.5) * 23]);
    for (let i = 0; i < GRID_SIZE; i++) {
      spots.push([blockCenter(i), -WORLD_HALF + ROAD_WIDTH + 2.2]);
      if (i % 2 === 0) spots.push([WORLD_HALF - ROAD_WIDTH - 2.2, blockCenter(i)]);
    }
    for (const [x, z] of spots) {
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
  { label: "RUSH RADIO", color: "#00d9ff", pos: [blockCenter(1), 22, blockCenter(1)] as const },
  { label: "COAST FUEL", color: "#ffd400", pos: [blockCenter(6), 26, blockCenter(2)] as const },
  { label: "SUNSET MALL", color: "#ff5b35", pos: [blockCenter(3), 20, blockCenter(5)] as const },
  { label: "DASH FM", color: "#7cff66", pos: [blockCenter(6), 18, blockCenter(6)] as const },
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
    const trunks: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
    const canopies: { pos: [number, number, number]; scale: number }[] = [];
    const put = (x: number, z: number) => {
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

function StreetLights() {
  const { poles, heads } = useMemo(() => {
    const poles: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
    const heads: { pos: [number, number, number]; scale: number }[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      const c = roadCenter(i);
      for (let d = -WORLD_HALF + 20; d < WORLD_HALF - 10; d += 55) {
        // on the sidewalk slab (which extends 1.5 into the road), not on the asphalt
        const side = (Math.round(d / 55) % 2 === 0 ? 1 : -1) * (ROAD_WIDTH / 2 + 1.2);
        poles.push({ pos: [c + side, 3.1, d], scale: [0.16, 6.2, 0.16] });
        heads.push({ pos: [c + side, 6.4, d], scale: 0.42 });
        poles.push({ pos: [d, 3.1, c + side], scale: [0.16, 6.2, 0.16] });
        heads.push({ pos: [d, 6.4, c + side], scale: 0.42 });
      }
    }
    return { poles, heads };
  }, []);
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

const awningColors = ["#ff4f2e", "#00aeea", "#25bd69", "#f03363", "#9b62e7", "#ff8a20"];
function Restaurant({ place, index }: { place: { name: string; pos: Pos2 }; index: number }) {
  const accent = awningColors[index % awningColors.length]!;
  return (
    <group position={[place.pos[0], 0, place.pos[1]]} rotation-y={outwardYaw(place.pos)}>
      <RoundedBox
        castShadow
        receiveShadow
        position={[0, 1.9, 0]}
        args={[8.5, 3.8, 6]}
        radius={0.22}
        smoothness={3}
      >
        <meshStandardMaterial color="#ffd09b" roughness={0.86} />
      </RoundedBox>
      <mesh position={[0, 1.35, 3.02]}>
        <planeGeometry args={[6.4, 1.9]} />
        <meshStandardMaterial color="#fff0bd" emissive="#ffb84c" emissiveIntensity={0.55} />
      </mesh>
      <RoundedBox
        castShadow
        position={[0, 2.85, 3.4]}
        rotation-x={0.5}
        args={[7.6, 0.16, 1.7]}
        radius={0.07}
        smoothness={2}
      >
        <meshStandardMaterial color={accent} roughness={0.85} />
      </RoundedBox>
      <RoundedBox position={[0, 4.15, 3.05]} args={[7, 1.1, 0.3]} radius={0.1} smoothness={2}>
        <meshStandardMaterial color="#241f1c" />
      </RoundedBox>
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
const houseColors = ["#ffd28f", "#8bd1ea", "#ff9e96", "#9ddd85", "#d7a2ee"];
function House({ place, index }: { place: { name: string; pos: Pos2 }; index: number }) {
  return (
    <group position={[place.pos[0], 0, place.pos[1]]} rotation-y={outwardYaw(place.pos)}>
      <RoundedBox
        castShadow
        receiveShadow
        position={[0, 1.5, 0]}
        args={[6, 3, 6]}
        radius={0.2}
        smoothness={3}
      >
        <meshStandardMaterial color={houseColors[index % houseColors.length]} roughness={0.95} />
      </RoundedBox>
      <mesh castShadow position={[0, 4.05, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[4.7, 2.1, 4]} />
        <meshStandardMaterial color="#e85c42" roughness={0.86} flatShading />
      </mesh>
      <mesh position={[0, 0.95, 3.02]}>
        <planeGeometry args={[1.1, 1.9]} />
        <meshStandardMaterial color="#4a3527" />
      </mesh>
      <mesh position={[-1.8, 1.6, 3.02]}>
        <planeGeometry args={[1.2, 1.1]} />
        <meshStandardMaterial color="#ffe6b0" emissive="#ffd98c" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[1.8, 1.6, 3.02]}>
        <planeGeometry args={[1.2, 1.1]} />
        <meshStandardMaterial color="#ffe6b0" emissive="#ffd98c" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

export function City({ city, seed }: { city: CityData; seed: number }) {
  const asphalt = useMemo(makeAsphaltTexture, []);
  return (
    <group>
      {/* asphalt ground */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[WORLD_HALF * 2 + 120, WORLD_HALF * 2 + 120]} />
        <meshStandardMaterial map={asphalt} roughness={0.96} />
      </mesh>
      {/* blocks: sidewalk slab + surface (grass for parks, concrete otherwise) */}
      {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
        const gx = i % GRID_SIZE,
          gz = Math.floor(i / GRID_SIZE),
          px = blockCenter(gx),
          pz = blockCenter(gz);
        const park = city.parks.some((p) => Math.abs(p[0] - px) < 1 && Math.abs(p[1] - pz) < 1);
        return (
          <group key={i} position={[px, 0, pz]}>
            <RoundedBox
              position={[0, 0.06, 0]}
              args={[BLOCK_SIZE + 3, 0.24, BLOCK_SIZE + 3]}
              radius={0.1}
              smoothness={2}
              receiveShadow
            >
              <meshStandardMaterial color="#ffd36e" roughness={0.86} />
            </RoundedBox>
            <RoundedBox
              position={[0, 0.2, 0]}
              args={[BLOCK_SIZE - 1, 0.16, BLOCK_SIZE - 1]}
              radius={0.07}
              smoothness={2}
              receiveShadow
            >
              <meshStandardMaterial color={park ? "#4fb85d" : "#d9c7aa"} roughness={0.92} />
            </RoundedBox>
          </group>
        );
      })}
      <RoadMarkings />
      <Crosswalks />
      <ArcadeCurbs />
      <Buildings city={city} />
      <Greenery city={city} seed={seed} />
      <PalmTrees city={city} seed={seed} />
      <StreetLights />
      <ArcadeSigns />
      {city.restaurants.map((p, i) => (
        <Restaurant key={`r${p.id}`} place={p} index={i} />
      ))}
      {city.houses.map((p, i) => (
        <House key={`h${p.id}`} place={p} index={i} />
      ))}
    </group>
  );
}
