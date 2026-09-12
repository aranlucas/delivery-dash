import { DurableObject } from "cloudflare:workers";
import {
  COUNTDOWN_MS,
  DELIVERIES_TO_WIN,
  FINISH_LINGER_MS,
  MAX_PLAYERS,
  TARGET_RADIUS,
  type ClientMessage,
  type Phase,
  type PlayerPub,
  type ServerMessage,
  type Standing,
} from "../shared/protocol";
import {
  CHECKPOINT_COUNT,
  DEFAULT_MODE,
  RUSH_DURATION_MS,
  comparePlayers,
  getObjective,
  isGameMode,
  type GameMode,
} from "../shared/gameModes";
import {
  generateCity,
  generateOrders,
  groundHeightAt,
  type City,
  type Order,
} from "../shared/city";

type Player = Omit<PlayerPub, "id">;
type RoomState = {
  seed: number;
  mode: GameMode;
  phase: Phase;
  players: Record<string, Player>;
  countdownEndsAt?: number;
  raceStartedAt?: number;
  raceEndsAt?: number;
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
  private world?: { seed: number; city: City; orders: Order[] };

  /** The city is large enough that regenerating it per position update would dominate the tick. */
  private route(seed: number) {
    if (this.world?.seed !== seed)
      this.world = {
        seed,
        city: generateCity(seed),
        orders: generateOrders(seed),
      };
    return this.world;
  }

  private async load(): Promise<RoomState | undefined> {
    if (this.state) return this.state;
    const state = await this.ctx.storage.get<RoomState>("state");
    if (!state) return undefined;
    let migrated = false;
    if (!isGameMode(state.mode)) {
      state.mode = DEFAULT_MODE;
      migrated = true;
    }
    for (const player of Object.values(state.players)) {
      if (!Number.isFinite(player.checkpointIndex)) {
        player.checkpointIndex = 0;
        migrated = true;
      }
    }
    this.state = state;
    if (migrated) await this.ctx.storage.put("state", state);
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
    return Object.entries(this.state?.players ?? {}).map(([id, player]) => ({
      id,
      ...player,
    }));
  }
  private phaseMessage(): ServerMessage {
    const s = this.state!;
    return {
      t: "phase",
      phase: s.phase,
      mode: s.mode,
      countdownEndsAt: s.countdownEndsAt,
      raceStartedAt: s.raceStartedAt,
      raceEndsAt: s.raceEndsAt,
      standings: s.standings,
    };
  }
  private standings(): Standing[] {
    return this.roster()
      .sort((a, b) => comparePlayers(this.state!.mode, a, b))
      .map(({ id, name, deliveries, checkpointIndex }) => ({
        id,
        name,
        deliveries,
        checkpointIndex,
      }));
  }

  private sendWelcome(socket: WebSocket, id: string) {
    const state = this.state!;
    this.send(socket, {
      t: "welcome",
      id,
      seed: state.seed,
      mode: state.mode,
      phase: state.phase,
      players: this.roster(),
      countdownEndsAt: state.countdownEndsAt,
      raceStartedAt: state.raceStartedAt,
      raceEndsAt: state.raceEndsAt,
    });
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
      const value: unknown = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message),
      );
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        typeof (value as { t?: unknown }).t !== "string"
      )
        throw new Error("invalid message shape");
      parsed = value as ClientMessage;
    } catch {
      this.send(socket, { t: "error", message: "Invalid message." });
      return;
    }
    await this.load(); // in-memory state is lost across hibernation; recover before any guard
    const playerId = this.playerId(socket);
    if (parsed.t === "join") {
      if (typeof parsed.name !== "string") {
        this.send(socket, { t: "error", message: "Invalid player name." });
        return;
      }
      if (parsed.mode !== undefined && !isGameMode(parsed.mode)) {
        this.send(socket, { t: "error", message: "Invalid game mode." });
        return;
      }
      await this.join(socket, parsed.name, parsed.mode);
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

  private async join(socket: WebSocket, unsafeName: string, requestedMode?: GameMode) {
    const attachedId = this.playerId(socket);
    let state = await this.load();
    if (state && attachedId && state.players[attachedId]) {
      this.sendWelcome(socket, attachedId);
      return;
    }
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
        state.raceEndsAt = undefined;
        state.standings = undefined;
        await this.ctx.storage.deleteAlarm();
      }
    }
    if (!state) {
      state = this.state = {
        seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
        mode: requestedMode ?? DEFAULT_MODE,
        phase: "lobby",
        players: {},
      };
    }
    const lateFreeJoin = state.phase === "racing" && state.mode === "free";
    if (state.phase !== "lobby" && !lateFreeJoin) {
      this.send(socket, {
        t: "error",
        message: "Race already in progress. Try again shortly.",
      });
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
      ready: lateFreeJoin,
      color: PALETTE[spawnIndex % PALETTE.length]!,
      deliveries: 0,
      orderIndex: 0,
      leg: "pickup",
      checkpointIndex: 0,
      spawnIndex,
    };
    socket.serializeAttachment({ playerId } satisfies Attachment);
    await this.save();
    this.sendWelcome(socket, playerId);
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
      !Number.isFinite(update.x) ||
      !Number.isFinite(update.y) ||
      !Number.isFinite(update.z) ||
      !Number.isFinite(update.yaw) ||
      !Number.isFinite(update.speed)
    )
      return;
    // A position arriving after the authoritative Rush Hour deadline cannot score a target.
    if (state.phase === "racing" && state.raceEndsAt && Date.now() >= state.raceEndsAt) {
      await this.finish();
      return;
    }
    this.positions.set(id, { x: update.x, z: update.z });
    this.broadcast(
      {
        t: "pos",
        id,
        x: update.x,
        y: update.y,
        z: update.z,
        yaw: update.yaw,
        speed: update.speed,
      },
      id,
    );
    if (state.phase !== "racing") return; // lobby/countdown: free-roam relay only, no delivery progress
    const player = state.players[id]!;
    const { city, orders } = this.route(state.seed);
    const target = getObjective(state.mode, city, orders, player);
    if (!target) return; // Free Drive intentionally has no objective or progress.
    if (Math.hypot(update.x - target.stop[0], update.z - target.stop[1]) > TARGET_RADIUS) return;
    // Never let a car score a ground-level target from an elevated deck or while airborne.
    const targetGround = groundHeightAt(city, target.stop[0], target.stop[1], 0);
    const carSurface = Math.max(0, update.y - 0.8);
    if (targetGround <= 0.4 && carSurface > 0.5) return;

    if (state.mode === "checkpoint") {
      player.checkpointIndex++;
    } else if (player.leg === "pickup") player.leg = "dropoff";
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
      checkpointIndex: player.checkpointIndex,
    });
    if (
      (state.mode === "delivery" && player.deliveries >= DELIVERIES_TO_WIN) ||
      (state.mode === "checkpoint" && player.checkpointIndex >= CHECKPOINT_COUNT)
    )
      await this.finish(id);
  }

  private async finish(winnerId?: string) {
    const state = this.state!;
    if (state.phase === "finished") return;
    state.phase = "finished";
    state.raceEndsAt = undefined;
    state.standings = this.standings();
    await this.save();
    this.broadcast(this.phaseMessage());
    const win: ServerMessage = winnerId
      ? { t: "win", id: winnerId, standings: state.standings }
      : { t: "win", standings: state.standings };
    this.broadcast(win);
    await this.ctx.storage.setAlarm(Date.now() + FINISH_LINGER_MS);
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
    if (state.phase === "lobby") await this.maybeCountdown();
  }

  async alarm(): Promise<void> {
    const state = await this.load();
    if (!state) return;
    if (state.phase === "countdown") {
      state.phase = "racing";
      state.raceStartedAt = Date.now();
      state.countdownEndsAt = undefined;
      state.raceEndsAt = state.mode === "rush" ? state.raceStartedAt + RUSH_DURATION_MS : undefined;
      await this.save();
      if (state.raceEndsAt) await this.ctx.storage.setAlarm(state.raceEndsAt);
      this.broadcast(this.phaseMessage());
      return;
    }
    if (state.phase === "racing" && state.mode === "rush" && state.raceEndsAt) {
      if (Date.now() < state.raceEndsAt) {
        await this.ctx.storage.setAlarm(state.raceEndsAt);
        return;
      }
      await this.finish();
      return;
    }
    if (state.phase === "finished") {
      state.phase = "lobby";
      state.standings = undefined;
      state.raceStartedAt = undefined;
      state.raceEndsAt = undefined;
      for (const player of Object.values(state.players))
        Object.assign(player, {
          ready: false,
          deliveries: 0,
          orderIndex: 0,
          leg: "pickup",
          checkpointIndex: 0,
        });
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
