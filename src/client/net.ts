import type { ClientMessage, ServerMessage } from "../shared/protocol";
import { DEFAULT_MODE, type GameMode } from "../shared/gameModes";
import { remotePositions, useGameStore } from "./store";

let socket: WebSocket | undefined;
let session: { code: string; name: string; mode: GameMode } | undefined;
export function connect(code: string, name: string, mode: GameMode = DEFAULT_MODE) {
  close();
  useGameStore.getState().reset();
  useGameStore.getState().set({ connecting: true, roomCode: code });
  session = { code, name, mode };
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const current = new WebSocket(`${protocol}://${location.host}/api/room/${code}/ws`);
  socket = current;
  current.onopen = () => {
    if (socket !== current) return;
    send({ t: "join", name, mode });
  };
  current.onmessage = (event) => {
    if (socket === current) handle(JSON.parse(String(event.data)) as ServerMessage);
  };
  current.onerror = () => {
    if (socket === current)
      useGameStore.getState().set({ lastError: "Connection error. Please try again." });
  };
  current.onclose = () => {
    if (socket !== current) return;
    const store = useGameStore.getState();
    if (session)
      store.set({
        connected: false,
        connecting: false,
        lastError: store.lastError ?? "Connection closed. Please try again.",
      });
    socket = undefined;
  };
}
export function close() {
  session = undefined;
  socket?.close();
  socket = undefined;
}
export function rejoin() {
  if (session) connect(session.code, session.name, session.mode);
}
export function send(message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function handle(message: ServerMessage) {
  const store = useGameStore.getState();
  switch (message.t) {
    case "welcome":
      store.set({
        screen: "game",
        connected: true,
        connecting: false,
        lastError: undefined,
        mode: message.mode,
        selfId: message.id,
        seed: message.seed,
        phase: message.phase,
        players: message.players,
        countdownEndsAt: message.countdownEndsAt,
        raceStartedAt: message.raceStartedAt,
        raceEndsAt: message.raceEndsAt,
      });
      break;
    case "roster":
      for (const id of remotePositions.keys())
        if (!message.players.some((player) => player.id === id)) remotePositions.delete(id);
      store.set({ players: message.players });
      break;
    case "phase":
      store.set({
        mode: message.mode,
        phase: message.phase,
        countdownEndsAt: message.countdownEndsAt,
        raceStartedAt: message.raceStartedAt,
        raceEndsAt: message.raceEndsAt,
        standings: message.standings,
      });
      break;
    case "pos":
      remotePositions.set(message.id, { ...message, t: performance.now() });
      break;
    case "progress":
      store.set({
        players: store.players.map((p) =>
          p.id === message.id
            ? {
                ...p,
                orderIndex: message.orderIndex,
                leg: message.leg,
                deliveries: message.deliveries,
                checkpointIndex: message.checkpointIndex,
              }
            : p,
        ),
      });
      break;
    case "win":
      store.set({ phase: "finished", standings: message.standings });
      break;
    case "error":
      store.set({ lastError: message.message });
      break;
  }
}
