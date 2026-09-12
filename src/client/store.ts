import { create } from "zustand";
import type { Phase, PlayerPub, Standing } from "../shared/protocol";
import { DEFAULT_MODE, type GameMode } from "../shared/gameModes";

export type RemotePosition = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  t: number;
};
export const remotePositions = new Map<string, RemotePosition>();
type Screen = "menu" | "game";
type GameState = {
  screen: Screen;
  roomCode: string;
  mode: GameMode;
  selfId?: string;
  seed?: number;
  phase: Phase;
  players: PlayerPub[];
  countdownEndsAt?: number;
  raceStartedAt?: number;
  raceEndsAt?: number;
  standings?: Standing[];
  connected: boolean;
  connecting: boolean;
  lastError?: string;
  set: (patch: Partial<GameState>) => void;
  reset: () => void;
};
const initial = {
  screen: "menu" as Screen,
  roomCode: "",
  mode: DEFAULT_MODE,
  selfId: undefined,
  seed: undefined,
  phase: "lobby" as Phase,
  players: [] as PlayerPub[],
  connected: false,
  connecting: false,
  countdownEndsAt: undefined,
  raceStartedAt: undefined,
  raceEndsAt: undefined,
  standings: undefined,
  lastError: undefined,
};
export const useGameStore = create<GameState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => {
    remotePositions.clear();
    set(initial);
  },
}));
export const ownPlayer = (state: Pick<GameState, "selfId" | "players">) =>
  state.players.find((p) => p.id === state.selfId);
