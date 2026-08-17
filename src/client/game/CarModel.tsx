import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  CAR_GEOMETRY,
  HATCH_SPEC,
  SEDAN_SPEC,
  SPORTS_SPEC,
  TAXI_SPEC,
  VAN_SPEC,
  wheelPositions,
  type CarKind,
  type CarSpec,
} from "./carGeometry";
import { drivingTelemetry } from "./drivingState";

export type CarLod = "full" | "merged" | "box";

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  taxi: TAXI_SPEC,
  sedan: SEDAN_SPEC,
  van: VAN_SPEC,
  hatch: HATCH_SPEC,
  sports: SPORTS_SPEC,
};

const glassMaterial = new THREE.MeshStandardMaterial({
  color: "#16222e",
  metalness: 0.5,
  roughness: 0.08,
});
const trimMaterial = new THREE.MeshStandardMaterial({
  color: "#1b1f25",
  metalness: 0.35,
  roughness: 0.55,
});
const headlightMaterial = new THREE.MeshStandardMaterial({
  color: "#fff6da",
  emissive: "#ffedb8",
  emissiveIntensity: 2.2,
});
const taillightMaterial = new THREE.MeshStandardMaterial({
  color: "#7a1212",
  emissive: "#ff2b1e",
  emissiveIntensity: 1.7,
});
const tyreMaterial = new THREE.MeshStandardMaterial({ color: "#111317", roughness: 0.95 });
const rimMaterial = new THREE.MeshStandardMaterial({
  color: "#d7dce3",
  metalness: 0.75,
  roughness: 0.28,
});
const boxGeometry = new THREE.BoxGeometry(2.5, 1.5, 5.2);

/** Signed forward speed from the own-car simulation. */
export const wheelDrive = { speed: 0 };

type WheelProps = {
  position: [number, number, number];
  tyre: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  radius: number;
  steerable: boolean;
};

function WheelMeshes({ tyre, rim }: Pick<WheelProps, "tyre" | "rim">) {
  return (
    <>
      <mesh geometry={tyre} material={tyreMaterial} castShadow />
      <mesh geometry={rim} material={rimMaterial} />
    </>
  );
}

function AnimatedWheel({
  position,
  tyre,
  rim,
  radius,
  steerable,
}: WheelProps) {
  const steering = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.x -= (wheelDrive.speed / radius) * dt;
    if (steerable && steering.current)
      steering.current.rotation.y = THREE.MathUtils.lerp(
        steering.current.rotation.y,
        drivingTelemetry.steer * 0.46,
        Math.min(1, dt * 14),
      );
  });
  return (
    <group ref={steering} position={position}>
      <group ref={spin}>
        <WheelMeshes tyre={tyre} rim={rim} />
      </group>
    </group>
  );
}

function StaticWheel({ position, tyre, rim }: WheelProps) {
  return (
    <group position={position}>
      <WheelMeshes tyre={tyre} rim={rim} />
    </group>
  );
}

export function CarModel({
  kind = "taxi",
  color,
  lod = "full",
  animateWheels = false,
}: {
  kind?: CarKind;
  color: string;
  lod?: CarLod;
  animateWheels?: boolean;
}) {
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.28,
        roughness: 0.34,
      }),
    [color],
  );
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);
  const geometry = CAR_GEOMETRY[kind];
  const spec = CAR_SPECS[kind];

  if (lod === "box")
    return (
      <mesh geometry={boxGeometry} material={bodyMaterial} position={[0, -0.05, 0]} castShadow />
    );

  return (
    <>
      <mesh geometry={geometry.body} material={bodyMaterial} castShadow />
      <mesh geometry={geometry.glass} material={glassMaterial} />
      {lod === "full" ? (
        <>
          <mesh geometry={geometry.trim} material={trimMaterial} />
          <mesh geometry={geometry.headlights} material={headlightMaterial} />
          <mesh geometry={geometry.taillights} material={taillightMaterial} />
          {wheelPositions(spec).map((position, index) => {
            const props: WheelProps = {
              position,
              tyre: geometry.wheel,
              rim: geometry.rim,
              radius: spec.wheelRadius,
              steerable: index < 2,
            };
            return animateWheels ? (
              <AnimatedWheel key={index} {...props} />
            ) : (
              <StaticWheel key={index} {...props} />
            );
          })}
        </>
      ) : null}
    </>
  );
}
