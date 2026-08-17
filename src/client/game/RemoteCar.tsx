import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Pos2 } from "../../shared/city";
import { CarVisual } from "./Car";
import { remotePositions } from "../store";

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
  useFrame((_, dt) => {
    const target = remotePositions.get(id),
      node = root.current;
    if (!node) return;
    if (!target) {
      node.position.set(spawn[0], 0.8, spawn[1]);
      return;
    }
    node.position.lerp(targetPosition.set(target.x, target.y, target.z), Math.min(1, dt * 9));
    yaw.current +=
      Math.atan2(Math.sin(target.yaw - yaw.current), Math.cos(target.yaw - yaw.current)) *
      Math.min(1, dt * 10);
    node.rotation.y = yaw.current;
  });
  return (
    <group ref={root} position={[spawn[0], 0.8, spawn[1]]}>
      <CarVisual color={color} carrying={carrying} name={name} />
    </group>
  );
}
