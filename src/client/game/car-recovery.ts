import {
  GRID_SIZE,
  WORLD_HALF,
  blocked,
  groundHeightAt,
  roadCenter,
  type City,
} from "../../shared/city.ts";

export type RecoveryPose = { x: number; z: number; yaw: number };

type NearbyCar = { x: number; z: number };

/** Keep the whole car on a flat, clear street, with room to start driving again. */
export function isRecoverySpotClear(
  city: City,
  x: number,
  z: number,
  traffic: readonly NearbyCar[],
) {
  if (traffic.some((car) => Math.hypot(car.x - x, car.z - z) < 7)) return false;

  for (const [dx, dz] of [
    [0, 0],
    [-2, -2],
    [-2, 2],
    [2, -2],
    [2, 2],
  ]) {
    if (blocked(city, x + dx!, z + dz!, 0)) return false;

    if (groundHeightAt(city, x + dx!, z + dz!, 0) > 0.05) return false;
  }

  return true;
}

/** Recover locally rather than undoing a drive across the city. Prefer the road matching the heading. */
export function findCarRecovery(
  city: City,
  pose: RecoveryPose,
  fallback: RecoveryPose,
  traffic: readonly NearbyCar[] = [],
): RecoveryPose {
  let best: RecoveryPose | undefined;
  let bestCost = Infinity;
  const edge = WORLD_HALF - 9;

  for (let road = 0; road < GRID_SIZE; road++) {
    const cross = roadCenter(road);

    for (const axis of ["x", "z"] as const) {
      const along = Math.max(-edge, Math.min(edge, axis === "x" ? pose.x : pose.z));
      const heading = axis === "x" ? Math.sin(pose.yaw) : Math.cos(pose.yaw);

      const yaw =
        axis === "x" ? (heading >= 0 ? Math.PI / 2 : -Math.PI / 2) : heading >= 0 ? 0 : Math.PI;

      for (const offset of [0, -6, 6, -12, 12, -24, 24, -40, 40]) {
        const x = axis === "x" ? along + offset : cross;
        const z = axis === "z" ? along + offset : cross;
        const cost = Math.hypot(x - pose.x, z - pose.z) + (1 - Math.abs(heading)) * 3;

        if (cost >= bestCost || !isRecoverySpotClear(city, x, z, traffic)) continue;
        best = { x, z, yaw };
        bestCost = cost;
      }
    }
  }

  return best ?? fallback;
}
