import type { ClientMessage, ServerMessage } from "../shared/protocol";
import { remotePositions, useGameStore } from "./store";

let socket: WebSocket | undefined;
let session: { code: string; name: string } | undefined;
export function connect(code: string, name: string) {
  close();
  session = { code, name };
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/api/room/${code}/ws`);
  socket.onopen = () => {
    useGameStore
      .getState()
      .set({ connected: true, lastError: undefined, roomCode: code, screen: "game" });
    send({ t: "join", name });
  };
  socket.onmessage = (event) => handle(JSON.parse(String(event.data)) as ServerMessage);
  socket.onerror = () => useGameStore.getState().set({ lastError: "Connection error." });
  socket.onclose = () => {
    if (session) useGameStore.getState().set({ connected: false });
    socket = undefined;
  };
}
export function close() {
  session = undefined;
  socket?.close();
  socket = undefined;
}
export function rejoin() {
  if (session) connect(session.code, session.name);
}
export function send(message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function handle(message: ServerMessage) {
  const store = useGameStore.getState();
  switch (message.t) {
    case "welcome":
      store.set({
        selfId: message.id,
        seed: message.seed,
        phase: message.phase,
        players: message.players,
        countdownEndsAt: message.countdownEndsAt,
        raceStartedAt: message.raceStartedAt,
      });
      break;
    case "roster":
      store.set({ players: message.players });
      break;
    case "phase":
      store.set({
        phase: message.phase,
        countdownEndsAt: message.countdownEndsAt,
        raceStartedAt: message.raceStartedAt,
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
