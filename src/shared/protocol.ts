export const DELIVERIES_TO_WIN = 3;
export const TARGET_RADIUS = 10;
export const TICK_HZ = 12;
export const MAX_PLAYERS = 8;
export const COUNTDOWN_MS = 3_000;
export const FINISH_LINGER_MS = 10_000;

export type Phase = "lobby" | "countdown" | "racing" | "finished";
export type Leg = "pickup" | "dropoff";
export type PlayerPub = {
  id: string;
  name: string;
  ready: boolean;
  color: string;
  deliveries: number;
  orderIndex: number;
  leg: Leg;
  spawnIndex: number;
};
export type Standing = Pick<PlayerPub, "id" | "name" | "deliveries">;

export type ClientMessage =
  | { t: "join"; name: string }
  | { t: "ready"; ready: boolean }
  | { t: "pos"; x: number; y: number; z: number; yaw: number; speed: number };

export type ServerMessage =
  | {
      t: "welcome";
      id: string;
      seed: number;
      phase: Phase;
      players: PlayerPub[];
      countdownEndsAt?: number;
      raceStartedAt?: number;
    }
  | { t: "roster"; players: PlayerPub[] }
  | {
      t: "phase";
      phase: Phase;
      countdownEndsAt?: number;
      raceStartedAt?: number;
      standings?: Standing[];
    }
  | { t: "pos"; id: string; x: number; y: number; z: number; yaw: number; speed: number }
  | { t: "progress"; id: string; orderIndex: number; leg: Leg; deliveries: number }
  | { t: "win"; id: string; standings: Standing[] }
  | { t: "error"; message: string };
