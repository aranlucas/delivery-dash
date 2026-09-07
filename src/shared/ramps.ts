import type { Ramp } from "./city.ts";

export const rampSegments = (kind: Ramp["kind"]) => (kind === "kicker" ? 16 : 32);

const profile = (kind: Ramp["kind"], u: number) =>
  kind === "kicker" ? u ** 1.7 : u * u * (3 - 2 * u);

/** Piecewise-linear surface shared with the rendered triangles, including the launch lip. */
export function rampHeight(ramp: Pick<Ramp, "kind" | "height">, t: number): number {
  const segments = rampSegments(ramp.kind);
  const sample = Math.max(0, Math.min(1, t)) * segments;
  const index = Math.min(segments - 1, Math.floor(sample));
  const a = profile(ramp.kind, index / segments),
    b = profile(ramp.kind, (index + 1) / segments);
  return ramp.height * (a + (b - a) * (sample - index));
}

export function rampSurface(ramp: Ramp, x: number, z: number): number | undefined {
  const dx = x - ramp.x,
    dz = z - ramp.z;
  const sin = Math.sin(ramp.yaw),
    cos = Math.cos(ramp.yaw);
  const along = dx * sin + dz * cos,
    across = dx * cos - dz * sin;
  if (Math.abs(along) > ramp.length / 2 + 1e-8 || Math.abs(across) > ramp.width / 2 + 1e-8)
    return undefined;
  return rampHeight(ramp, along / ramp.length + 0.5);
}

/** Include the car's footprint at vertical sides/back, without putting a wall across the toe. */
export function rampBlocks(
  ramp: Ramp,
  x: number,
  z: number,
  height: number,
  stepUp: number,
): boolean {
  const dx = x - ramp.x,
    dz = z - ramp.z;
  const sin = Math.sin(ramp.yaw),
    cos = Math.cos(ramp.yaw);
  const along = dx * sin + dz * cos,
    across = dx * cos - dz * sin;
  const halfLength = ramp.length / 2,
    halfWidth = ramp.width / 2;
  const margin = 2;
  if (Math.abs(along) > halfLength + margin || Math.abs(across) > halfWidth + margin) return false;
  const surface = rampHeight(ramp, along / ramp.length + 0.5);
  const outsideFace = Math.abs(across) > halfWidth || along > halfLength;
  return surface > height + (outsideFace ? 0.45 : stepUp);
}

/** Land only while crossing a surface from above, never while rising underneath it. */
export const crossesLanding = (
  previous: number,
  next: number,
  ground: number,
  verticalSpeed: number,
) => verticalSpeed <= 0 && previous >= ground - 1e-6 && next <= ground;
