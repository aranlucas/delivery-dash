import { mulberry32, randomInt } from "./rng.ts";

export const GRID_SIZE = 8;
export const BLOCK_SIZE = 36;
export const ROAD_WIDTH = 14;
export const PITCH = BLOCK_SIZE + ROAD_WIDTH;
export const WORLD_HALF = (GRID_SIZE * PITCH) / 2;
export type Pos2 = [number, number];
export type Building = { x: number; z: number; w: number; d: number; h: number; color: string };
export type AABB = { minX: number; maxX: number; minZ: number; maxZ: number };
export type Place = { id: number; name: string; pos: Pos2; stop: Pos2 };
export type Order = { restaurantId: number; houseId: number };
export type City = {
  buildings: Building[];
  buildingAABBs: AABB[];
  parks: Pos2[];
  restaurants: Place[];
  houses: Place[];
  spawns: { pos: Pos2; yaw: number }[];
};

const restaurantNames = [
  "Taco Palace",
  "Burger Barn",
  "Pho Real",
  "Pizza Planet",
  "Sushi Express",
  "Curry Up",
  "Wing Kingdom",
  "Noodle Ninja",
  "Bagel Boss",
  "Kebab Kart",
  "Waffle Works",
  "Dumpling Depot",
];
const houseNames = [
  "Alex M.",
  "Sam K.",
  "Jordan P.",
  "Taylor R.",
  "Casey L.",
  "Morgan D.",
  "Riley S.",
  "Jamie W.",
  "Avery B.",
  "Quinn T.",
  "Parker N.",
  "Drew C.",
  "Skyler J.",
  "Reese H.",
  "Cameron V.",
  "Blake F.",
];
const districtColors = [
  ["#f0a35e", "#e6c66d", "#57a7b8", "#e77b67", "#86b76d"],
  ["#6e89c7", "#d77d9c", "#7b71b6", "#e2944f", "#55a99d"],
  ["#edba78", "#c78f72", "#77a6c5", "#9abf77", "#d98982"],
] as const;
// Each 50-unit cell is road [0,14] then block [14,50]; block center sits at +32.
const blockCenter = (index: number) => -WORLD_HALF + ROAD_WIDTH + BLOCK_SIZE / 2 + index * PITCH;

export function generateCity(seed: number): City {
  const random = mulberry32(seed);
  // Places first (own random stream) so buildings can avoid their footprints.
  // Positions sit just inside block corners, adjacent to the surrounding roads.
  const corners: { pos: Pos2; stopX: Pos2; stopZ: Pos2 }[] = [];
  for (let x = 0; x < GRID_SIZE; x++)
    for (let z = 0; z < GRID_SIZE; z++) {
      const cx = blockCenter(x),
        cz = blockCenter(z),
        edge = BLOCK_SIZE / 2 - 5;
      const lane = BLOCK_SIZE / 2 + ROAD_WIDTH / 2;
      corners.push(
        {
          pos: [cx - edge, cz - edge],
          stopX: [cx - lane, cz - edge],
          stopZ: [cx - edge, cz - lane],
        },
        {
          pos: [cx + edge, cz - edge],
          stopX: [cx + lane, cz - edge],
          stopZ: [cx + edge, cz - lane],
        },
        {
          pos: [cx - edge, cz + edge],
          stopX: [cx - lane, cz + edge],
          stopZ: [cx - edge, cz + lane],
        },
        {
          pos: [cx + edge, cz + edge],
          stopX: [cx + lane, cz + edge],
          stopZ: [cx + edge, cz + lane],
        },
      );
    }
  const placeRandom = mulberry32(seed ^ 0x9e3779b9);
  const takePlace = () => corners.splice(randomInt(placeRandom, corners.length), 1)[0]!;
  const makePlace = (name: string, id: number): Place => {
    const corner = takePlace();
    return { id, name, pos: corner.pos, stop: id % 2 === 0 ? corner.stopX : corner.stopZ };
  };
  const restaurants = restaurantNames.map(makePlace);
  const houses = houseNames.map(makePlace);
  const placePoints: Pos2[] = [...restaurants, ...houses].map((p) => p.pos);

  const buildings: Building[] = [];
  const parks: Pos2[] = [];
  for (let gx = 0; gx < GRID_SIZE; gx++)
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      const cx = blockCenter(gx),
        cz = blockCenter(gz);
      if (random() < 0.16) {
        parks.push([cx, cz]);
        continue;
      }
      const count = 1 + randomInt(random, 4);
      for (let n = 0; n < count; n++) {
        const w = 9 + random() * 10,
          d = 9 + random() * 10;
        let placed = false;
        for (let attempt = 0; attempt < 8 && !placed; attempt++) {
          const x = cx + (random() - 0.5) * (BLOCK_SIZE - w - 3);
          const z = cz + (random() - 0.5) * (BLOCK_SIZE - d - 3);
          if (
            placePoints.some(
              ([px, pz]) => Math.abs(px - x) < w / 2 + 6 && Math.abs(pz - z) < d / 2 + 6,
            )
          )
            continue;
          const palette = districtColors[Math.min(2, Math.floor((gx * 3) / GRID_SIZE))]!;
          buildings.push({
            x,
            z,
            w,
            d,
            h: 8 + random() * 32,
            color: palette[randomInt(random, palette.length)],
          });
          placed = true;
        }
      }
    }
  const buildingAABBs: AABB[] = buildings.map(({ x, z, w, d }) => ({
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  }));
  // Restaurants (8.5×6) and houses (6×6) are solid too.
  for (const [px, pz] of placePoints.slice(0, restaurants.length))
    buildingAABBs.push({ minX: px - 4.25, maxX: px + 4.25, minZ: pz - 3, maxZ: pz + 3 });
  for (const [px, pz] of placePoints.slice(restaurants.length))
    buildingAABBs.push({ minX: px - 3, maxX: px + 3, minZ: pz - 3, maxZ: pz + 3 });
  return {
    buildings,
    parks,
    restaurants,
    houses,
    buildingAABBs,
    spawns: Array.from({ length: 8 }, (_, i) => ({
      pos: [-WORLD_HALF + 36 + i * 9, -WORLD_HALF + 3 * PITCH + ROAD_WIDTH / 2],
      yaw: Math.PI / 2,
    })),
  };
}

export function generateOrders(seed: number): Order[] {
  const random = mulberry32(seed ^ 0x51ed270b);
  const orders: Order[] = [];
  let previous = -1;
  for (let i = 0; i < 6; i++) {
    let restaurant = randomInt(random, restaurantNames.length);
    while (restaurant === previous) restaurant = randomInt(random, restaurantNames.length);
    previous = restaurant;
    orders.push({ restaurantId: restaurant, houseId: randomInt(random, houseNames.length) });
  }
  return orders;
}
