import { Canvas, useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import type { City as CityData, Order } from "../../shared/city";
import { getObjective } from "../../shared/game-modes";
import { useGameStore, ownPlayer } from "../store";
import { City } from "./city";
import { OwnCar } from "./car";
import { RemoteCar } from "./remote-car";
import { CheckpointGate, TargetBeacon, TargetPointer } from "./target-beacon";
import { ChaseCamera } from "./chase-camera";
import { CityViewCamera } from "./city-view-camera";
import { ownPose } from "./driving-state";
import { PerfProbe } from "../ui/perf-overlay";

export function Game({ seed, city, orders }: { seed: number; city: CityData; orders: Order[] }) {
  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [0, 5.4, -10], fov: 62, near: 0.35, far: 6000 }}
      dpr={[1, 1.25]}
    >
      <Scene seed={seed} city={city} orders={orders} />
    </Canvas>
  );
}

/** The city outgrew a single static shadow frustum, so the sun rides along with the player. */
function Sun({ inspecting }: { inspecting: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ controls }) => {
    const focus =
      inspecting && controls && "target" in controls && controls.target instanceof THREE.Vector3
        ? controls.target
        : undefined;

    const x = focus?.x ?? ownPose.x,
      z = focus?.z ?? ownPose.z;

    target.position.set(x, 0, z);
    target.updateMatrixWorld();
    light.current?.position.set(x + 72, 128, z - 60);
  });

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        position={[100, 128, -75]}
        intensity={2.25}
        color="#ffdfad"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.12}
        shadow-camera-left={-115}
        shadow-camera-right={115}
        shadow-camera-top={115}
        shadow-camera-bottom={-115}
        shadow-camera-far={460}
      />
    </>
  );
}

function Scene({ seed, city, orders }: { seed: number; city: CityData; orders: Order[] }) {
  const players = useGameStore((s) => s.players),
    selfId = useGameStore((s) => s.selfId),
    phase = useGameStore((s) => s.phase);

  const mode = useGameStore((s) => s.mode);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const inspecting = cameraMode === "city" && phase === "racing";
  const self = ownPlayer({ players, selfId });

  if (!self) return null;
  const target = getObjective(mode, city, orders, self);

  return (
    <Suspense fallback={null}>
      <Sky
        distance={inspecting ? 20000 : 3000}
        sunPosition={[100, 22, -70]}
        turbidity={4.5}
        rayleigh={1.6}
        mieCoefficient={0.012}
        mieDirectionalG={0.85}
      />
      <fog attach="fog" args={["#aac9cf", inspecting ? 4500 : 380, inspecting ? 5800 : 1250]} />
      <hemisphereLight intensity={1.15} color="#c9efff" groundColor="#d6a57e" />
      <Sun inspecting={inspecting} />
      <City city={city} seed={seed} />
      <OwnCar
        spawn={city.spawns[self.spawnIndex]!.pos}
        spawnYaw={city.spawns[self.spawnIndex]!.yaw}
        city={city}
        phase={phase}
        color={self.color}
        carrying={self.leg === "dropoff"}
        controlsEnabled={!inspecting}
      />
      {players.map((p) =>
        p.id === self.id ? null : (
          <RemoteCar
            key={p.id}
            id={p.id}
            color={p.color}
            name={p.name}
            carrying={p.leg === "dropoff"}
            spawn={city.spawns[p.spawnIndex]!.pos}
          />
        ),
      )}
      {target && phase === "racing" && !inspecting && (
        <>
          {mode === "checkpoint" ? (
            <CheckpointGate place={target} number={self.checkpointIndex + 1} />
          ) : (
            <TargetBeacon pos={target.stop} dropoff={self.leg === "dropoff"} />
          )}
          <TargetPointer
            target={target.stop}
            dropoff={self.leg === "dropoff"}
            checkpoint={mode === "checkpoint"}
          />
        </>
      )}
      {inspecting ? (
        <CityViewCamera />
      ) : (
        <ChaseCamera grid={city.collisionGrid} ramps={city.ramps} />
      )}
      <PerfProbe />
    </Suspense>
  );
}
