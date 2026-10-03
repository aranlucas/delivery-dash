import type { BoostPad } from "./city.ts";

export const BOOST_PAD_WIDTH = 3.4;

export const BOOST_PAD_LENGTH = 8;

const HALF_WIDTH = BOOST_PAD_WIDTH / 2 + 0.8;

const HALF_LENGTH = BOOST_PAD_LENGTH / 2;

/** Swept entry into the visible strip, travelling with its arrows. Staying on it never retriggers. */
export function crossesBoostPad(
  pad: BoostPad,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  height: number,
  speed: number,
): boolean {
  if (speed < 6 || Math.abs(height - pad.y) > 0.65) return false;

  const sin = Math.sin(pad.yaw),
    cos = Math.cos(pad.yaw);

  const across = (fromX - pad.x) * cos - (fromZ - pad.z) * sin;
  const along = (fromX - pad.x) * sin + (fromZ - pad.z) * cos;

  const dx = toX - fromX,
    dz = toZ - fromZ;

  const distance = Math.hypot(dx, dz);
  const travelAcross = dx * cos - dz * sin;
  const travelAlong = dx * sin + dz * cos;

  // Reject teleports, sideways passes, reverse travel, and cars already inside the strip.
  if (distance < 1e-5 || distance > 8 || travelAlong < distance * 0.65) return false;

  if (Math.abs(across) <= HALF_WIDTH && Math.abs(along) <= HALF_LENGTH) return false;

  let entry = Math.max(0, (-HALF_LENGTH - along) / travelAlong);
  let exit = Math.min(1, (HALF_LENGTH - along) / travelAlong);

  if (Math.abs(travelAcross) < 1e-8) {
    if (Math.abs(across) > HALF_WIDTH) return false;
  } else {
    const a = (-HALF_WIDTH - across) / travelAcross;
    const b = (HALF_WIDTH - across) / travelAcross;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }

  return entry <= exit;
}
