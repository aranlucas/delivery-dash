import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Pos2 } from "../../shared/city";
import { CarVisual } from "./car-visual";
import type { CarKind } from "./car-geometry";
import type { CarLod } from "./car-model";
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
  const currentLod = useRef<CarLod>("full");
  const [lod, setLod] = useState<CarLod>("full");
  const kind = useMemo(() => kindFor(id), [id]);
  useFrame(({ camera }, dt) => {
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

    // City View can inspect a rival far from our parked car; detail follows the viewer.
    const nextLod = lodFor(node.position.distanceToSquared(camera.position));

    if (nextLod !== currentLod.current) {
      currentLod.current = nextLod;
      setLod(nextLod);
    }
  });

  return (
    <group ref={root} position={[spawn[0], 0.8, spawn[1]]}>
      <CarVisual color={color} carrying={carrying} name={name} kind={kind} lod={lod} />
    </group>
  );
}
