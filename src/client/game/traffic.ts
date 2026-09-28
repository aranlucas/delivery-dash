import { WORLD_HALF, type City } from "../../shared/city";

export type TrafficCar = { x: number; z: number; yaw: number };

/**
 * City traffic is decoration, not simulation: each car is a pure function of the clock, so it costs
 * nothing to keep, never desyncs from its own render, and needs no network traffic of its own.
 * The array is shared so the player's collision test can read the same positions that were drawn.
 */
export const trafficCars: TrafficCar[] = [];

const SPAN = WORLD_HALF * 2;

export function updateTraffic(city: City, time: number) {
  trafficCars.length = city.trafficRoutes.length;
  for (let index = 0; index < city.trafficRoutes.length; index++) {
    const route = city.trafficRoutes[index]!;
    const travelled = route.offset + route.direction * route.speed * time;
    const along = ((((travelled + WORLD_HALF) % SPAN) + SPAN) % SPAN) - WORLD_HALF;
    const yaw =
      route.axis === "x"
        ? route.direction > 0
          ? Math.PI / 2
          : -Math.PI / 2
        : route.direction > 0
          ? 0
          : Math.PI;
    const car = (trafficCars[index] ??= { x: 0, z: 0, yaw: 0 });
    car.x = route.axis === "x" ? along : route.cross;
    car.z = route.axis === "x" ? route.cross : along;
    car.yaw = yaw;
  }
}
