import { DurableObject } from "cloudflare:workers";
import {
  COUNTDOWN_MS,
  DELIVERIES_TO_WIN,
  FINISH_LINGER_MS,
  MAX_PLAYERS,
  TARGET_RADIUS,
  type ClientMessage,
  type Leg,
  type Phase,
  type PlayerPub,
  type ServerMessage,
  type Standing,
} from "../shared/protocol";
import { generateCity, generateOrders } from "../shared/city";

type Player = Omit<PlayerPub, "id">;
type RoomState = {
  seed: number;
  phase: Phase;
  players: Record<string, Player>;
  countdownEndsAt?: number;
  raceStartedAt?: number;
  standings?: Standing[];
};
type Attachment = { playerId: string };
const PALETTE = [
  "#eb1700",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#eab308",
];

export class RaceRoom extends DurableObject<Env> {
  private state?: RoomState;
  private positions = new Map<string, { x: number; z: number }>();

  private async load(): Promise<RoomState | undefined> {
    if (this.state) return this.state;
    this.state = await this.ctx.storage.get<RoomState>("state");
    return this.state;
  }
  private async save() {
    if (this.state) await this.ctx.storage.put("state", this.state);
  }
  private playerId(socket: WebSocket): string | undefined {
    return (socket.deserializeAttachment() as Attachment | null)?.playerId;
  }
  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }
  private send(socket: WebSocket, message: ServerMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      /* closed socket */
    }
  }
  private broadcast(message: ServerMessage, exceptId?: string) {
    for (const socket of this.sockets())
      if (this.playerId(socket) !== exceptId) this.send(socket, message);
  }
  private roster(): PlayerPub[] {
    return Object.entries(this.state?.players ?? {}).map(([id, player]) => ({ id, ...player }));
  }
  private phaseMessage(): ServerMessage {
    const s = this.state!;
    return {
      t: "phase",
      phase: s.phase,
      countdownEndsAt: s.countdownEndsAt,
      raceStartedAt: s.raceStartedAt,
      standings: s.standings,
    };
  }
  private standings(): Standing[] {
    return this.roster()
      .sort((a, b) => b.deliveries - a.deliveries || b.orderIndex - a.orderIndex)
      .map(({ id, name, deliveries }) => ({ id, name, deliveries }));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message),
      ) as ClientMessage;
    } catch {
      this.send(socket, { t: "error", message: "Invalid message." });
      return;
    }
    await this.load(); // in-memory state is lost across hibernation; recover before any guard
    const playerId = this.playerId(socket);
    if (parsed.t === "join") {
      await this.join(socket, parsed.name);
      return;
    }
    if (!playerId || !this.state?.players[playerId]) {
      this.send(socket, { t: "error", message: "Join first." });
      return;
    }
    if (parsed.t === "ready") {
      if (this.state.phase !== "lobby") return;
      this.state.players[playerId].ready = Boolean(parsed.ready);
      await this.save();
      this.broadcast({ t: "roster", players: this.roster() });
      await this.maybeCountdown();
    } else if (parsed.t === "pos") await this.position(playerId, parsed);
  }

  private async join(socket: WebSocket, unsafeName: string) {
    let state = await this.load();
    if (state) {
      // Prune players whose sockets are gone (dev reload, crashed connections) so rooms don't fill with ghosts.
      const alive = new Set(this.sockets().map((s) => this.playerId(s)));
      for (const id of Object.keys(state.players))
        if (!alive.has(id)) {
          delete state.players[id];
          this.positions.delete(id);
        }
      if (!Object.keys(state.players).length && state.phase !== "lobby") {
        state.phase = "lobby";
        state.countdownEndsAt = undefined;
        state.raceStartedAt = undefined;
        state.standings = undefined;
        await this.ctx.storage.deleteAlarm();
      }
    }
    if (!state) {
      state = this.state = {
        seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
        phase: "lobby",
        players: {},
      };
    }
    if (state.phase !== "lobby") {
      this.send(socket, { t: "error", message: "Race already in progress. Try again shortly." });
      socket.close(4003, "race in progress");
      return;
    }
    if (Object.keys(state.players).length >= MAX_PLAYERS) {
      this.send(socket, { t: "error", message: "Room is full." });
      socket.close(4004, "room full");
      return;
    }
    const playerId = crypto.randomUUID();
    const name = unsafeName.trim().slice(0, 20) || "Driver";
    const used = new Set(Object.values(state.players).map((p) => p.spawnIndex));
    let spawnIndex = 0;
    while (used.has(spawnIndex)) spawnIndex++;
    state.players[playerId] = {
      name,
      ready: false,
      color: PALETTE[spawnIndex % PALETTE.length]!,
      deliveries: 0,
      orderIndex: 0,
      leg: "pickup",
      spawnIndex,
    };
    socket.serializeAttachment({ playerId } satisfies Attachment);
    await this.save();
    this.send(socket, {
      t: "welcome",
      id: playerId,
      seed: state.seed,
      phase: state.phase,
      players: this.roster(),
      countdownEndsAt: state.countdownEndsAt,
      raceStartedAt: state.raceStartedAt,
    });
    this.broadcast({ t: "roster", players: this.roster() }, playerId);
  }

  private async maybeCountdown() {
    const state = this.state!;
    const players = Object.values(state.players);
    if (state.phase !== "lobby" || !players.length || !players.every((p) => p.ready)) return;
    state.phase = "countdown";
    state.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    await this.save();
    await this.ctx.storage.setAlarm(state.countdownEndsAt);
    this.broadcast(this.phaseMessage());
  }

  private async position(id: string, update: Extract<ClientMessage, { t: "pos" }>) {
    const state = this.state!;
    if (
      state.phase === "finished" ||
      !Number.isFinite(update.x + update.z + update.yaw + update.speed)
    )
      return;
    this.positions.set(id, { x: update.x, z: update.z });
    this.broadcast(
      { t: "pos", id, x: update.x, y: update.y, z: update.z, yaw: update.yaw, speed: update.speed },
      id,
    );
    if (state.phase !== "racing") return; // lobby/countdown: free-roam relay only, no delivery progress
    const player = state.players[id]!;
    const order = generateOrders(state.seed)[player.orderIndex];
    if (!order) return;
    const city = generateCity(state.seed);
    const target =
      player.leg === "pickup" ? city.restaurants[order.restaurantId] : city.houses[order.houseId];
    if (Math.hypot(update.x - target.pos[0], update.z - target.pos[1]) > TARGET_RADIUS) return;
    if (player.leg === "pickup") player.leg = "dropoff";
    else {
      player.deliveries++;
      player.orderIndex++;
      player.leg = "pickup";
    }
    await this.save();
    this.broadcast({
      t: "progress",
      id,
      orderIndex: player.orderIndex,
      leg: player.leg,
      deliveries: player.deliveries,
    });
    if (player.deliveries >= DELIVERIES_TO_WIN) {
      state.phase = "finished";
      state.standings = this.standings();
      await this.save();
      this.broadcast({ t: "win", id, standings: state.standings });
      await this.ctx.storage.setAlarm(Date.now() + FINISH_LINGER_MS);
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.remove(this.playerId(socket));
  }
  async webSocketError(socket: WebSocket): Promise<void> {
    await this.remove(this.playerId(socket));
  }
  private async remove(id?: string) {
    const state = await this.load();
    if (!state || !id || !state.players[id]) return;
    delete state.players[id];
    this.positions.delete(id);
    if (!Object.keys(state.players).length) {
      this.state = undefined;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.save();
    this.broadcast({ t: "roster", players: this.roster() });
  }

  async alarm(): Promise<void> {
    const state = await this.load();
    if (!state) return;
    if (state.phase === "countdown") {
      state.phase = "racing";
      state.raceStartedAt = Date.now();
      state.countdownEndsAt = undefined;
      await this.save();
      this.broadcast(this.phaseMessage());
      return;
    }
    if (state.phase === "finished") {
      state.phase = "lobby";
      state.standings = undefined;
      state.raceStartedAt = undefined;
      for (const player of Object.values(state.players))
        Object.assign(player, { ready: false, deliveries: 0, orderIndex: 0, leg: "pickup" });
      await this.save();
      this.broadcast(this.phaseMessage());
      this.broadcast({ t: "roster", players: this.roster() });
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = new URL(request.url).pathname.match(/^\/api\/room\/([A-Z]{4})\/ws$/);
    if (!match) return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket upgrade required", { status: 426 });
    return env.RACE_ROOM.getByName(match[1]!).fetch(request);
  },
} satisfies ExportedHandler<Env>;
