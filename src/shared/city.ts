import { mulberry32, randomInt } from "./rng.ts";

export const GRID_SIZE = 12;
export const BLOCK_SIZE = 36;
export const ROAD_WIDTH = 14;
export const PITCH = BLOCK_SIZE + ROAD_WIDTH;
export const WORLD_HALF = (GRID_SIZE * PITCH) / 2;
/** How far a car may snap up onto a surface. Anything taller than this is a wall. */
export const STEP_UP = 2.2;
/** Half width of an elevated expressway deck and its approach ramps. */
export const DECK_HALF = 6.5;

export type Pos2 = [number, number];
export type Building = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  /** Which facade family this block wears: 0 downtown glass, 1 midtown masonry, 2 outskirts stucco. */
  district: number;
};
/** Solid box. `base`/`top` gate collision by altitude, so cars pass under decks and land on roofs. */
export type AABB = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  base: number;
  top: number;
};
/** A drivable slope. `kicker` curves up to a sharp lip and launches; `grade` eases onto a deck. */
export type Ramp = {
  x: number;
  z: number;
  /** Yaw the ramp climbs toward; 0 is +z. */
  yaw: number;
  length: number;
  width: number;
  height: number;
  kind: "kicker" | "grade";
};
/** Flat elevated slab. Never solid — cars drive underneath and land on top. */
export type Deck = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };
export type BoostPad = { x: number; z: number; y: number; yaw: number };
export type ParkedCar = { x: number; z: number; yaw: number; color: string };
/** A traffic car driving a straight road line forever, wrapping at the world edge. */
export type TrafficRoute = {
  axis: "x" | "z";
  /** Fixed coordinate of the lane: road centre offset to one side. */
  cross: number;
  direction: 1 | -1;
  speed: number;
  offset: number;
  color: string;
};
export type Place = { id: number; name: string; pos: Pos2; stop: Pos2 };
export type Order = { restaurantId: number; houseId: number };
export type City = {
  buildings: Building[];
  /** Every solid box in the world: buildings, storefronts, expressway pillars, deck guardrails. */
  buildingAABBs: AABB[];
  parks: Pos2[];
  restaurants: Place[];
  houses: Place[];
  spawns: { pos: Pos2; yaw: number }[];
  ramps: Ramp[];
  decks: Deck[];
  pillars: AABB[];
  rails: AABB[];
  boostPads: BoostPad[];
  parkedCars: ParkedCar[];
  trafficRoutes: TrafficRoute[];
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
  "Gyro Garage",
  "Ramen Rocket",
  "Chili Circuit",
  "Falafel Freeway",
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
  "Blake J.",
  "Emery A.",
  "Rowan G.",
  "Sasha P.",
  "Noel R.",
];
/** Downtown glass, midtown warm brick, outskirts pastel. */
const districtColors = [
  ["#6e89c7", "#57a7b8", "#7b71b6", "#4f93b5", "#55a99d"],
  ["#f0a35e", "#e6c66d", "#e77b67", "#c78f72", "#e2944f"],
  ["#edba78", "#9abf77", "#d98982", "#86b76d", "#d77d9c"],
] as const;

// Each 50-unit cell is road [0,14] then block [14,50]; block center sits at +32.
export const blockCenter = (index: number) =>
  -WORLD_HALF + ROAD_WIDTH + BLOCK_SIZE / 2 + index * PITCH;
export const roadCenter = (index: number) => -WORLD_HALF + index * PITCH + ROAD_WIDTH / 2;

const GRID_CENTER = (GRID_SIZE - 1) / 2;
/** 0 downtown towers, 1 midtown mid-rise, 2 low-rise outskirts, as concentric rings. */
export function districtAt(gx: number, gz: number) {
  const ring = Math.max(Math.abs(gx - GRID_CENTER), Math.abs(gz - GRID_CENTER)) / GRID_CENTER;
  return ring < 0.36 ? 0 : ring < 0.73 ? 1 : 2;
}
const districtBuilding = [
  { park: 0.07, count: 3, size: 13, spread: 11, base: 24, rise: 44 },
  { park: 0.16, count: 4, size: 10, spread: 10, base: 13, rise: 24 },
  { park: 0.26, count: 4, size: 8, spread: 9, base: 7, rise: 12 },
] as const;

/** Height of a ramp's surface at a world point, or undefined when the point is off the ramp. */
export function rampSurface(ramp: Ramp, x: number, z: number): number | undefined {
  const dx = x - ramp.x,
    dz = z - ramp.z;
  const sin = Math.sin(ramp.yaw),
    cos = Math.cos(ramp.yaw);
  const along = dx * sin + dz * cos;
  const across = dx * cos - dz * sin;
  if (Math.abs(along) > ramp.length / 2 || Math.abs(across) > ramp.width / 2) return undefined;
  const t = along / ramp.length + 0.5;
  // Kickers keep climbing into a sharp lip; grades flatten at both ends so decks join smoothly.
  return ramp.height * (ramp.kind === "kicker" ? t ** 1.7 : t * t * (3 - 2 * t));
}

/**
 * Highest drivable surface under a car sitting at `height`. Surfaces more than STEP_UP above the
 * car are ignored, which is what lets a deck be a road from on top and a ceiling from below.
 */
export function groundHeightAt(city: City, x: number, z: number, height: number): number {
  const limit = height + STEP_UP;
  let best = 0;
  for (const ramp of city.ramps) {
    const surface = rampSurface(ramp, x, z);
    if (surface !== undefined && surface > best && surface <= limit) best = surface;
  }
  for (const deck of city.decks)
    if (
      deck.height > best &&
      deck.height <= limit &&
      x > deck.minX &&
      x < deck.maxX &&
      z > deck.minZ &&
      z < deck.maxZ
    )
      best = deck.height;
  for (const box of city.buildingAABBs)
    if (
      box.top > best &&
      box.top <= limit &&
      x > box.minX &&
      x < box.maxX &&
      z > box.minZ &&
      z < box.maxZ
    )
      best = box.top;
  return best;
}

const SOLID_MARGIN = 2;
/** True when a car whose wheels sit at `height` cannot occupy this spot. */
export function blocked(city: City, x: number, z: number, height: number): boolean {
  if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) return true;
  for (const ramp of city.ramps) {
    const surface = rampSurface(ramp, x, z);
    if (surface !== undefined && surface > height + STEP_UP) return true;
  }
  for (const box of city.buildingAABBs)
    if (
      height < box.top - 0.6 &&
      height > box.base - 1.4 &&
      x > box.minX - SOLID_MARGIN &&
      x < box.maxX + SOLID_MARGIN &&
      z > box.minZ - SOLID_MARGIN &&
      z < box.maxZ + SOLID_MARGIN
    )
      return true;
  return false;
}

/** True near any elevated structure — used to keep trees and props out of the expressway. */
export function nearExpressway(city: City, x: number, z: number, margin: number): boolean {
  for (const deck of city.decks)
    if (
      x > deck.minX - margin &&
      x < deck.maxX + margin &&
      z > deck.minZ - margin &&
      z < deck.maxZ + margin
    )
      return true;
  for (const ramp of city.ramps)
    if (ramp.kind === "grade" && Math.hypot(x - ramp.x, z - ramp.z) < ramp.length / 2 + margin)
      return true;
  return false;
}

type ExpresswaySpec = {
  axis: "x" | "z";
  road: number;
  height: number;
  from: number;
  to: number;
  /** Cross street carrying the mid-route on-ramp, and which side it climbs from. */
  sideRoad: number;
  sideFrom: -1 | 1;
};
/** Two stacked expressways that cross mid-city: the low one runs under the high one. */
const EXPRESSWAYS: ExpresswaySpec[] = [
  {
    axis: "z",
    road: Math.floor(GRID_SIZE / 4),
    height: 11,
    from: 0,
    to: GRID_SIZE - 1,
    sideRoad: Math.floor(GRID_SIZE / 2),
    sideFrom: -1,
  },
  {
    axis: "x",
    road: Math.floor((GRID_SIZE * 2) / 3),
    height: 19,
    from: 0,
    to: GRID_SIZE - 1,
    sideRoad: Math.floor(GRID_SIZE / 2) - 1,
    sideFrom: -1,
  },
];

function buildExpressways() {
  const ramps: Ramp[] = [],
    decks: Deck[] = [],
    pillars: AABB[] = [],
    rails: AABB[] = [],
    boostPads: BoostPad[] = [];
  for (const spec of EXPRESSWAYS) {
    const cross = roadCenter(spec.road);
    const alongYaw = spec.axis === "x" ? Math.PI / 2 : 0;
    const at = (u: number): Pos2 => (spec.axis === "x" ? [u, cross] : [cross, u]);
    const span = (a: number, b: number, half: number) =>
      spec.axis === "x"
        ? { minX: a, maxX: b, minZ: cross - half, maxZ: cross + half }
        : { minX: cross - half, maxX: cross + half, minZ: a, maxZ: b };
    const rampLength = Math.round(spec.height * 6.4);
    const start = roadCenter(spec.from),
      end = roadCenter(spec.to);
    const deckStart = start + rampLength,
      deckEnd = end - rampLength;

    const [entryX, entryZ] = at(start + rampLength / 2);
    ramps.push({
      x: entryX,
      z: entryZ,
      yaw: alongYaw,
      length: rampLength,
      width: DECK_HALF * 2,
      height: spec.height,
      kind: "grade",
    });
    const [exitX, exitZ] = at(end - rampLength / 2);
    ramps.push({
      x: exitX,
      z: exitZ,
      yaw: alongYaw + Math.PI,
      length: rampLength,
      width: DECK_HALF * 2,
      height: spec.height,
      kind: "grade",
    });
    decks.push({ ...span(deckStart, deckEnd, DECK_HALF), height: spec.height });

    // Mid-route on-ramp climbing off a cross street onto the side of the deck.
    const sideLength = Math.round(spec.height * 5);
    const junction = roadCenter(spec.sideRoad);
    const sideOffset = spec.sideFrom * (DECK_HALF + sideLength / 2);
    const [sideX, sideZ] =
      spec.axis === "z" ? [cross + sideOffset, junction] : [junction, cross + sideOffset];
    ramps.push({
      x: sideX,
      z: sideZ,
      yaw:
        spec.axis === "z"
          ? spec.sideFrom < 0
            ? Math.PI / 2
            : -Math.PI / 2
          : spec.sideFrom < 0
            ? 0
            : Math.PI,
      length: sideLength,
      width: ROAD_WIDTH - 2,
      height: spec.height,
      kind: "grade",
    });

    for (let u = deckStart + PITCH; u < deckEnd - 10; u += PITCH * 2) {
      const [px, pz] = at(u);
      pillars.push({
        minX: px - 1.2,
        maxX: px + 1.2,
        minZ: pz - 1.2,
        maxZ: pz + 1.2,
        base: 0,
        top: spec.height,
      });
    }

    // Guardrails in segments, with gaps at the junction and every 160 units for jump-offs.
    const SEGMENT = 10;
    for (let u = deckStart; u < deckEnd - 0.5; u += SEGMENT) {
      const segmentEnd = Math.min(u + SEGMENT - 0.6, deckEnd);
      const mid = (u + segmentEnd) / 2;
      if (Math.abs(mid - junction) < DECK_HALF + 9) continue;
      if (Math.abs(((mid - deckStart) % 160) - 80) < 14) continue;
      for (const side of [-1, 1] as const) {
        const edge = cross + side * DECK_HALF;
        rails.push(
          spec.axis === "x"
            ? {
                minX: u,
                maxX: segmentEnd,
                minZ: edge - 0.35,
                maxZ: edge + 0.35,
                base: spec.height,
                top: spec.height + 1.6,
              }
            : {
                minX: edge - 0.35,
                maxX: edge + 0.35,
                minZ: u,
                maxZ: segmentEnd,
                base: spec.height,
                top: spec.height + 1.6,
              },
        );
      }
    }

    for (let u = deckStart + 45; u < deckEnd; u += 135) {
      const [px, pz] = at(u);
      boostPads.push({ x: px, z: pz, y: spec.height, yaw: alongYaw });
    }
  }
  // Drop any pillar that would spear a deck or ramp running below it.
  const standing = pillars.filter(
    (pillar) =>
      !decks.some(
        (deck) =>
          deck.height < pillar.top - 1 &&
          pillar.maxX + 4 > deck.minX &&
          pillar.minX - 4 < deck.maxX &&
          pillar.maxZ + 4 > deck.minZ &&
          pillar.minZ - 4 < deck.maxZ,
      ) &&
      !ramps.some((ramp) => {
        if (ramp.height >= pillar.top) return false;
        const surface = rampSurface(
          ramp,
          (pillar.minX + pillar.maxX) / 2,
          (pillar.minZ + pillar.maxZ) / 2,
        );
        return surface !== undefined && surface > 1;
      }),
  );
  return { ramps, decks, pillars: standing, rails, boostPads };
}

/** Seeded jump ramps on the street grid, each with a boost strip on its approach. */
function scatterStunts(seed: number, structures: { ramps: Ramp[]; decks: Deck[] }) {
  const random = mulberry32(seed ^ 0x2b3c1d);
  const kickers: Ramp[] = [];
  const boostPads: BoostPad[] = [];
  const clear = (x: number, z: number, margin: number) => {
    for (const ramp of structures.ramps)
      if (Math.hypot(x - ramp.x, z - ramp.z) < ramp.length / 2 + margin) return false;
    for (const deck of structures.decks)
      if (
        x > deck.minX - margin &&
        x < deck.maxX + margin &&
        z > deck.minZ - margin &&
        z < deck.maxZ + margin
      )
        return false;
    return true;
  };
  const onRoad = () => {
    const alongZ = random() < 0.5;
    const cross = roadCenter(randomInt(random, GRID_SIZE));
    const u = blockCenter(randomInt(random, GRID_SIZE)) + (random() - 0.5) * BLOCK_SIZE * 0.6;
    const yaw = (alongZ ? 0 : Math.PI / 2) + (random() < 0.5 ? 0 : Math.PI);
    return { x: alongZ ? cross : u, z: alongZ ? u : cross, yaw };
  };
  for (let attempt = 0; attempt < 260 && kickers.length < 22; attempt++) {
    const { x, z, yaw } = onRoad();
    if (!clear(x, z, 26)) continue;
    if (kickers.some((k) => Math.hypot(k.x - x, k.z - z) < 74)) continue;
    kickers.push({ x, z, yaw, length: 10, width: 9.5, height: 2.8, kind: "kicker" });
    boostPads.push({ x: x - Math.sin(yaw) * 15, z: z - Math.cos(yaw) * 15, y: 0, yaw });
  }
  for (let attempt = 0; attempt < 200 && boostPads.length < 42; attempt++) {
    const { x, z, yaw } = onRoad();
    if (!clear(x, z, 12)) continue;
    if (kickers.some((k) => Math.hypot(k.x - x, k.z - z) < 26)) continue;
    if (boostPads.some((p) => Math.hypot(p.x - x, p.z - z) < 44)) continue;
    boostPads.push({ x, z, y: 0, yaw });
  }
  return { kickers, boostPads };
}

const carColors = [
  "#d9412f",
  "#2f6fd0",
  "#e8e3d8",
  "#31333a",
  "#3f9e63",
  "#e0a52c",
  "#8a5fc0",
  "#c8ccd2",
  "#7d4a2b",
  "#2aa8b0",
];

/** True when an expressway deck or approach ramp runs along this road line. */
function roadHasStructure(
  structures: { ramps: Ramp[]; decks: Deck[] },
  axis: "x" | "z",
  cross: number,
) {
  for (const deck of structures.decks) {
    const alongX = deck.maxX - deck.minX > deck.maxZ - deck.minZ;
    if (alongX !== (axis === "x")) continue;
    const mid = alongX ? (deck.minZ + deck.maxZ) / 2 : (deck.minX + deck.maxX) / 2;
    if (Math.abs(mid - cross) < ROAD_WIDTH) return true;
  }
  for (const ramp of structures.ramps) {
    if (ramp.kind !== "grade") continue;
    const alongX = Math.abs(Math.sin(ramp.yaw)) > 0.5;
    if (alongX !== (axis === "x")) continue;
    if (Math.abs((alongX ? ramp.z : ramp.x) - cross) < ROAD_WIDTH) return true;
  }
  return false;
}

/** Road line carrying the starting grid: kept free of parking and traffic so launches are clean. */
const SPAWN_ROAD = 3;
/** Kerb parking claims one side of a road line; the moving lane sits on the other. */
const PARKING_OFFSET = 4.5;
const TRAFFIC_LANE_OFFSET = 2.6;
const parkingSide = (roadIndex: number) => (roadIndex % 2 ? 1 : -1);
const isSpawnRoad = (axis: "x" | "z", roadIndex: number) =>
  axis === "x" && roadIndex === SPAWN_ROAD;
export const PARKED_CAR_HALF_LENGTH = 2.3;
export const PARKED_CAR_HALF_WIDTH = 1.25;

/** A lane of moving traffic on every ordinary road line — the streets should look inhabited. */
function buildTraffic(seed: number, structures: { ramps: Ramp[]; decks: Deck[] }): TrafficRoute[] {
  const random = mulberry32(seed ^ 0x1c0ffee);
  const routes: TrafficRoute[] = [];
  for (const axis of ["x", "z"] as const)
    for (let i = 0; i < GRID_SIZE; i++) {
      const road = roadCenter(i);
      if (isSpawnRoad(axis, i) || roadHasStructure(structures, axis, road)) continue;
      const direction = i % 2 ? 1 : -1;
      for (let n = 0; n < 2; n++)
        routes.push({
          axis,
          cross: road - parkingSide(i) * TRAFFIC_LANE_OFFSET,
          direction,
          speed: 11 + random() * 9,
          offset: (random() * 2 - 1) * WORLD_HALF,
          color: carColors[randomInt(random, carColors.length)]!,
        });
    }
  return routes;
}

/** Kerb parking down one side of each road line, skipping anything a driver has to reach. */
function buildParking(
  seed: number,
  structures: { ramps: Ramp[]; decks: Deck[] },
  ramps: Ramp[],
  boostPads: BoostPad[],
  stops: Pos2[],
): ParkedCar[] {
  const random = mulberry32(seed ^ 0x7a12b);
  const cars: ParkedCar[] = [];
  for (const axis of ["x", "z"] as const)
    for (let i = 0; i < GRID_SIZE; i++) {
      const road = roadCenter(i);
      if (isSpawnRoad(axis, i) || roadHasStructure(structures, axis, road)) continue;
      const cross = road + parkingSide(i) * PARKING_OFFSET;
      for (let j = 0; j < GRID_SIZE; j++)
        for (const slot of [-10, -3, 4, 11]) {
          if (random() < 0.35) continue;
          const along = blockCenter(j) + slot;
          const x = axis === "x" ? along : cross,
            z = axis === "x" ? cross : along;
          if (stops.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 10)) continue;
          if (ramps.some((r) => Math.hypot(r.x - x, r.z - z) < r.length / 2 + 10)) continue;
          if (boostPads.some((p) => Math.hypot(p.x - x, p.z - z) < 8)) continue;
          cars.push({
            x,
            z,
            yaw: axis === "x" ? Math.PI / 2 : 0,
            color: carColors[randomInt(random, carColors.length)]!,
          });
        }
    }
  return cars;
}

export function generateCity(seed: number): City {
  const random = mulberry32(seed);
  const structures = buildExpressways();
  const stunts = scatterStunts(seed, structures);
  const ramps = [...structures.ramps, ...stunts.kickers];
  const boostPads = [...structures.boostPads, ...stunts.boostPads];

  // A curbside stop only works if a car can actually park on it: inside the drivable bounds, off
  // every ramp wedge, and clear of the expressway columns.
  const usableStop = ([x, z]: Pos2) =>
    Math.abs(x) < WORLD_HALF - 4 &&
    Math.abs(z) < WORLD_HALF - 4 &&
    !ramps.some((ramp) => (rampSurface(ramp, x, z) ?? 0) > 0.4) &&
    !structures.pillars.some(
      (pillar) =>
        Math.abs(x - (pillar.minX + pillar.maxX) / 2) < 6 &&
        Math.abs(z - (pillar.minZ + pillar.maxZ) / 2) < 6,
    );

  // Places pull from their own random stream so buildings can avoid their footprints.
  // Positions sit just inside block corners, adjacent to the surrounding roads.
  const corners: { pos: Pos2; stops: Pos2[] }[] = [];
  for (let x = 0; x < GRID_SIZE; x++)
    for (let z = 0; z < GRID_SIZE; z++) {
      const cx = blockCenter(x),
        cz = blockCenter(z),
        edge = BLOCK_SIZE / 2 - 5;
      const lane = BLOCK_SIZE / 2 + ROAD_WIDTH / 2;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const pos: Pos2 = [cx + sx * edge, cz + sz * edge];
        const stops = (
          [
            [cx + sx * lane, cz + sz * edge],
            [cx + sx * edge, cz + sz * lane],
          ] as Pos2[]
        ).filter(usableStop);
        if (stops.length) corners.push({ pos, stops });
      }
    }
  const placeRandom = mulberry32(seed ^ 0x9e3779b9);
  const takePlace = () => corners.splice(randomInt(placeRandom, corners.length), 1)[0]!;
  const makePlace = (name: string, id: number): Place => {
    const corner = takePlace();
    return { id, name, pos: corner.pos, stop: corner.stops[id % corner.stops.length]! };
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
      const district = districtAt(gx, gz);
      const shape = districtBuilding[district]!;
      if (random() < shape.park) {
        parks.push([cx, cz]);
        continue;
      }
      const count = 1 + randomInt(random, shape.count);
      for (let n = 0; n < count; n++) {
        const w = shape.size + random() * shape.spread,
          d = shape.size + random() * shape.spread;
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
          const palette = districtColors[district]!;
          buildings.push({
            x,
            z,
            w,
            d,
            h: shape.base + random() * shape.rise,
            color: palette[randomInt(random, palette.length)]!,
            district,
          });
          placed = true;
        }
      }
    }
  const buildingAABBs: AABB[] = buildings.map(({ x, z, w, d, h }) => ({
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    base: 0,
    top: h,
  }));
  // Restaurants (8.5×6, 5.2 tall) and houses (6×6, 5.1 tall) are solid too.
  for (const [px, pz] of placePoints.slice(0, restaurants.length))
    buildingAABBs.push({
      minX: px - 4.25,
      maxX: px + 4.25,
      minZ: pz - 3,
      maxZ: pz + 3,
      base: 0,
      top: 5.2,
    });
  for (const [px, pz] of placePoints.slice(restaurants.length))
    buildingAABBs.push({
      minX: px - 3,
      maxX: px + 3,
      minZ: pz - 3,
      maxZ: pz + 3,
      base: 0,
      top: 5.1,
    });
  buildingAABBs.push(...structures.pillars, ...structures.rails);

  const parkedCars = buildParking(
    seed,
    structures,
    ramps,
    boostPads,
    [...restaurants, ...houses].map((p) => p.stop),
  );
  // SOLID_MARGIN already covers the player's own half-width, so parked boxes are stored shrunk by
  // roughly that much: inflated again at collision time they land back on the real bodywork.
  const solidWidth = PARKED_CAR_HALF_WIDTH - 0.65,
    solidLength = PARKED_CAR_HALF_LENGTH - 0.6;
  for (const car of parkedCars) {
    const halfX = car.yaw === 0 ? solidWidth : solidLength;
    const halfZ = car.yaw === 0 ? solidLength : solidWidth;
    buildingAABBs.push({
      minX: car.x - halfX,
      maxX: car.x + halfX,
      minZ: car.z - halfZ,
      maxZ: car.z + halfZ,
      base: 0,
      top: 1.7,
    });
  }

  return {
    buildings,
    parks,
    restaurants,
    houses,
    buildingAABBs,
    ramps,
    decks: structures.decks,
    pillars: structures.pillars,
    rails: structures.rails,
    boostPads,
    parkedCars,
    trafficRoutes: buildTraffic(seed, structures),
    spawns: Array.from({ length: 8 }, (_, i) => ({
      pos: [-WORLD_HALF + 40 + i * 10, -WORLD_HALF + 3 * PITCH + ROAD_WIDTH / 2],
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
