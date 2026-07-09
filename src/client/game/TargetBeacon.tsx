import { Float } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { ownPose } from "./Car";

/** Grounded delivery zone: pulsing ring + soft pillar + bobbing cone, sitting on the sidewalk plane. */
export function TargetBeacon({ pos, dropoff }: { pos: [number, number]; dropoff: boolean }) {
  const color = dropoff ? "#38d986" : "#ff9d33";
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.1;
    ring.current?.scale.set(s, s, 1);
  });
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.34, 0]}>
        <ringGeometry args={[5.1, 6, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.32, 0]}>
        <circleGeometry args={[5.1, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} />
      </mesh>
      <mesh position={[0, 7, 0]}>
        <cylinderGeometry args={[0.8, 2.4, 14, 20, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <Float speed={3} floatIntensity={0.5} rotationIntensity={0}>
        <mesh position={[0, 15.5, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[1.9, 3.2, 4]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </Float>
    </group>
  );
}

/** 3D chevron hovering above the player's car, always pointing at the current target in world space. */
export function TargetPointer({ target, dropoff }: { target: [number, number]; dropoff: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    g.position.set(ownPose.x, 4.4 + Math.sin(clock.elapsedTime * 3) * 0.16, ownPose.z);
    g.rotation.y = Math.atan2(target[0] - ownPose.x, target[1] - ownPose.z);
  });
  return (
    <group ref={group}>
      <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.5]}>
        <coneGeometry args={[0.5, 1.5, 4]} />
        <meshBasicMaterial color={dropoff ? "#38d986" : "#ff9d33"} />
      </mesh>
    </group>
  );
}
