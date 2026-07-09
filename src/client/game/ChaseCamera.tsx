import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ownPose } from "./Car";
export function ChaseCamera() {
  const { camera } = useThree();
  const look = new THREE.Vector3();
  useFrame((_, dt) => {
    const behind = new THREE.Vector3(
      -Math.sin(ownPose.yaw) * 13,
      8,
      -Math.cos(ownPose.yaw) * 13,
    ).add(new THREE.Vector3(ownPose.x, 0, ownPose.z));
    camera.position.lerp(behind, Math.min(1, dt * 4));
    look.set(ownPose.x + Math.sin(ownPose.yaw) * 4, 1.5, ownPose.z + Math.cos(ownPose.yaw) * 4);
    camera.lookAt(look);
    (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(
      (camera as THREE.PerspectiveCamera).fov,
      58 + Math.min(8, ownPose.speed * 0.2),
      dt * 3,
    );
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  });
  return null;
}
