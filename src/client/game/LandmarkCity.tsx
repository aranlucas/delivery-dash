import { Text, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CITY_ZONES, WORLD_HALF, type CityZone } from "../../shared/city";

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
          {Array.from({ length: 16 }, (_, i) => (
            <group key={i} rotation-y={(i * Math.PI) / 8}>
              <mesh position={[0, 0.055, 28]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[0.35, 3]} />
                <meshBasicMaterial color="#fff0c8" />
              </mesh>
            </group>
          ))}
        </>
      )}
      {zone.id === "freight" && (
        <mesh rotation-x={-Math.PI / 2} position={[24, 0.035, 0]} receiveShadow>
          <planeGeometry args={[15, 86]} />
          <meshStandardMaterial color="#283f4d" roughness={0.9} />
        </mesh>
      )}
      {zone.model && <Landmark name={zone.model} />}
      <group position={[0, 0, -43]}>
        <Landmark name="portal" />
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
      </group>
      {stunt && (
        <>
          <Text position={[0, 0.07, 8]} rotation-x={-Math.PI / 2} fontSize={4.5} color="#cafa54">
            FLY THIS WAY
          </Text>
          <group position={[0, 0, 0]} scale={[1, 1.65, 1]}>
            <Landmark name="portal" />
          </group>
        </>
      )}
      {/* Flat approach arrows make the shortcut legible at driving speed. */}
      {(stunt || zone.id === "freight") &&
        [-1, 1].map((direction) => (
          <group
            key={direction}
            position={[zone.id === "freight" ? 24 : 0, 0.065, -direction * 40]}
            rotation-y={direction === 1 ? 0 : Math.PI}
          >
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * 1.25, 0, 0]}
                rotation={[-Math.PI / 2, 0, side * 0.7]}
              >
                <planeGeometry args={[0.6, 3.5]} />
                <meshBasicMaterial color={zone.color} />
              </mesh>
            ))}
          </group>
        ))}
    </group>
  );
}

/** The sea and silhouette islands establish a horizon instead of an endless asphalt plane. */
function Coast() {
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.position.y = -1.2 + Math.sin(clock.elapsedTime * 0.45) * 0.08;
  });
  return (
    <>
      <mesh ref={water} rotation-x={-Math.PI / 2} position={[0, -1.2, 0]}>
        <planeGeometry args={[5000, 5000]} />
        <meshStandardMaterial color="#228f9f" roughness={0.38} metalness={0.18} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[665, 665]} />
        <meshStandardMaterial color="#eecb92" roughness={1} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (WORLD_HALF - 1.5), 0.5, 0]}>
            <boxGeometry args={[1.5, 1, 600]} />
            <meshStandardMaterial color="#e5c598" />
          </mesh>
          <mesh position={[0, 0.5, side * (WORLD_HALF - 1.5)]}>
            <boxGeometry args={[600, 1, 1.5]} />
            <meshStandardMaterial color="#e5c598" />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 11 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 11;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * (700 + i * 13), -18, Math.sin(angle) * (700 + i * 13)]}
            scale={[1.8, 1, 1.15]}
          >
            <coneGeometry args={[90 + (i % 3) * 25, 65 + (i % 4) * 30, 5]} />
            <meshStandardMaterial color={i % 2 ? "#547d83" : "#648d87"} flatShading roughness={1} />
          </mesh>
        );
      })}
      {/* Offshore racing buoys give scale to the coastline. */}
      {Array.from({ length: 20 }, (_, i) => (
        <mesh key={i} position={[-350, -0.3, -300 + i * 32]}>
          <coneGeometry args={[1.5, 3, 6]} />
          <meshStandardMaterial color={i % 2 ? "#fff3d7" : "#ff654d"} />
        </mesh>
      ))}
    </>
  );
}

export function LandmarkCity() {
  return (
    <group>
      <Coast />
      {CITY_ZONES.map((zone) => (
        <Plaza key={zone.id} zone={zone} />
      ))}
    </group>
  );
}

for (const name of ["ferris", "lighthouse", "rocket", "crane", "portal"])
  useGLTF.preload(assetUrl(name));
