import type { AABB, Place } from "./city.ts";
import { deliveryColliders } from "./deliveryColliders.ts";

export type DeliveryModel = keyof typeof deliveryColliders;
export function storefrontModel(name: string): DeliveryModel | undefined {
  if (name === "Sushi Express") return "sushi";
  if (name === "Pizza Planet") return "pizza";
  if (name === "Dumpling Depot") return "depot";
}
/** Cardinal frontage faces the pickup curb; keeps its authored solid boxes exact after rotation. */
export function storefrontYaw(place: Place) {
  return (
    Math.round(
      Math.atan2(place.stop[0] - place.pos[0], place.stop[1] - place.pos[1]) / (Math.PI / 2),
    ) *
    (Math.PI / 2)
  );
}
export function modelColliders(model: DeliveryModel, x: number, z: number, yaw = 0): AABB[] {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return deliveryColliders[model].map((box) => {
    const cx = (box.minX + box.maxX) / 2,
      cz = (box.minZ + box.maxZ) / 2;
    const hx = (box.maxX - box.minX) / 2,
      hz = (box.maxZ - box.minZ) / 2;
    const wx = x + cx * c + cz * s,
      wz = z - cx * s + cz * c;
    const ex = Math.abs(c) * hx + Math.abs(s) * hz,
      ez = Math.abs(s) * hx + Math.abs(c) * hz;
    return {
      minX: wx - ex,
      maxX: wx + ex,
      minZ: wz - ez,
      maxZ: wz + ez,
      base: box.base,
      top: box.top,
    };
  });
}
export const jumpGatePosition = (zone: { id: string; x: number; z: number }): [number, number] => [
  zone.x + (zone.id === "freight" ? 24 : 0),
  zone.z,
];
