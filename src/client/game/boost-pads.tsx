import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { City } from "../../shared/city";
import { BOOST_PAD_LENGTH, BOOST_PAD_WIDTH } from "../../shared/boost-pads";
import { StaticInstances, type StaticInstance } from "./static-instances";
import { drivingTelemetry } from "./driving-state";
import { makeBoostPadTexture } from "./textures";

/** Flush steel strips with readable arrows and luminous edges, batched across the city. */
export function BoostPads({ city }: { city: City }) {
  const texture = useMemo(() => makeBoostPadTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  const strips = useMemo(
    () =>
      city.boostPads.map((pad): StaticInstance => ({
        position: [pad.x, pad.y + 0.09, pad.z],
        rotation: [0, pad.yaw, 0],
        scale: [BOOST_PAD_WIDTH, 0.1, BOOST_PAD_LENGTH],
      })),
    [city],
  );
  const details = useMemo(() => {
    const housings: StaticInstance[] = [],
      lights: StaticInstance[] = [],
      bolts: StaticInstance[] = [];
    for (const pad of city.boostPads) {
      const at = (
        across: number,
        up: number,
        along: number,
        scale: [number, number, number],
      ): StaticInstance => ({
        position: [
          pad.x + across * Math.cos(pad.yaw) + along * Math.sin(pad.yaw),
          pad.y + up,
          pad.z - across * Math.sin(pad.yaw) + along * Math.cos(pad.yaw),
        ],
        rotation: [0, pad.yaw, 0],
        scale,
      });
      housings.push(at(0, 0.045, 0, [BOOST_PAD_WIDTH + 0.65, 0.09, BOOST_PAD_LENGTH + 0.5]));
      for (const side of [-1, 1]) {
        for (const along of [-2.7, 0, 2.7]) {
          lights.push(at(side * (BOOST_PAD_WIDTH / 2 + 0.16), 0.11, along, [0.1, 0.07, 1.8]));
        }
        for (const along of [-3.8, -1.4, 1.4, 3.8]) {
          bolts.push(at(side * (BOOST_PAD_WIDTH / 2 + 0.28), 0.1, along, [0.09, 0.055, 0.13]));
        }
      }
    }
    return { housings, lights, bolts };
  }, [city]);
  const lightMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (lightMaterial.current)
      lightMaterial.current.emissiveIntensity = 0.85 + Math.sin(clock.elapsedTime * 3) * 0.15;
    const ring = pulse.current;
    if (!ring) return;
    const pad = city.boostPads[drivingTelemetry.boostPadIndex];
    ring.visible = !!pad && drivingTelemetry.padPulse > 0;
    if (!pad || !ring.visible) return;
    ring.position.set(pad.x, pad.y + 0.16, pad.z);
    const progress = 1 - drivingTelemetry.padPulse / 0.9;
    ring.scale.setScalar(2.3 + progress * 5);
    (ring.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.65;
  });
  return (
    <group name="boost-pad-strips">
      <StaticInstances items={details.housings}>
        <boxGeometry />
        <meshStandardMaterial color="#26343d" roughness={0.58} metalness={0.55} />
      </StaticInstances>
      <StaticInstances items={strips}>
        <boxGeometry />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#3ad9ff"
          emissiveIntensity={0.45}
          roughness={0.72}
          metalness={0.15}
        />
      </StaticInstances>
      <StaticInstances items={details.lights}>
        <boxGeometry />
        <meshStandardMaterial
          ref={lightMaterial}
          color="#5ce9ef"
          emissive="#00d9ff"
          emissiveIntensity={0.85}
          toneMapped={false}
        />
      </StaticInstances>
      <StaticInstances items={details.bolts}>
        <boxGeometry />
        <meshStandardMaterial color="#8e9da3" roughness={0.44} metalness={0.75} />
      </StaticInstances>
      <mesh ref={pulse} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.95, 1, 40]} />
        <meshBasicMaterial
          color="#7bffff"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
