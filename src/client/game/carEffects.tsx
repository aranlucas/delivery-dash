import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { drivingTelemetry } from "./drivingState";

const EXHAUST_POSITIONS = [-0.7, 0.7] as const;

export function BoostFlames() {
  const flames = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!flames.current) return;
    flames.current.visible = drivingTelemetry.boosting || drivingTelemetry.rushTier > 0;
    flames.current.scale.z =
      0.75 + drivingTelemetry.rushTier * 0.16 + Math.sin(state.clock.elapsedTime * 55) * 0.22;
  });
  return (
    <group ref={flames} visible={false}>
      {EXHAUST_POSITIONS.map((x) => (
        <mesh key={x} position={[x, -0.28, -3.08]} rotation-x={-Math.PI / 2}>
          <coneGeometry args={[0.18, 0.95, 8]} />
          <meshStandardMaterial
            color="#fff2a3"
            emissive="#ff4d00"
            emissiveIntensity={4}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

const RUSH_COLORS = ["#00dcff", "#ffd400", "#ff4b28"] as const;

/** Code-native slipstream rings keep the burst readable without adding asset weight. */
export function RushTrails() {
  const rings = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(({ clock }) => {
    const tier = drivingTelemetry.rushTier;
    for (let index = 0; index < rings.current.length; index++) {
      const ring = rings.current[index];
      if (!ring) continue;
      ring.visible = tier > 0;
      if (tier === 0) continue;
      const phase = (clock.elapsedTime * (2.7 + tier * 0.35) + index / rings.current.length) % 1;
      ring.position.z = -3.2 - phase * (7 + tier * 1.3);
      const scale = 0.7 + phase * (0.8 + tier * 0.12);
      ring.scale.set(scale, scale, 1);
      const material = ring.material as THREE.MeshBasicMaterial;
      material.color.set(RUSH_COLORS[tier - 1]);
      material.opacity = (1 - phase) * 0.48;
    }
  });
  return (
    <group position-y={0.1}>
      {Array.from({ length: 4 }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            rings.current[index] = mesh;
          }}
          visible={false}
        >
          <torusGeometry args={[1.45, 0.055, 6, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function DriftSmoke() {
  const particles = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(({ clock }) => {
    const active = drivingTelemetry.drifting;
    for (let i = 0; i < particles.current.length; i++) {
      const particle = particles.current[i];
      if (!particle) continue;
      const phase = (clock.elapsedTime * 1.7 + i / particles.current.length) % 1;
      particle.visible = active;
      particle.position.set(i % 2 === 0 ? -1.15 : 1.15, -0.18 + phase * 0.85, -1.7 - phase * 4.2);
      const scale = 0.18 + phase * 0.92;
      particle.scale.set(scale, scale * 0.7, scale);
    }
  });
  return (
    <group>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            particles.current[i] = mesh;
          }}
          visible={false}
        >
          <icosahedronGeometry args={[0.55, 1]} />
          <meshBasicMaterial color="#dff7ff" transparent opacity={0.26} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
