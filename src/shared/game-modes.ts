import type { City, Order, Place } from "./city.ts";
import { TARGET_RADIUS, DELIVERIES_TO_WIN } from "./protocol.ts";
import type { PlayerPub } from "./protocol.ts";

import { modeSchema, type GameMode } from "./wire-schema.ts";

export type { GameMode } from "./wire-schema.ts";

interface GameModeInfo {
  name: string;
  description: string;
  tagline: string;
  color: string;
}

export const RUSH_DURATION_MS = 180_000;

export const CHECKPOINT_COUNT = 8;

export const GAME_MODES: Record<GameMode, GameModeInfo> = {
  delivery: {
    name: "Delivery Race",
    description: `Complete the first ${DELIVERIES_TO_WIN} deliveries to win.`,
    tagline: `FIRST TO ${DELIVERIES_TO_WIN}`,
    color: "#ff8a3d",
  },
  rush: {
    name: "Rush Hour",
    description: "Make the most deliveries before the clock runs out.",
    tagline: `${RUSH_DURATION_MS / 60_000} MINUTES`,
    color: "#ff3d71",
  },
  checkpoint: {
    name: "Checkpoint Sprint",
    description: `Reach ${CHECKPOINT_COUNT} city checkpoints in sequence.`,
    tagline: `${CHECKPOINT_COUNT} CHECKPOINTS`,
    color: "#48d7ff",
  },
  free: {
    name: "Free Drive",
    description: "Explore the city with no timer or objectives.",
    tagline: "NO LIMITS",
    color: "#a7e35f",
  },
};

export const GAME_MODE_IDS = modeSchema.options;

export const DEFAULT_MODE: GameMode = "delivery";

export function isGameMode(value: unknown): value is GameMode {
  return modeSchema.safeParse(value).success;
}

const checkpointCache = new WeakMap<City, Place[]>();

/**
 * Checkpoints use generated curbside stops instead of inventing coordinates. Every generated
 * delivery stop is validated by city tests, so this route remains reachable for every seed.
 */
export function getCheckpoints(city: City): Place[] {
  const cached = checkpointCache.get(city);

  if (cached) {
    return cached;
  }

  const candidates = [...city.restaurants, ...city.houses];
  const checkpoints: Place[] = [];

  for (const place of candidates) {
    if (
      checkpoints.every(
        (previous) =>
          Math.hypot(place.stop[0] - previous.stop[0], place.stop[1] - previous.stop[1]) >=
          2 * TARGET_RADIUS,
      )
    ) {
      checkpoints.push(place);
    }

    if (checkpoints.length === CHECKPOINT_COUNT) {
      break;
    }
  }

  checkpointCache.set(city, checkpoints);

  return checkpoints;
}

export function getObjective(
  mode: GameMode,
  city: City,
  orders: Order[],
  player: Pick<PlayerPub, "orderIndex" | "leg" | "checkpointIndex">,
): Place | undefined {
  if (mode === "free") {
    return undefined;
  }

  if (mode === "checkpoint") {
    return getCheckpoints(city)[player.checkpointIndex];
  }

  if (orders.length === 0) {
    return undefined;
  }

  const order = orders[mode === "rush" ? player.orderIndex % orders.length : player.orderIndex];

  if (!order) {
    return undefined;
  }

  return player.leg === "pickup"
    ? city.restaurants[order.restaurantId]
    : city.houses[order.houseId];
}

type StandingPlayer = Pick<PlayerPub, "id" | "deliveries" | "orderIndex" | "checkpointIndex">;

/** Higher progress sorts first; id makes equal progress deterministic for the standings UI. */
export function comparePlayers(mode: GameMode, a: StandingPlayer, b: StandingPlayer): number {
  const progress =
    mode === "checkpoint"
      ? b.checkpointIndex - a.checkpointIndex
      : b.deliveries - a.deliveries || b.orderIndex - a.orderIndex;

  return progress || a.id.localeCompare(b.id);
}
