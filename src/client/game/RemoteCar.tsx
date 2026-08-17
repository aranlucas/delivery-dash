import { useFrame } from "@react-three/fiber";
import { useMemo, useReducer, useRef } from "react";
import * as THREE from "three";
import type { Pos2 } from "../../shared/city";
import { CarVisual } from "./Car";
import type { CarKind } from "./carGeometry";
import type { CarLod } from "./CarModel";
import { ownPose } from "./drivingState";
import { remotePositions } from "../store";

const RIVAL_KINDS: CarKind[] = ["sedan", "hatch", "sports", "van"];
const kindFor = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return RIVAL_KINDS[Math.abs(hash) % RIVAL_KINDS.length]!;
};

const lodFor = (distanceSquared: number): CarLod =>
  distanceSquared < 60 * 60 ? "full" : distanceSquared < 120 * 120 ? "merged" : "box";

const targetPosition = new THREE.Vector3();

export function RemoteCar({
  id,
  color,
  name,
  carrying,
  spawn,
}: {
  id: string;
  color: string;
  name: string;
  carrying: boolean;
  spawn: Pos2;
}) {
  const root = useRef<THREE.Group>(null);
  const yaw = useRef(0);
  const lod = useRef<CarLod>("full");
  const [, renderLod] = useReducer((value: number) => value + 1, 0);
  const kind = useMemo(() => kindFor(id), [id]);
  useFrame((_, dt) => {
    const target = remotePositions.get(id),
      node = root.current;
    if (!node) return;
    if (!target) {
      node.position.set(spawn[0], 0.8, spawn[1]);
    } else {
      node.position.lerp(targetPosition.set(target.x, target.y, target.z), Math.min(1, dt * 9));
      yaw.current +=
        Math.atan2(Math.sin(target.yaw - yaw.current), Math.cos(target.yaw - yaw.current)) *
        Math.min(1, dt * 10);
      node.rotation.y = yaw.current;
    }
    const dx = node.position.x - ownPose.x;
    const dz = node.position.z - ownPose.z;
    const nextLod = lodFor(dx * dx + dz * dz);
    if (nextLod !== lod.current) {
      lod.current = nextLod;
      renderLod();
    }
  });
  return (
    <group ref={root} position={[spawn[0], 0.8, spawn[1]]}>
      <CarVisual
        color={color}
        carrying={carrying}
        name={name}
        kind={kind}
        lod={lod.current}
      />
    </group>
  );
}
