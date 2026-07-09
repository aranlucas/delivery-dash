import { Canvas } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import { generateCity, generateOrders } from "../../shared/city";
import { useGameStore, ownPlayer } from "../store";
import { City } from "./City";
import { OwnCar } from "./Car";
import { RemoteCar } from "./RemoteCar";
import { TargetBeacon, TargetPointer } from "./TargetBeacon";
import { ChaseCamera } from "./ChaseCamera";

export function Game() {
  const seed = useGameStore((s) => s.seed);
  if (seed === undefined) return null;
  return (
    <Canvas
      shadows
      camera={{ position: [0, 9, -14], fov: 60, near: 0.5, far: 6000 }}
      dpr={[1, 1.75]}
    >
      <Scene seed={seed} />
    </Canvas>
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
        sunPosition={[120, 45, -80]}
        turbidity={5.5}
        rayleigh={2}
        mieCoefficient={0.02}
        mieDirectionalG={0.85}
      />
      <fog attach="fog" args={["#93a0b4", 210, 560]} />
      <hemisphereLight intensity={0.65} color="#dbe4ff" groundColor="#4a4038" />
      <directionalLight
        position={[120, 150, -70]}
        intensity={2}
        color="#ffd9ae"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-240}
        shadow-camera-right={240}
        shadow-camera-top={240}
        shadow-camera-bottom={-240}
        shadow-camera-far={500}
      />
      <City city={city} seed={seed} />
      <OwnCar
        spawn={city.spawns[self.spawnIndex]!.pos}
        boxes={city.buildingAABBs}
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
          <TargetBeacon pos={target.pos} dropoff={self.leg === "dropoff"} />
          <TargetPointer target={target.pos} dropoff={self.leg === "dropoff"} />
        </>
      )}
      <ChaseCamera />
    </Suspense>
  );
}
