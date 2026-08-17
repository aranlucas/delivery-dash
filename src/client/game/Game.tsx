import { Canvas, useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { generateCity, generateOrders } from "../../shared/city";
import { useGameStore, ownPlayer } from "../store";
import { City } from "./City";
import { OwnCar } from "./Car";
import { RemoteCar } from "./RemoteCar";
import { TargetBeacon, TargetPointer } from "./TargetBeacon";
import { ChaseCamera } from "./ChaseCamera";
import { ownPose } from "./drivingState";
import { PerfProbe } from "../ui/PerfOverlay";

export function Game() {
  const seed = useGameStore((s) => s.seed);
  if (seed === undefined) return null;
  return (
    <Canvas
      shadows="basic"
      camera={{ position: [0, 5.4, -10], fov: 62, near: 0.35, far: 6000 }}
      dpr={[1, 1.5]}
    >
      <Scene seed={seed} />
    </Canvas>
  );
}

/** The city outgrew a single static shadow frustum, so the sun rides along with the player. */
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    target.position.set(ownPose.x, 0, ownPose.z);
    target.updateMatrixWorld();
    light.current?.position.set(ownPose.x + 72, 128, ownPose.z - 60);
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        position={[100, 128, -75]}
        intensity={2.65}
        color="#fff0c2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-camera-left={-115}
        shadow-camera-right={115}
        shadow-camera-top={115}
        shadow-camera-bottom={-115}
        shadow-camera-far={460}
      />
    </>
  );
}

function Scene({ seed }: { seed: number }) {
  const players = useGameStore((s) => s.players),
    selfId = useGameStore((s) => s.selfId),
    phase = useGameStore((s) => s.phase);
  const city = useMemo(() => generateCity(seed), [seed]);
  const orders = useMemo(() => generateOrders(seed), [seed]);
  const self = ownPlayer({ players, selfId });
  if (!self) return null;
  const order = orders[self.orderIndex];
  const target =
    order &&
    (self.leg === "pickup" ? city.restaurants[order.restaurantId] : city.houses[order.houseId]);
  return (
    <Suspense
      fallback={
        <mesh position={[0, 5, -20]}>
          <boxGeometry args={[8, 8, 8]} />
          <meshBasicMaterial color="red" />
        </mesh>
      }
    >
      <Sky
        distance={3000}
        sunPosition={[100, 38, -70]}
        turbidity={3.2}
        rayleigh={1.25}
        mieCoefficient={0.012}
        mieDirectionalG={0.85}
      />
      <fog attach="fog" args={["#72c9ee", 300, 790]} />
      <hemisphereLight intensity={1.15} color="#c9efff" groundColor="#d8974c" />
      <Sun />
      <City city={city} seed={seed} />
      <OwnCar
        spawn={city.spawns[self.spawnIndex]!.pos}
        spawnYaw={city.spawns[self.spawnIndex]!.yaw}
        city={city}
        phase={phase}
        color={self.color}
        carrying={self.leg === "dropoff"}
      />
      {players
        .filter((p) => p.id !== self.id)
        .map((p) => (
          <RemoteCar
            key={p.id}
            id={p.id}
            color={p.color}
            name={p.name}
            carrying={p.leg === "dropoff"}
            spawn={city.spawns[p.spawnIndex]!.pos}
          />
        ))}
      {target && phase === "racing" && (
        <>
          <TargetBeacon pos={target.stop} dropoff={self.leg === "dropoff"} />
          <TargetPointer target={target.stop} dropoff={self.leg === "dropoff"} />
        </>
      )}
      <ChaseCamera grid={city.collisionGrid} />
      <PerfProbe />
    </Suspense>
  );
}
