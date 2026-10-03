import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BLOCK_SIZE,
  DECK_HALF,
  GRID_SIZE,
  ROAD_WIDTH,
  WORLD_HALF,
  blockCenter,
  zoneAt,
  roadCenter,
  type City as CityData,
} from "../../../shared/city";
import {
  FACADE_STYLES,
  FACADE_TILE_X,
  FACADE_TILE_Y,
  makeAsphaltTexture,
  makeConcreteTexture,
  makeFacade,
  makeGrassTexture,
  makePavingTexture,
} from "../textures";
import { boxInstance, useInstances, type Instance } from "./instances";

const matrix = new THREE.Matrix4();

const position = new THREE.Vector3();

const quaternion = new THREE.Quaternion();

const scale = new THREE.Vector3();

const tint = new THREE.Color();

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
    const outline = new RoundedBoxGeometry(1, 1, 1, 2, 0.035);
    outline.setAttribute(
      "facadeSize",
      new THREE.InstancedBufferAttribute(
        new Float32Array(
          buildings.flatMap((b) => [b.w / FACADE_TILE_X, b.h / FACADE_TILE_Y, b.d / FACADE_TILE_X]),
        ),
        3,
      ),
    );

    return outline;
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

export function Buildings({ city }: { city: CityData }) {
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

/** City blocks are all the same size, so the sidewalk slab and its surface instance cleanly. */
export function Blocks({ city }: { city: CityData }) {
  const { slabs, parkTops, cityTops } = useMemo(() => {
    const slabs: Instance[] = [],
      parkTops: Instance[] = [],
      cityTops: Instance[] = [];

    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const x = blockCenter(gx),
          z = blockCenter(gz);

        if (zoneAt(x, z)) continue;
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

  const paving = useMemo(() => makePavingTexture(), []);
  const grass = useMemo(() => makeGrassTexture(), []);
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

export function RoadMarkings({ city }: { city: CityData }) {
  const dashes = useMemo(() => {
    const items: Instance[] = [];

    for (let i = 0; i < GRID_SIZE; i++) {
      const c = roadCenter(i);

      for (let d = -WORLD_HALF + 4; d < WORLD_HALF - 4; d += 7) {
        if (!zoneAt(c, d + 1.5)) items.push({ pos: [c, 0.03, d + 1.5], scale: [0.35, 1, 3] });

        if (!zoneAt(d + 1.5, c)) items.push({ pos: [d + 1.5, 0.03, c], scale: [3, 1, 0.35] });
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
            : {
                pos: [cross, deck.height + 0.03, d + 1.5],
                scale: [0.35, 1, 3],
              },
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

export function ArcadeCurbs() {
  const { yellow, black } = useMemo(() => {
    const yellow: Instance[] = [];
    const black: Instance[] = [];
    const edge = BLOCK_SIZE / 2 + 1.62;

    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const cx = blockCenter(gx),
          cz = blockCenter(gz);

        if (zoneAt(cx, cz)) continue;

        for (let n = -BLOCK_SIZE / 2 + 2; n < BLOCK_SIZE / 2; n += 4) {
          const target = (Math.floor((n + BLOCK_SIZE / 2) / 4) + gx + gz) % 2 ? black : yellow;
          target.push({
            pos: [cx + n, 0.31, cz - edge],
            scale: [4.05, 0.38, 0.46],
          });
          target.push({
            pos: [cx + n, 0.31, cz + edge],
            scale: [4.05, 0.38, 0.46],
          });
          target.push({
            pos: [cx - edge, 0.31, cz + n],
            scale: [0.46, 0.38, 4.05],
          });
          target.push({
            pos: [cx + edge, 0.31, cz + n],
            scale: [0.46, 0.38, 4.05],
          });
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

export function Crosswalks() {
  const stripes = useMemo(() => {
    const items: Instance[] = [];

    for (let gx = 0; gx < GRID_SIZE; gx++)
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const x = roadCenter(gx),
          z = roadCenter(gz);

        if (zoneAt(x, z, 8)) continue;

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

export { Ramps } from "../ramp-structures";

export function Expressway({ city }: { city: CityData }) {
  const concrete = useMemo(() => makeConcreteTexture(), []);

  const asphalt = useMemo(() => {
    const texture = makeAsphaltTexture();
    texture.repeat.set(1, 1);

    return texture;
  }, []);

  const decks = useMemo(
    () =>
      city.decks.map((deck) => {
        const width = deck.maxX - deck.minX,
          depth = deck.maxZ - deck.minZ;

        const geometry = new THREE.PlaneGeometry(width, depth);
        const uv = geometry.attributes.uv!;

        for (let i = 0; i < uv.count; i++)
          uv.setXY(i, (uv.getX(i) * width) / 4, (uv.getY(i) * depth) / 4);

        return { deck, geometry };
      }),
    [city],
  );

  useEffect(
    () => () => {
      concrete.dispose();
      asphalt.dispose();
    },
    [concrete, asphalt],
  );
  useEffect(
    () => () => {
      for (const { geometry } of decks) geometry.dispose();
    },
    [decks],
  );
  const pillars = useMemo(() => city.pillars.map(boxInstance), [city]);
  const rails = useMemo(() => city.rails.map(boxInstance), [city]);

  const caps = useMemo<Instance[]>(
    () =>
      city.rails.map((box) => ({
        pos: [(box.minX + box.maxX) / 2, box.top + 0.015, (box.minZ + box.maxZ) / 2],
        scale: [box.maxX - box.minX, 0.03, box.maxZ - box.minZ],
      })),
    [city],
  );

  const markings = useMemo<Instance[]>(() => {
    const items: Instance[] = [];

    for (const deck of city.decks) {
      const alongX = deck.maxX - deck.minX > deck.maxZ - deck.minZ;
      const start = alongX ? deck.minX : deck.minZ;
      const end = alongX ? deck.maxX : deck.maxZ;
      const cross = alongX ? (deck.minZ + deck.maxZ) / 2 : (deck.minX + deck.maxX) / 2;

      for (let u = start + 1; u + 3 < end; u += 7)
        items.push({
          pos: alongX
            ? [u + 1.5, deck.height + 0.025, cross]
            : [cross, deck.height + 0.025, u + 1.5],
          scale: alongX ? [3, 0.025, 0.14] : [0.14, 0.025, 3],
        });

      for (const side of [-1, 1]) {
        const edge = cross + side * (DECK_HALF - 0.75);
        items.push({
          pos: alongX
            ? [(start + end) / 2, deck.height + 0.025, edge]
            : [edge, deck.height + 0.025, (start + end) / 2],
          scale: alongX ? [end - start, 0.025, 0.16] : [0.16, 0.025, end - start],
        });
      }
    }

    return items;
  }, [city]);

  const pillarMesh = useRef<THREE.InstancedMesh>(null),
    railMesh = useRef<THREE.InstancedMesh>(null),
    capMesh = useRef<THREE.InstancedMesh>(null),
    paintMesh = useRef<THREE.InstancedMesh>(null);

  useInstances(pillarMesh, pillars);
  useInstances(railMesh, rails);
  useInstances(capMesh, caps);
  useInstances(paintMesh, markings);

  return (
    <>
      {decks.map(({ deck, geometry }) => (
        <group key={`${deck.minX}:${deck.minZ}`}>
          <mesh
            position={[
              (deck.minX + deck.maxX) / 2,
              deck.height - 0.45,
              (deck.minZ + deck.maxZ) / 2,
            ]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[deck.maxX - deck.minX, 0.9, deck.maxZ - deck.minZ]} />
            <meshStandardMaterial map={concrete} color="#dad3c2" roughness={0.93} />
          </mesh>
          <mesh
            geometry={geometry}
            position={[
              (deck.minX + deck.maxX) / 2,
              deck.height + 0.008,
              (deck.minZ + deck.maxZ) / 2,
            ]}
            rotation-x={-Math.PI / 2}
            receiveShadow
          >
            <meshStandardMaterial map={asphalt} roughness={0.97} />
          </mesh>
        </group>
      ))}
      <instancedMesh
        ref={pillarMesh}
        args={[undefined, undefined, pillars.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial map={concrete} color="#d0c9b9" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={railMesh}
        args={[undefined, undefined, rails.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial map={concrete} color="#eee3cc" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={capMesh} args={[undefined, undefined, caps.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#e8ba53" roughness={0.76} />
      </instancedMesh>
      <instancedMesh ref={paintMesh} args={[undefined, undefined, markings.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#ffedc4" roughness={0.88} />
      </instancedMesh>
    </>
  );
}

export { BoostPads } from "../boost-pads";
