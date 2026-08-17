/** Absolute bearing from (x, z) to (tx, tz), matching three.js rotation.y. */
export const worldBearing = (x: number, z: number, tx: number, tz: number) =>
  Math.atan2(tx - x, tz - z);

/**
 * Screen-space bearing for a camera looking along `yaw`. CSS rotation is
 * clockwise-positive, while a three.js camera facing +z renders world +x on
 * the left, so the subtraction order is intentionally yaw - worldBearing.
 */
export function relativeBearing(
  x: number,
  z: number,
  yaw: number,
  tx: number,
  tz: number,
): number {
  const delta = yaw - worldBearing(x, z, tx, tz);
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}
