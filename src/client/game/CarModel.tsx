import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CAR_SPECS, wheelPositions, type CarKind } from "./carGeometry";
import { drivingTelemetry, wheelDrive } from "./drivingState";
import { useVehicleAsset } from "./modelAssets";

export type CarLod = "full" | "merged" | "box";

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
  topperColor = "#15191d",
  topperEmissive = topperColor,
  topperEmissiveIntensity = 0.2,
}: {
  kind?: CarKind;
  color: string;
  lod?: CarLod;
  animateWheels?: boolean;
  topperColor?: string;
  topperEmissive?: string;
  topperEmissiveIntensity?: number;
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
  const topperMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: topperColor,
        emissive: topperEmissive,
        emissiveIntensity: topperEmissiveIntensity,
        roughness: 0.5,
      }),
    [topperColor, topperEmissive, topperEmissiveIntensity],
  );
  useEffect(
    () => () => {
      bodyMaterial.dispose();
      topperMaterial.dispose();
    },
    [bodyMaterial, topperMaterial],
  );
  const geometry = useVehicleAsset(kind);
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
          {kind === "taxi" ? (
            <mesh geometry={geometry.topper} material={topperMaterial} castShadow />
          ) : null}
          {wheelPositions(spec).map((position, index) => {
            const props: WheelProps = {
              position,
              tyre: geometry.wheel,
              rim: geometry.rim,
              radius: spec.wheelRadius,
              steerable: index < 2,
            };
            const wheelKey = `${position[0]}:${position[2]}`;
            return animateWheels ? (
              <AnimatedWheel key={wheelKey} {...props} />
            ) : (
              <StaticWheel key={wheelKey} {...props} />
            );
          })}
        </>
      ) : null}
    </>
  );
}
