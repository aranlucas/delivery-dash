import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AABB } from "../../shared/city";
import { drivingTelemetry, ownPose } from "./drivingState";

const desired = new THREE.Vector3();
const look = new THREE.Vector3();
const sample = new THREE.Vector3();

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function obstructed(x: number, y: number, z: number, boxes: AABB[]) {
  return boxes.some(
    (box) =>
      y < box.top &&
      y > box.base - 1 &&
      x > box.minX - 1.2 &&
      x < box.maxX + 1.2 &&
      z > box.minZ - 1.2 &&
      z < box.maxZ + 1.2,
  );
}

export function ChaseCamera({ boxes }: { boxes: AABB[] }) {
  const { camera } = useThree();
  const cameraYaw = useRef(ownPose.yaw);
  const roll = useRef(0);

  useFrame(({ clock }, dt) => {
    const d = Math.min(dt, 0.05);
    const speedRatio = Math.min(1, ownPose.speed / 52);
    const yawLag = 1 - Math.exp(-d * (4.2 + speedRatio * 1.8));
    cameraYaw.current += shortestAngle(cameraYaw.current, ownPose.yaw) * yawLag;

    const distance = 9.4 + speedRatio * 1.4;
    // Airborne the camera hangs back and higher so the landing stays in frame.
    const height = ownPose.y + 3.85 + speedRatio * 0.75 + (drivingTelemetry.airborne ? 1.4 : 0);
    desired.set(
      ownPose.x - Math.sin(cameraYaw.current) * distance,
      height,
      ownPose.z - Math.cos(cameraYaw.current) * distance,
    );

    // Pull the camera toward the car before it enters a building footprint.
    let safeT = 1;
    for (let i = 2; i <= 10; i++) {
      const t = i / 10;
      sample.set(
        THREE.MathUtils.lerp(ownPose.x, desired.x, t),
        THREE.MathUtils.lerp(ownPose.y + 1.3, desired.y, t),
        THREE.MathUtils.lerp(ownPose.z, desired.z, t),
      );
      if (obstructed(sample.x, sample.y, sample.z, boxes)) {
        safeT = Math.max(0.24, t - 0.16);
        break;
      }
    }
    if (safeT < 1) {
      desired.set(
        THREE.MathUtils.lerp(ownPose.x, desired.x, safeT),
        THREE.MathUtils.lerp(ownPose.y + 1.7, desired.y, safeT),
        THREE.MathUtils.lerp(ownPose.z, desired.z, safeT),
      );
    }

    const shake = drivingTelemetry.impactPulse * 0.2;
    if (shake > 0.001) {
      desired.x += Math.sin(clock.elapsedTime * 67) * shake;
      desired.y += Math.cos(clock.elapsedTime * 59) * shake * 0.6;
    }
    camera.position.lerp(desired, 1 - Math.exp(-d * (6.5 + speedRatio * 2.5)));

    const lookAhead = 7 + speedRatio * 5.5;
    look.set(
      ownPose.x + Math.sin(ownPose.yaw) * lookAhead,
      ownPose.y + 0.55 + speedRatio * 0.42,
      ownPose.z + Math.cos(ownPose.yaw) * lookAhead,
    );
    camera.lookAt(look);
    const targetRoll = -drivingTelemetry.steer * (drivingTelemetry.drifting ? 0.065 : 0.032);
    roll.current = THREE.MathUtils.lerp(roll.current, targetRoll, 1 - Math.exp(-d * 6));
    camera.rotation.z += roll.current;

    const perspective = camera as THREE.PerspectiveCamera;
    const targetFov = 62 + speedRatio * 11 + (drivingTelemetry.boosting ? 4 : 0);
    perspective.fov = THREE.MathUtils.lerp(perspective.fov, targetFov, 1 - Math.exp(-d * 4.5));
    perspective.updateProjectionMatrix();
  });
  return null;
}
