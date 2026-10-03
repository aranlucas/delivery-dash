import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { queryRange, type SpatialGrid } from "../../shared/collision";
import type { Ramp } from "../../shared/city";
import {
  RAMP_BARRIER_WIDTH,
  rampBarrierHeight,
  rampHeight,
  rampUnderside,
} from "../../shared/ramps";
import { cameraPose, drivingTelemetry, ownPose } from "./driving-state";

const desired = new THREE.Vector3();

const look = new THREE.Vector3();

const sample = new THREE.Vector3();

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

const cameraCandidates: number[] = [];

function obstructed(x: number, y: number, z: number, grid: SpatialGrid, ramps: Ramp[]) {
  for (const ramp of ramps) {
    const sin = Math.sin(ramp.yaw),
      cos = Math.cos(ramp.yaw);

    const along = (x - ramp.x) * sin + (z - ramp.z) * cos;
    const across = (x - ramp.x) * cos - (z - ramp.z) * sin;

    // Give the lens clearance at thin faces and the launch lip, where point samples can miss a wall.
    if (Math.abs(along) > ramp.length / 2 + 0.45 || Math.abs(across) > ramp.width / 2 + 0.45)
      continue;
    const t = THREE.MathUtils.clamp(along / ramp.length + 0.5, 0, 1);

    const barrier =
      Math.abs(across) > ramp.width / 2 - RAMP_BARRIER_WIDTH - 0.45
        ? rampBarrierHeight(ramp, t)
        : 0;

    if (y <= rampHeight(ramp, t) + barrier + 0.25 && y > rampUnderside(ramp, t) - 0.25) return true;
  }

  const count = queryRange(grid, x - 1.2, z - 1.2, x + 1.2, z + 1.2, cameraCandidates);

  for (let index = 0; index < count; index++) {
    const box = grid.boxes[cameraCandidates[index]!]!;

    if (
      y < box.top &&
      y > box.base - 1 &&
      x > box.minX - 1.2 &&
      x < box.maxX + 1.2 &&
      z > box.minZ - 1.2 &&
      z < box.maxZ + 1.2
    )
      return true;
  }

  return false;
}

export function ChaseCamera({ grid, ramps }: { grid: SpatialGrid; ramps: Ramp[] }) {
  const cameraYaw = useRef(ownPose.yaw);
  const roll = useRef(0);
  const recoverySequence = useRef(drivingTelemetry.recoverySequence);
  const initialized = useRef(false);

  useFrame(({ clock, camera }, dt) => {
    const d = Math.min(dt, 0.05);

    const recovered =
      !initialized.current || recoverySequence.current !== drivingTelemetry.recoverySequence;

    initialized.current = true;

    if (recovered) {
      recoverySequence.current = drivingTelemetry.recoverySequence;
      cameraYaw.current = ownPose.yaw;
      roll.current = 0;
    }

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

    // Check the view of the car's body as well as the lens, so a launch lip cannot hide the taxi.
    let safeT = 1;
    const probes = Math.ceil(distance / 0.45);

    for (let i = 2; i <= probes; i++) {
      const t = i / probes;
      sample.set(
        THREE.MathUtils.lerp(ownPose.x, desired.x, t),
        THREE.MathUtils.lerp(ownPose.y + 0.2, desired.y, t),
        THREE.MathUtils.lerp(ownPose.z, desired.z, t),
      );

      if (obstructed(sample.x, sample.y, sample.z, grid, ramps)) {
        // A wall immediately behind the car needs a genuinely close camera. The previous 24%
        // floor could still leave the lens inside the facade after a sharp turn into a building.
        safeT = Math.max(0.08, t - 0.18);
        break;
      }
    }

    if (safeT < 1) {
      desired.set(
        THREE.MathUtils.lerp(ownPose.x, desired.x, safeT),
        Math.max(ownPose.y + 1.1, THREE.MathUtils.lerp(ownPose.y + 0.2, desired.y, safeT)),
        THREE.MathUtils.lerp(ownPose.z, desired.z, safeT),
      );
    }

    const shake = drivingTelemetry.impactPulse * 0.2;

    if (shake > 0.001) {
      desired.x += Math.sin(clock.elapsedTime * 67) * shake;
      desired.y += Math.cos(clock.elapsedTime * 59) * shake * 0.6;
    }

    if (recovered) camera.position.copy(desired);
    else camera.position.lerp(desired, 1 - Math.exp(-d * (6.5 + speedRatio * 2.5)));

    // A close camera aims at the body; looking far up the road would crop the rear of the car.
    const openView = THREE.MathUtils.smoothstep(safeT, 0.6, 1);

    const lookAhead = THREE.MathUtils.lerp(
      -Math.min(0.8, distance * safeT * 0.2),
      7 + speedRatio * 5.5,
      openView,
    );

    look.set(
      ownPose.x + Math.sin(ownPose.yaw) * lookAhead,
      ownPose.y + THREE.MathUtils.lerp(0.15, 0.55 + speedRatio * 0.42, openView),
      ownPose.z + Math.cos(ownPose.yaw) * lookAhead,
    );
    camera.lookAt(look);
    cameraPose.yaw = Math.atan2(look.x - camera.position.x, look.z - camera.position.z);
    const targetRoll = -drivingTelemetry.steer * (drivingTelemetry.drifting ? 0.065 : 0.032);
    roll.current = THREE.MathUtils.lerp(roll.current, targetRoll, 1 - Math.exp(-d * 6));
    // lookAt writes the complete camera quaternion. Overwriting its Euler Z component can turn
    // the horizon by 90 degrees at some headings, so apply drift lean around the local view axis.
    camera.rotateZ(roll.current);

    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const perspective = camera;

    if (recovered) perspective.near = 0.35;

    const targetFov =
      62 + speedRatio * 11 + (drivingTelemetry.boosting || drivingTelemetry.padPulse > 0 ? 4 : 0);

    perspective.fov = recovered
      ? targetFov
      : THREE.MathUtils.lerp(perspective.fov, targetFov, 1 - Math.exp(-d * 4.5));
    perspective.updateProjectionMatrix();
  });

  return null;
}
