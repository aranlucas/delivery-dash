import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { City as CityData } from "../../../shared/city";
import type { CarKind } from "../carGeometry";
import { makeFleetGeometry, useVehicleAsset } from "../modelAssets";
import { trafficCars, updateTraffic } from "../traffic";

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const tint = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

type CarFleet = {
  write: (index: number, x: number, z: number, yaw: number) => void;
  flush: (count?: number) => void;
  meshes: ReactNode;
};

/** One instanced vehicle shape: painted bodywork plus glass, trim and lamp passes. */
function useCarFleet(kind: CarKind, colors: string[]): CarFleet {
  const asset = useVehicleAsset(kind);
  const parts = useMemo(() => makeFleetGeometry(asset), [asset]);
  useEffect(
    () => () => {
      parts.painted.dispose();
      parts.glass.dispose();
      parts.trim.dispose();
      parts.headlights.dispose();
      parts.taillights.dispose();
      parts.topper.dispose();
    },
    [parts],
  );
  const painted = useRef<THREE.InstancedMesh>(null),
    glass = useRef<THREE.InstancedMesh>(null),
    trim = useRef<THREE.InstancedMesh>(null),
    heads = useRef<THREE.InstancedMesh>(null),
    tails = useRef<THREE.InstancedMesh>(null),
    toppers = useRef<THREE.InstancedMesh>(null);
  const fleet = useMemo(
    () => [painted, glass, trim, heads, tails, ...(kind === "taxi" ? [toppers] : [])] as const,
    [kind],
  );
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
  const flush = useCallback(
    (count = colors.length) => {
      if (!count) return;
      for (const ref of fleet) {
        if (!ref.current) continue;
        const attribute = ref.current.instanceMatrix;
        // Preserve a full initialization upload if the frame loop runs before the next draw.
        const pendingCount = attribute.updateRanges[0]?.count ?? 0;
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, Math.max(pendingCount, count * 16));
        attribute.needsUpdate = true;
      }
    },
    [fleet, colors.length],
  );
  const count = Math.max(1, colors.length);
  const meshes = useMemo(
    () => (
      <>
        <instancedMesh ref={painted} args={[parts.painted, undefined, count]} castShadow>
          <meshStandardMaterial roughness={0.34} metalness={0.32} />
        </instancedMesh>
        <instancedMesh ref={glass} args={[parts.glass, undefined, count]}>
          <meshStandardMaterial color="#162d3d" roughness={0.08} metalness={0.5} />
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
        {kind === "taxi" ? (
          <instancedMesh ref={toppers} args={[parts.topper, undefined, count]} castShadow>
            <meshStandardMaterial color="#f59e0b" emissive="#7c2d12" emissiveIntensity={0.25} />
          </instancedMesh>
        ) : null}
      </>
    ),
    [count, kind, parts],
  );
  return useMemo(() => ({ write, flush, meshes }), [flush, meshes, write]);
}

const FLEET_KINDS: CarKind[] = ["sedan", "van", "hatch", "sports", "taxi"];
type FleetSlot = { color: string; index: number; moving: boolean };

/** Traffic and parked cars share five shape-specific fleets, so every Blender vehicle appears. */
export function FleetCars({ city }: { city: CityData }) {
  const groups = useMemo(() => {
    const output: Record<CarKind, FleetSlot[]> = {
      taxi: [],
      sedan: [],
      van: [],
      hatch: [],
      sports: [],
    };
    city.trafficRoutes.forEach((route, index) =>
      output[FLEET_KINDS[index % FLEET_KINDS.length]!]!.push({
        color: route.color,
        index,
        moving: true,
      }),
    );
    city.parkedCars.forEach((car, index) =>
      output[FLEET_KINDS[(index + 2) % FLEET_KINDS.length]!]!.push({
        color: car.color,
        index,
        moving: false,
      }),
    );
    return output;
  }, [city]);
  const sedanColors = useMemo(() => groups.sedan.map((slot) => slot.color), [groups]);
  const vanColors = useMemo(() => groups.van.map((slot) => slot.color), [groups]);
  const hatchColors = useMemo(() => groups.hatch.map((slot) => slot.color), [groups]);
  const sportsColors = useMemo(() => groups.sports.map((slot) => slot.color), [groups]);
  const taxiColors = useMemo(() => groups.taxi.map((slot) => slot.color), [groups]);
  const sedan = useCarFleet("sedan", sedanColors);
  const van = useCarFleet("van", vanColors);
  const hatch = useCarFleet("hatch", hatchColors);
  const sports = useCarFleet("sports", sportsColors);
  const taxi = useCarFleet("taxi", taxiColors);
  const fleets = useMemo(
    () => ({ sedan, van, hatch, sports, taxi }),
    [hatch, sedan, sports, taxi, van],
  );
  useLayoutEffect(() => {
    updateTraffic(city, 0);
    for (const kind of FLEET_KINDS) {
      const fleet = fleets[kind];
      groups[kind].forEach((slot, localIndex) => {
        const car = slot.moving ? trafficCars[slot.index] : city.parkedCars[slot.index];
        if (car) fleet.write(localIndex, car.x, car.z, car.yaw);
      });
      fleet.flush();
    }
  }, [city, fleets, groups]);
  useFrame(({ clock }) => {
    updateTraffic(city, clock.elapsedTime);
    for (const kind of FLEET_KINDS) {
      const fleet = fleets[kind];
      const slots = groups[kind];
      let movingCount = 0;
      // Moving slots precede parking in each batch. Parked transforms never change per frame.
      while (movingCount < slots.length && slots[movingCount]!.moving) {
        const car = trafficCars[slots[movingCount]!.index];
        if (car) fleet.write(movingCount, car.x, car.z, car.yaw);
        movingCount++;
      }
      fleet.flush(movingCount);
    }
  });
  return (
    <>
      {FLEET_KINDS.map((kind) => (
        <group key={kind}>{fleets[kind].meshes}</group>
      ))}
    </>
  );
}
