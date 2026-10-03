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
} from "../shared/protocol.ts";
import {
  CHECKPOINT_COUNT,
  DEFAULT_MODE,
  RUSH_DURATION_MS,
  comparePlayers,
  getObjective,
  isGameMode,
  type GameMode,
} from "../shared/game-modes.ts";
import {
  generateCity,
  generateOrders,
  groundHeightAt,
  type City,
  type Order,
} from "../shared/city.ts";

import {
  attachmentSchema,
  clientEnvelopeSchema,
  playerNameSchema,
  positionSchema,
} from "../shared/wire-schema.ts";

type Player = Omit<PlayerPub, "id">;

export type RoomState = {
  seed: number;
  mode: GameMode;
  phase: Phase;
  players: Record<string, Player>;
  countdownEndsAt?: number;
  raceStartedAt?: number;
  raceEndsAt?: number;
  rematchAt?: number;
  standings?: Standing[];
};

export type Attachment = { playerId: string };

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

export interface RoomSocket {
  serializeAttachment(value: Attachment): void;
  deserializeAttachment: WebSocket["deserializeAttachment"];
  send(value: string): void;
  close(code?: number, reason?: string): void;
}

export interface RoomTransaction {
  put(key: "state", value: RoomState): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface RoomStorage extends RoomTransaction {
  get(key: "state"): Promise<RoomState | undefined>;
  deleteAll(): Promise<void>;
  transaction<T>(callback: (transaction: RoomTransaction) => Promise<T>): Promise<T>;
}

export interface RaceRoomContext {
  storage: RoomStorage;
  getWebSockets(): RoomSocket[];
  acceptWebSocket(socket: WebSocket): void;
}

export class RaceRoomCore {
  private readonly ctx: RaceRoomContext;

  constructor(ctx: RaceRoomContext) {
    this.ctx = ctx;
  }

  private state?: RoomState;
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
    const state = await this.ctx.storage.get("state");

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
  private alarmAt(state: RoomState): number | undefined {
    if (state.phase === "countdown") return state.countdownEndsAt;

    if (state.phase === "racing") return state.raceEndsAt;

    if (state.phase === "finished") return state.rematchAt;

    return undefined;
  }
  /** Publish a phase only after its state and wake-up schedule commit together. */
  private async transition(next: RoomState) {
    const alarmAt = this.alarmAt(next);
    await this.ctx.storage.transaction(async (txn) => {
      await txn.put("state", next);

      if (alarmAt !== undefined) await txn.setAlarm(alarmAt);
      else await txn.deleteAlarm();
    });
    // Callers build a new state so a failed transaction cannot change the live phase.
    this.state = next;
  }
  private playerId(socket: RoomSocket): string | undefined {
    const decoded = attachmentSchema.safeParse(socket.deserializeAttachment());

    return decoded.success ? decoded.data.playerId : undefined;
  }
  private sockets(): RoomSocket[] {
    return this.ctx.getWebSockets();
  }
  private send(socket: RoomSocket, message: ServerMessage) {
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
  private roster(state = this.state): PlayerPub[] {
    return Object.entries(state?.players ?? {}).map(([id, player]) => ({
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
  private standings(state = this.state!): Standing[] {
    return this.roster(state)
      .sort((a, b) => comparePlayers(state.mode, a, b))
      .map(({ id, name, deliveries, checkpointIndex }) => ({
        id,
        name,
        deliveries,
        checkpointIndex,
      }));
  }

  private sendWelcome(socket: RoomSocket, id: string) {
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

  async webSocketMessage(socket: RoomSocket, message: string | ArrayBuffer): Promise<void> {
    let parsed: ReturnType<typeof clientEnvelopeSchema.parse>;

    try {
      parsed = clientEnvelopeSchema.parse(
        JSON.parse(message instanceof ArrayBuffer ? new TextDecoder().decode(message) : message),
      );
    } catch {
      this.send(socket, { t: "error", message: "Invalid message." });

      return;
    }

    await this.load(); // in-memory state is lost across hibernation; recover before any guard
    const playerId = this.playerId(socket);

    if (parsed.t === "join") {
      const name = playerNameSchema.safeParse(parsed.name);

      if (!name.success) {
        this.send(socket, { t: "error", message: "Invalid player name." });

        return;
      }

      if (parsed.mode !== undefined && !isGameMode(parsed.mode)) {
        this.send(socket, { t: "error", message: "Invalid game mode." });

        return;
      }

      await this.join(socket, name.data, parsed.mode);

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
    } else if (parsed.t === "pos") {
      const position = positionSchema.safeParse(parsed);

      if (position.success) await this.position(playerId, position.data);
    }
  }

  private async join(socket: RoomSocket, unsafeName: string, requestedMode?: GameMode) {
    const attachedId = this.playerId(socket);
    let state = await this.load();

    if (state && attachedId && state.players[attachedId]) {
      this.sendWelcome(socket, attachedId);

      return;
    }

    if (state) {
      // Prune players whose sockets are gone (dev reload, crashed connections) so rooms don't fill with ghosts.
      const alive = new Set(this.sockets().map((s) => this.playerId(s)));

      for (const id of Object.keys(state.players)) if (!alive.has(id)) delete state.players[id];

      if (!Object.keys(state.players).length && state.phase !== "lobby") {
        const next: RoomState = {
          ...state,
          phase: "lobby",
          countdownEndsAt: undefined,
          raceStartedAt: undefined,
          raceEndsAt: undefined,
          rematchAt: undefined,
          standings: undefined,
        };

        await this.transition(next);
        state = next;
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
    await this.transition({
      ...state,
      phase: "countdown",
      countdownEndsAt: Date.now() + COUNTDOWN_MS,
    });
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
    const player = { ...state.players[id]! };
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

    const next = { ...state, players: { ...state.players, [id]: player } };

    const progress: Extract<ServerMessage, { t: "progress" }> = {
      t: "progress",
      id,
      orderIndex: player.orderIndex,
      leg: player.leg,
      deliveries: player.deliveries,
      checkpointIndex: player.checkpointIndex,
    };

    if (
      (state.mode === "delivery" && player.deliveries >= DELIVERIES_TO_WIN) ||
      (state.mode === "checkpoint" && player.checkpointIndex >= CHECKPOINT_COUNT)
    ) {
      await this.finish(next, progress);
    } else {
      await this.ctx.storage.put("state", next);
      this.state = next;
      this.broadcast(progress);
    }
  }

  private async finish(state = this.state!, progress?: Extract<ServerMessage, { t: "progress" }>) {
    if (state.phase === "finished") return;
    const standings = this.standings(state);
    await this.transition({
      ...state,
      phase: "finished",
      raceEndsAt: undefined,
      rematchAt: Date.now() + FINISH_LINGER_MS,
      standings,
    });

    if (progress) this.broadcast(progress);
    this.broadcast(this.phaseMessage());
    this.broadcast({ t: "win", standings });
  }

  async webSocketClose(socket: RoomSocket): Promise<void> {
    await this.remove(this.playerId(socket));
  }
  async webSocketError(socket: RoomSocket): Promise<void> {
    await this.remove(this.playerId(socket));
  }
  private async remove(id?: string) {
    const state = await this.load();

    if (!state || !id || !state.players[id]) return;
    delete state.players[id];

    if (!Object.keys(state.players).length) {
      // With our compatibility date, deleteAll atomically clears data and the alarm.
      await this.ctx.storage.deleteAll();
      this.state = undefined;

      return;
    }

    await this.save();
    this.broadcast({ t: "roster", players: this.roster() });

    if (state.phase === "lobby") await this.maybeCountdown();
  }

  async alarm(): Promise<void> {
    const state = await this.load();

    if (!state) return;
    const now = Date.now();
    const alarmAt = this.alarmAt(state);

    // An old/retried delivery must not advance a newer phase before its deadline.
    if (alarmAt !== undefined && now < alarmAt) {
      await this.ctx.storage.setAlarm(alarmAt);

      return;
    }

    if (state.phase === "countdown") {
      await this.transition({
        ...state,
        phase: "racing",
        raceStartedAt: now,
        countdownEndsAt: undefined,
        raceEndsAt: state.mode === "rush" ? now + RUSH_DURATION_MS : undefined,
      });
      this.broadcast(this.phaseMessage());

      return;
    }

    if (state.phase === "racing" && state.mode === "rush" && state.raceEndsAt) {
      await this.finish();

      return;
    }

    if (state.phase === "finished") {
      const next = structuredClone(state);
      next.phase = "lobby";
      next.standings = undefined;
      next.raceStartedAt = undefined;
      next.raceEndsAt = undefined;
      next.rematchAt = undefined;

      for (const player of Object.values(next.players))
        Object.assign(player, {
          ready: false,
          deliveries: 0,
          orderIndex: 0,
          leg: "pickup",
          checkpointIndex: 0,
        });
      await this.transition(next);
      this.broadcast(this.phaseMessage());
      this.broadcast({ t: "roster", players: this.roster() });
    }
  }
}
