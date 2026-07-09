import { create } from "zustand";
import type { Phase, PlayerPub, Standing } from "../shared/protocol";

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
  selfId?: string;
  seed?: number;
  phase: Phase;
  players: PlayerPub[];
  countdownEndsAt?: number;
  raceStartedAt?: number;
  standings?: Standing[];
  connected: boolean;
  lastError?: string;
  set: (patch: Partial<GameState>) => void;
  reset: () => void;
};
const initial = {
  screen: "menu" as Screen,
  roomCode: "",
  phase: "lobby" as Phase,
  players: [] as PlayerPub[],
  connected: false,
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
