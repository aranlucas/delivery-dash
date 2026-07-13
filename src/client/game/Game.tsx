import { Canvas } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import { generateCity, generateOrders } from "../../shared/city";
import { useGameStore, ownPlayer } from "../store";
import { City } from "./City";
import { OwnCar } from "./Car";
import { RemoteCar } from "./RemoteCar";
import { TargetBeacon } from "./TargetBeacon";
import { ChaseCamera } from "./ChaseCamera";

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
      <fog attach="fog" args={["#72c9ee", 245, 650]} />
      <hemisphereLight intensity={1.15} color="#c9efff" groundColor="#d8974c" />
      <directionalLight
        position={[100, 125, -75]}
        intensity={2.65}
        color="#fff0c2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-camera-left={-180}
        shadow-camera-right={180}
        shadow-camera-top={180}
        shadow-camera-bottom={-180}
        shadow-camera-far={420}
      />
      <City city={city} seed={seed} />
      <OwnCar
        spawn={city.spawns[self.spawnIndex]!.pos}
        spawnYaw={city.spawns[self.spawnIndex]!.yaw}
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
        <TargetBeacon pos={target.stop} dropoff={self.leg === "dropoff"} />
      )}
      <ChaseCamera boxes={city.buildingAABBs} />
    </Suspense>
  );
}
