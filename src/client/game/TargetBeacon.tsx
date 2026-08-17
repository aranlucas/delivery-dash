import { Float } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/** Grounded delivery zone: pulsing ring + soft pillar + bobbing cone, sitting on the sidewalk plane. */
export function TargetBeacon({ pos, dropoff }: { pos: [number, number]; dropoff: boolean }) {
  const color = dropoff ? "#65f578" : "#ff7a00";
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.1;
    ring.current?.scale.set(s, s, 1);
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.32;
  });
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.34, 0]}>
        <ringGeometry args={[4.6, 6.4, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.96} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.32, 0]}>
        <circleGeometry args={[4.7, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.24} />
      </mesh>
      <mesh position={[0, 7, 0]}>
        <cylinderGeometry args={[0.75, 3.1, 18, 20, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.24} depthWrite={false} />
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
