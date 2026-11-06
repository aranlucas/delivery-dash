import type { GameMode } from "./game-modes.ts";

export const DELIVERIES_TO_WIN = 3;

export const TARGET_RADIUS = 10;

export const TICK_HZ = 12;

export const MAX_PLAYERS = 8;

export const COUNTDOWN_MS = 3_000;

export const FINISH_LINGER_MS = 10_000;

export type { Phase, Leg, PlayerPub, Standing, ServerMessage } from "./wire-schema.ts";

export type ClientMessage =
  | { t: "join"; name: string; mode?: GameMode }
  | { t: "ready"; ready: boolean }
  | { t: "pos"; x: number; y: number; z: number; yaw: number; speed: number };
