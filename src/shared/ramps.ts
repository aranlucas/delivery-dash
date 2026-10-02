import type { Ramp } from "./city.ts";

export const RAMP_SLAB_DEPTH = 0.9;
export const RAMP_BARRIER_WIDTH = 0.42;
export const RAMP_BARRIER_HEIGHT = 0.8;

export const rampSegments = (kind: Ramp["kind"]) => (kind === "kicker" ? 32 : 64);

const profile = (kind: Ramp["kind"], u: number) =>
  kind === "kicker" ? u * u : u * u * (3 - 2 * u);

/** Piecewise-linear surface shared with the rendered triangles, including the launch lip. */
export function rampHeight(ramp: Pick<Ramp, "kind" | "height">, t: number): number {
  const segments = rampSegments(ramp.kind);
  const sample = Math.max(0, Math.min(1, t)) * segments;
  const index = Math.min(segments - 1, Math.floor(sample));
  const a = profile(ramp.kind, index / segments),
    b = profile(ramp.kind, (index + 1) / segments);
  return ramp.height * (a + (b - a) * (sample - index));
}

/** Raised approaches are slabs; jump ramps keep their enclosed steel side panels. */
export const rampUnderside = (ramp: Pick<Ramp, "kind" | "height">, t: number) =>
  ramp.kind === "grade" ? Math.max(0, rampHeight(ramp, t) - RAMP_SLAB_DEPTH) : 0;

/** Taper the concrete barriers into the first four metres of an approach. */
export const rampBarrierHeight = (ramp: Pick<Ramp, "kind" | "length">, t: number) =>
  ramp.kind === "grade" ? RAMP_BARRIER_HEIGHT * Math.max(0, Math.min(1, (t * ramp.length) / 4)) : 0;

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
  const t = along / ramp.length + 0.5;
  const surface = rampHeight(ramp, t);
  // The same soffit is rendered by makeRampGeometry. Include the roof of the car
  // so a low approach still blocks it, while a raised span can be driven under.
  if (height + 1.4 <= rampUnderside(ramp, t - margin / ramp.length)) return false;
  if (ramp.kind === "grade" && height < surface - 0.45) return true;
  if (
    ramp.kind === "grade" &&
    along >= -halfLength &&
    along <= halfLength &&
    Math.abs(across) > halfWidth - RAMP_BARRIER_WIDTH - margin &&
    height < surface + rampBarrierHeight(ramp, t) - 0.15 &&
    height > surface - 1.4
  )
    return true;
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
