import { Float, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { worldBearing } from "../../shared/nav";
import { ownPose } from "./drivingState";
import type { Place } from "../../shared/city";
import { CHECKPOINT_COUNT } from "../../shared/gameModes";

/** A holographic gate faces the road and stays passable from either direction. */
export function CheckpointGate({ place, number }: { place: Place; number: number }) {
  const acrossX = Math.abs(place.stop[0] - place.pos[0]) < Math.abs(place.stop[1] - place.pos[1]);
  const color = number === CHECKPOINT_COUNT ? "#ffd400" : "#00dcff";
  return (
    <group position={[place.stop[0], 0, place.stop[1]]} rotation-y={acrossX ? Math.PI / 2 : 0}>
      {[-7, 7].map((x) => (
        <group position={[x, 0, 0]} key={x}>
          <mesh position={[0, 4.4, 0]}>
            <boxGeometry args={[0.5, 8.8, 0.5]} />
            <meshBasicMaterial color={color} transparent opacity={0.75} />
          </mesh>
          <mesh position={[0, 0.15, 0]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.65, 1, 16]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 8.6, 0]}>
        <boxGeometry args={[14.5, 1.6, 0.5]} />
        <meshBasicMaterial color="#102632" />
      </mesh>
      {[-1, 1].map((side) => (
        <Text
          key={side}
          position={[0, 8.6, side * 0.27]}
          rotation-y={side === 1 ? 0 : Math.PI}
          fontSize={0.78}
          color={color}
        >
          {number === CHECKPOINT_COUNT ? "FINISH" : "CHECKPOINT"} {number} / {CHECKPOINT_COUNT}
        </Text>
      ))}
      <mesh position={[0, 0.18, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[14, 2.4]} />
        <meshBasicMaterial color={color} transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <Float speed={2} floatIntensity={0.4} rotationIntensity={0}>
        <mesh position={[0, 12, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[1.5, 2.5, 4]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </Float>
    </group>
  );
}

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

const CHEVRON_COUNT = 3;

/** Flowing chevrons immediately ahead of the car, aimed at the destination. */
export function TargetPointer({
  target,
  dropoff,
  checkpoint = false,
}: {
  target: [number, number];
  dropoff: boolean;
  checkpoint?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const chevrons = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    // ownPose.y includes the 0.8m ride height, so this hugs flat roads, ramps,
    // and elevated decks while still following the car through a jump.
    g.position.set(ownPose.x, ownPose.y - 0.65, ownPose.z);
    g.rotation.y = worldBearing(ownPose.x, ownPose.z, target[0], target[1]);
    for (let index = 0; index < chevrons.current.length; index++) {
      const chevron = chevrons.current[index];
      if (!chevron) continue;
      const phase = (clock.elapsedTime * 0.85 + index / CHEVRON_COUNT) % 1;
      chevron.position.z = 4 + phase * 7;
      (chevron.material as THREE.MeshBasicMaterial).opacity = Math.sin(phase * Math.PI) * 0.75;
    }
  });
  return (
    <group ref={group}>
      {Array.from({ length: CHEVRON_COUNT }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            chevrons.current[index] = mesh;
          }}
          rotation-x={-Math.PI / 2}
        >
          <coneGeometry args={[1.1, 2.2, 3]} />
          <meshBasicMaterial
            color={checkpoint ? "#00dcff" : dropoff ? "#38d986" : "#ff9d33"}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
