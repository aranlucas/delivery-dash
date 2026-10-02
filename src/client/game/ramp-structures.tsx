import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { City, Ramp } from "../../shared/city";
import { RAMP_BARRIER_WIDTH, rampHeight } from "../../shared/ramps";
import { makeRampGeometry, makeRampRibbonGeometry } from "./ramp-geometry";
import { makeAsphaltTexture, makeConcreteTexture, makeRampHazardTexture } from "./textures";
import { StaticInstances, type StaticInstance } from "./static-instances";

const position = (r: Ramp, across: number, y: number, along: number): [number, number, number] => [
  r.x + Math.cos(r.yaw) * across + Math.sin(r.yaw) * along,
  y,
  r.z - Math.sin(r.yaw) * across + Math.cos(r.yaw) * along,
];

const rotation = (pitch: number, yaw: number): [number, number, number] => {
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")),
  );
  return [euler.x, euler.y, euler.z];
};

function merge(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

/** The visible road, structure and barriers use the shared physics profile. */
export function Ramps({ city }: { city: City }) {
  const resources = useMemo(() => {
    const concrete = makeConcreteTexture();
    const asphalt = makeAsphaltTexture();
    asphalt.repeat.set(1, 1);
    const hazard = makeRampHazardTexture();
    const gradeMaterials = [
      new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.97 }),
      new THREE.MeshStandardMaterial({ map: concrete, color: "#dad3c2", roughness: 0.93 }),
    ];
    const kickerMaterials = [
      new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.86 }),
      new THREE.MeshStandardMaterial({ color: "#a86438", roughness: 0.68, metalness: 0.22 }),
    ];
    const kicker = makeRampGeometry({ kind: "kicker", length: 1, width: 1, height: 1 });
    return { concrete, asphalt, hazard, gradeMaterials, kickerMaterials, kicker };
  }, []);
  const grades = useMemo(
    () =>
      city.ramps
        .filter((r) => r.kind === "grade")
        .map((ramp) => {
          const paint: THREE.BufferGeometry[] = [];
          for (const side of [-1, 1])
            paint.push(makeRampRibbonGeometry(ramp, side * (ramp.width / 2 - 0.75), 0.16));
          for (let along = 2; along < ramp.length - 2; along += 7)
            paint.push(
              makeRampRibbonGeometry(
                ramp,
                0,
                0.14,
                along / ramp.length,
                Math.min(1, (along + 3) / ramp.length),
              ),
            );
          const barriers = [-1, 1].map((side) =>
            makeRampRibbonGeometry(
              ramp,
              side * (ramp.width / 2 - RAMP_BARRIER_WIDTH / 2),
              RAMP_BARRIER_WIDTH,
              0,
              1,
              true,
            ),
          );
          return {
            ramp,
            body: makeRampGeometry(ramp),
            paint: merge(paint),
            barriers: merge(barriers),
          };
        }),
    [city],
  );
  const details = useMemo(() => {
    const kickers: StaticInstance[] = [];
    const ribs: StaticInstance[] = [];
    const hardware: StaticInstance[] = [];
    const lips: StaticInstance[] = [];
    for (const r of city.ramps) {
      if (r.kind !== "kicker") continue;
      kickers.push({
        position: [r.x, 0, r.z],
        rotation: [0, r.yaw, 0],
        scale: [r.width, r.height, r.length],
      });
      const lipT = 1 - 0.18 / r.length;
      const slope = Math.atan2(r.height - rampHeight(r, 1 - 0.4 / r.length), 0.4);
      lips.push({
        position: position(r, 0, rampHeight(r, lipT) + 0.035, (lipT - 0.5) * r.length),
        rotation: rotation(-slope, r.yaw),
        scale: [r.width, 0.08, 0.32],
      });
      for (const side of [-1, 1]) {
        const across = side * (r.width / 2 + 0.04);
        const stations = [0.28, 0.52, 0.76, 0.98];
        for (let i = 0; i < stations.length; i++) {
          const t = stations[i]!;
          const top = rampHeight(r, t);
          const along = (t - 0.5) * r.length;
          ribs.push({
            position: position(r, across, top / 2, along),
            rotation: [0, r.yaw, 0],
            scale: [0.14, Math.max(0.06, top), 0.18],
          });
          hardware.push({
            position: position(r, across + side * 0.085, top - 0.14, along),
            scale: [0.045, 0.09, 0.09],
            rotation: [0, r.yaw, 0],
          });
          if (i === 0) continue;
          const previous = stations[i - 1]!;
          const dz = (t - previous) * r.length;
          ribs.push({
            position: position(r, across, top / 2, ((t + previous) / 2 - 0.5) * r.length),
            rotation: rotation(Math.atan2(dz, top), r.yaw),
            scale: [0.1, Math.hypot(dz, top), 0.12],
          });
        }
        hardware.push({
          position: position(r, across, 0.045, r.length * 0.36),
          rotation: [0, r.yaw, 0],
          scale: [0.65, 0.09, 1.1],
        });
      }
    }
    return { kickers, ribs, hardware, lips };
  }, [city]);
  useEffect(
    () => () => {
      resources.concrete.dispose();
      resources.asphalt.dispose();
      resources.hazard.dispose();
      resources.kicker.dispose();
      for (const material of [...resources.gradeMaterials, ...resources.kickerMaterials])
        material.dispose();
    },
    [resources],
  );
  useEffect(
    () => () => {
      for (const grade of grades) {
        grade.body.dispose();
        grade.paint.dispose();
        grade.barriers.dispose();
      }
    },
    [grades],
  );
  return (
    <group name="ramp-structures">
      {grades.map(({ ramp, body, paint, barriers }) => (
        <group
          key={`${ramp.x}:${ramp.z}:${ramp.yaw}`}
          position={[ramp.x, 0, ramp.z]}
          rotation-y={ramp.yaw}
        >
          <mesh geometry={body} material={resources.gradeMaterials} castShadow receiveShadow />
          <mesh geometry={barriers} castShadow receiveShadow>
            <meshStandardMaterial map={resources.concrete} color="#eee3cc" roughness={0.9} />
          </mesh>
          <mesh geometry={paint}>
            <meshStandardMaterial color="#ffedc4" roughness={0.88} />
          </mesh>
        </group>
      ))}
      <StaticInstances
        items={details.kickers}
        geometry={resources.kicker}
        material={resources.kickerMaterials}
        shadows
      />
      <StaticInstances items={details.ribs} shadows>
        <boxGeometry />
        <meshStandardMaterial color="#273b44" metalness={0.35} roughness={0.6} />
      </StaticInstances>
      <StaticInstances items={details.hardware} shadows>
        <boxGeometry />
        <meshStandardMaterial color="#a5b4b8" metalness={0.5} roughness={0.53} />
      </StaticInstances>
      <StaticInstances items={details.lips}>
        <boxGeometry />
        <meshStandardMaterial
          color="#ffe07b"
          emissive="#ffb62e"
          emissiveIntensity={0.3}
          roughness={0.6}
        />
      </StaticInstances>
    </group>
  );
}
