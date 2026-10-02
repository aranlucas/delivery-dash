import { Text, useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { CITY_ZONES, type CityZone } from "../../shared/city";

import { GltfInstances, StaticInstances, type StaticInstance } from "./static-instances";
import { WorldDetails } from "./world-details";
import { Coast } from "./coast";

const assetUrl = (name: string) => `/models/landmarks/${name}.glb?v=coast-1`;

/** Blender objects are merged by material at export; each landmark is only a few draw calls. */
function Landmark({ name }: { name: string }) {
  const { scene } = useGLTF(assetUrl(name));
  const instance = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  return <primitive object={instance} dispose={null} />;
}

const LANE_DASHES: StaticInstance[] = Array.from({ length: 16 }, (_, i) => {
  const yaw = (i * Math.PI) / 8;
  return {
    position: [Math.sin(yaw) * 28, 0.055, Math.cos(yaw) * 28],
    rotation: [-Math.PI / 2, 0, yaw],
  };
});
const APPROACH_ARROWS: StaticInstance[] = [-1, 1].flatMap((direction) =>
  [-1, 1].map((side) => ({
    position: [side * 1.25 * direction, 0.065, -direction * 40],
    rotation: [-Math.PI / 2, 0, side * 0.7 + (direction === 1 ? 0 : Math.PI)],
  })),
);
const PORTALS: StaticInstance[] = CITY_ZONES.map((zone) => ({
  position: [zone.x, 0, zone.z - 43],
}));

function Portals() {
  const { scene } = useGLTF(assetUrl("portal"));
  // Share the cached model's buffers. Only the instance matrices belong to these batches.
  return <GltfInstances scene={scene} items={PORTALS} />;
}

function Plaza({ zone }: { zone: CityZone }) {
  const stunt = zone.id === "stunt";
  return (
    <group position={[zone.x, 0, zone.z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]} receiveShadow>
        <planeGeometry args={[86, 86]} />
        <meshStandardMaterial
          color={stunt || zone.id === "freight" ? "#334957" : "#b9a48e"}
          roughness={0.94}
        />
      </mesh>
      {/* The freight yard uses a straight launch lane; other plazas have a drift circuit. */}
      {zone.id !== "freight" && (
        <>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]} receiveShadow>
            <ringGeometry args={[20, 36, 64]} />
            <meshStandardMaterial color="#283f4d" roughness={0.9} />
          </mesh>
          {[19.5, 36.5].map((radius) => (
            <mesh key={radius} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
              <ringGeometry args={[radius, radius + 0.55, 64]} />
              <meshStandardMaterial
                color={zone.color}
                emissive={zone.color}
                emissiveIntensity={0.25}
              />
            </mesh>
          ))}
          <StaticInstances items={LANE_DASHES}>
            <planeGeometry args={[0.35, 3]} />
            <meshBasicMaterial color="#fff0c8" />
          </StaticInstances>
        </>
      )}
      {zone.id === "freight" && (
        <mesh rotation-x={-Math.PI / 2} position={[24, 0.035, 0]} receiveShadow>
          <planeGeometry args={[15, 86]} />
          <meshStandardMaterial color="#283f4d" roughness={0.9} />
        </mesh>
      )}
      {zone.model && (
        <Suspense fallback={null}>
          <Landmark name={zone.model} />
        </Suspense>
      )}
      <group position={[0, 0, -43]}>
        <Suspense fallback={null}>
          {[0, Math.PI].map((yaw) => (
            <Text
              key={yaw}
              rotation-y={yaw}
              material-side={THREE.FrontSide}
              position={[0, 10.5, Math.cos(yaw) * 0.12]}
              fontSize={2.1}
              color={zone.color}
              outlineWidth={0.07}
              outlineColor="#152c40"
              maxWidth={35}
            >
              {zone.name}
            </Text>
          ))}
        </Suspense>
      </group>
      {stunt && (
        <>
          <Suspense fallback={null}>
            <Text position={[0, 0.07, 8]} rotation-x={-Math.PI / 2} fontSize={4.5} color="#cafa54">
              FLY THIS WAY
            </Text>
          </Suspense>
        </>
      )}
      {/* Flat approach arrows make the shortcut legible at driving speed. */}
      {(stunt || zone.id === "freight") && (
        <group position={[zone.id === "freight" ? 24 : 0, 0, 0]}>
          <StaticInstances items={APPROACH_ARROWS}>
            <planeGeometry args={[0.6, 3.5]} />
            <meshBasicMaterial color={zone.color} />
          </StaticInstances>
        </group>
      )}
    </group>
  );
}

export function LandmarkCity() {
  return (
    <group>
      <Coast />
      <Suspense fallback={null}>
        <Portals />
      </Suspense>
      <WorldDetails />
      {CITY_ZONES.map((zone) => (
        <Plaza key={zone.id} zone={zone} />
      ))}
    </group>
  );
}

for (const name of ["ferris", "lighthouse", "rocket", "crane", "portal"])
  useGLTF.preload(assetUrl(name));
