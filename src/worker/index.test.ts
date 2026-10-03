import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { generateCity, generateOrders } from "../shared/city.ts";
import {
  CHECKPOINT_COUNT,
  RUSH_DURATION_MS,
  getObjective,
  type GameMode,
} from "../shared/game-modes.ts";
import {
  COUNTDOWN_MS,
  DELIVERIES_TO_WIN,
  FINISH_LINGER_MS,
  type ClientMessage,
  type ServerMessage,
} from "../shared/protocol.ts";

import {
  RaceRoomCore,
  type Attachment,
  type RoomState,
  type RoomTransaction,
} from "./room-core.ts";
import { decodeServerMessage } from "../shared/wire-schema.ts";

type Failure = "setAlarm" | "deleteAlarm" | "commit";

/** Transactional local storage mock; failed writes never escape the staged transaction. */
class Storage {
  data = new Map<string, RoomState>();
  alarmAt: number | null = null;
  failNext?: Failure;
  retryNext = false;

  fail(operation: Failure) {
    if (this.failNext === operation) {
      this.failNext = undefined;
      throw new Error(`injected ${operation} failure`);
    }
  }
  async get(key: "state"): Promise<RoomState | undefined> {
    return structuredClone(this.data.get(key));
  }
  async put(key: "state", value: RoomState) {
    this.data.set(key, structuredClone(value));
  }
  async setAlarm(at: number) {
    this.fail("setAlarm");
    this.alarmAt = at;
  }
  async deleteAlarm() {
    this.fail("deleteAlarm");
    this.alarmAt = null;
  }
  async deleteAll() {
    this.data.clear();
    this.alarmAt = null;
  }
  async transaction<T>(callback: (txn: RoomTransaction) => Promise<T>): Promise<T> {
    const staged = new Storage();
    staged.data = structuredClone(this.data);
    staged.alarmAt = this.alarmAt;
    staged.failNext = this.failNext;
    this.failNext = undefined;
    const result = await callback(staged);
    staged.fail("commit");

    if (this.retryNext) {
      this.retryNext = false;

      return this.transaction(callback);
    }

    this.data = staged.data;
    this.alarmAt = staged.alarmAt;

    return result;
  }
  room(): RoomState {
    const state = this.data.get("state");

    assert.ok(state);

    return structuredClone(state);
  }
}

class Socket {
  attachment: Attachment | null = null;
  messages: ServerMessage[] = [];
  onSend: (message: ServerMessage) => void = () => {};
  serializeAttachment(value: Attachment) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
  send(value: string) {
    const message = decodeServerMessage(value);
    this.messages.push(message);
    this.onSend(message);
  }
  close() {}
  webSocket() {
    return this;
  }
}

async function setup(t: TestContext, mode: GameMode = "rush") {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const storage = new Storage();
  const sockets = [new Socket(), new Socket()];

  const ctx = {
    storage,
    getWebSockets: () => sockets.map((socket) => socket.webSocket()),
    acceptWebSocket() {
      throw new Error("The handler tests do not accept new platform sockets");
    },
  };

  let room = new RaceRoomCore(ctx);

  const send = (index: number, message: ClientMessage) =>
    room.webSocketMessage(sockets[index]!.webSocket(), JSON.stringify(message));

  const clear = () => sockets.forEach((socket) => (socket.messages = []));

  const advance = (at: number) => {
    now = at;
  };

  const evict = () => {
    room = new RaceRoomCore(ctx);
  };

  const alarm = async () => {
    const scheduled = storage.alarmAt;

    // The runtime consumes a due alarm, but retries its delivery if the handler fails.
    if (scheduled !== null && now >= scheduled) storage.alarmAt = null;

    try {
      await room.alarm();
    } catch (error) {
      if (storage.alarmAt === null) storage.alarmAt = scheduled;
      throw error;
    }
  };

  await send(0, { t: "join", name: "First", mode });
  await send(1, { t: "join", name: "Second", mode });
  clear();

  return {
    storage,
    sockets,
    send,
    clear,
    advance,
    evict,
    alarm,
    async start() {
      await send(0, { t: "ready", ready: true });
      await send(1, { t: "ready", ready: true });
      advance(storage.room().countdownEndsAt!);
      await alarm();
      clear();
    },
    async score() {
      const state = storage.room();
      const attachment = sockets[0]!.attachment;

      assert.ok(attachment);

      const id = attachment.playerId;

      const target = getObjective(
        mode,
        generateCity(state.seed),
        generateOrders(state.seed),
        state.players[id]!,
      );

      assert.ok(target);
      await send(0, { t: "pos", x: target.stop[0], z: target.stop[1], y: 0.8, yaw: 0, speed: 0 });
    },
  };
}

function phases(socket: Socket) {
  return socket.messages.filter((message) => message.t === "phase").map((message) => message.phase);
}

for (const failure of ["setAlarm", "commit"] as const) {
  test(`countdown ${failure} failure preserves lobby and retries without a false phase`, async (t) => {
    const game = await setup(t);
    await game.send(0, { t: "ready", ready: true });
    game.storage.failNext = failure;
    await assert.rejects(game.send(1, { t: "ready", ready: true }), /injected/);
    assert.equal(game.storage.room().phase, "lobby");
    assert.equal(game.storage.alarmAt, null);

    for (const socket of game.sockets) assert.deepEqual(phases(socket), []);
    // Same live object must still accept readiness after the failed transition.
    await game.send(1, { t: "ready", ready: true });
    assert.equal(game.storage.room().phase, "countdown");
    assert.equal(game.storage.alarmAt, 1_000_000 + COUNTDOWN_MS);

    for (const socket of game.sockets) assert.deepEqual(phases(socket), ["countdown"]);
  });
}

test("clients see phase changes only after the state and alarm commit, including transaction retries", async (t) => {
  const game = await setup(t);
  const observations: { phase: string; storedPhase: string; alarm: number | null }[] = [];

  for (const socket of game.sockets)
    socket.onSend = (message) => {
      if (message.t === "phase")
        observations.push({
          phase: message.phase,
          storedPhase: game.storage.room().phase,
          alarm: game.storage.alarmAt,
        });
    };

  game.storage.retryNext = true;
  await game.send(0, { t: "ready", ready: true });
  await game.send(1, { t: "ready", ready: true });
  assert.deepEqual(
    observations,
    Array(2).fill({
      phase: "countdown",
      storedPhase: "countdown",
      alarm: 1_000_000 + COUNTDOWN_MS,
    }),
  );
});

test("countdown survives eviction and cannot start early or lose the Rush deadline on failure", async (t) => {
  const game = await setup(t);
  await game.send(0, { t: "ready", ready: true });
  await game.send(1, { t: "ready", ready: true });
  const startsAt = game.storage.room().countdownEndsAt!;
  game.evict();
  game.clear();
  await game.alarm();
  assert.equal(game.storage.room().phase, "countdown");
  assert.deepEqual(phases(game.sockets[0]!), []);
  game.advance(startsAt);
  game.storage.failNext = "setAlarm";
  await assert.rejects(game.alarm(), /injected/);
  assert.equal(game.storage.room().phase, "countdown");
  assert.equal(game.storage.alarmAt, startsAt);
  assert.deepEqual(phases(game.sockets[0]!), []);
  await game.alarm();
  assert.equal(game.storage.room().phase, "racing");
  assert.equal(game.storage.alarmAt, startsAt + RUSH_DURATION_MS);
  game.evict();
  await game.alarm();

  for (const socket of game.sockets) assert.deepEqual(phases(socket), ["racing"]);
});

for (const first of ["alarm", "pose"] as const) {
  test(`Rush deadline with ${first} delivered first finishes once, without a late score or early rematch`, async (t) => {
    const game = await setup(t);
    await game.start();
    const end = game.storage.room().raceEndsAt!;
    game.advance(end);
    const pose = () => game.score();

    // Durable Object input gates serialize storage-backed handlers; cover both event orders.
    if (first === "alarm") {
      await game.alarm();
      await pose();
    } else {
      await pose();
      await game.alarm();
    }

    assert.equal(game.storage.room().phase, "finished");
    assert.equal(game.storage.alarmAt, end + FINISH_LINGER_MS);

    for (const socket of game.sockets) {
      assert.deepEqual(phases(socket), ["finished"]);
      assert.equal(socket.messages.filter((message) => message.t === "win").length, 1);
      assert.equal(socket.messages.filter((message) => message.t === "progress").length, 0);
    }

    game.evict();
    await game.alarm();
    assert.equal(game.storage.room().phase, "finished");
    game.advance(end + FINISH_LINGER_MS);
    await game.alarm();
    await game.alarm();
    assert.equal(game.storage.room().phase, "lobby");
    assert.equal(game.storage.alarmAt, null);

    for (const player of Object.values(game.storage.room().players))
      assert.equal(player.ready, false);

    for (const socket of game.sockets) assert.deepEqual(phases(socket), ["finished", "lobby"]);
  });
}

test("failed finish scheduling leaves Rush racing and emits no winner until retry", async (t) => {
  const game = await setup(t);
  await game.start();
  const end = game.storage.room().raceEndsAt!;
  game.advance(end);
  game.storage.failNext = "setAlarm";
  await assert.rejects(game.alarm(), /injected/);
  assert.equal(game.storage.room().phase, "racing");
  assert.equal(game.storage.alarmAt, end);

  for (const socket of game.sockets) assert.deepEqual(socket.messages, []);
  await game.alarm();
  assert.equal(game.storage.room().phase, "finished");
  assert.equal(game.storage.alarmAt, end + FINISH_LINGER_MS);
});

for (const mode of ["delivery", "checkpoint"] as const) {
  test(`${mode} winning score rolls back with a failed finish alarm and can be retried`, async (t) => {
    const game = await setup(t, mode);
    await game.start();
    assert.equal(game.storage.alarmAt, null);
    const steps = mode === "delivery" ? DELIVERIES_TO_WIN * 2 : CHECKPOINT_COUNT;

    for (let index = 0; index < steps - 1; index++) await game.score();
    const before = game.storage.room();
    game.clear();
    game.storage.failNext = "setAlarm";
    await assert.rejects(game.score(), /injected/);
    assert.deepEqual(game.storage.room(), before);

    for (const socket of game.sockets)
      assert.equal(socket.messages.filter((message) => message.t !== "pos").length, 0);
    await game.score();
    assert.equal(game.storage.room().phase, "finished");
    assert.equal(
      game.storage.room().standings![0]![mode === "delivery" ? "deliveries" : "checkpointIndex"],
      mode === "delivery" ? DELIVERIES_TO_WIN : CHECKPOINT_COUNT,
    );
    assert.deepEqual(
      game.sockets[0]!.messages.map((message) => message.t),
      ["progress", "phase", "win"],
    );
  });
}

test("failed rematch alarm deletion preserves finished scores and retries after eviction", async (t) => {
  const game = await setup(t);
  await game.start();
  await game.score();
  game.advance(game.storage.room().raceEndsAt!);
  await game.alarm();
  const finished = game.storage.room();
  game.advance(finished.rematchAt!);
  game.clear();
  game.storage.failNext = "deleteAlarm";
  await assert.rejects(game.alarm(), /injected/);
  assert.deepEqual(game.storage.room(), finished);

  for (const socket of game.sockets) assert.deepEqual(socket.messages, []);
  game.evict();
  await game.alarm();
  assert.equal(game.storage.room().phase, "lobby");
  assert.equal(game.storage.alarmAt, null);

  for (const player of Object.values(game.storage.room().players)) {
    assert.equal(player.ready, false);
    assert.equal(player.deliveries, 0);
    assert.equal(player.leg, "pickup");
  }
});

test("legacy finished rooms without a stored rematch deadline still return to the lobby", async (t) => {
  const game = await setup(t);
  await game.start();
  game.advance(game.storage.room().raceEndsAt!);
  await game.alarm();
  const legacy = game.storage.room();
  delete legacy.rematchAt;
  await game.storage.put("state", legacy);
  game.evict();
  await game.alarm();
  assert.equal(game.storage.room().phase, "lobby");
});

test("Free Drive stays untimed and permits late joins after repeated alarms", async (t) => {
  const game = await setup(t, "free");
  await game.start();
  assert.equal(game.storage.alarmAt, null);
  await game.alarm();
  game.sockets.push(new Socket());
  await game.send(2, { t: "join", name: "Late" });
  assert.equal(game.storage.room().phase, "racing");
  assert.equal(Object.keys(game.storage.room().players).length, 3);
  assert.deepEqual(phases(game.sockets[0]!), []);
});

test("replacing a ghost room commits its lobby reset with alarm cancellation", async (t) => {
  const game = await setup(t);
  await game.start();
  const racing = game.storage.room();
  game.sockets.splice(0, game.sockets.length, new Socket());
  game.storage.failNext = "deleteAlarm";
  await assert.rejects(game.send(0, { t: "join", name: "New driver" }), /injected/);
  assert.deepEqual(game.storage.room(), racing);
  assert.equal(game.storage.alarmAt, racing.raceEndsAt);
  assert.deepEqual(game.sockets[0]!.messages, []);
  await game.send(0, { t: "join", name: "New driver" });
  assert.equal(game.storage.room().phase, "lobby");
  assert.equal(game.storage.alarmAt, null);
  assert.equal(Object.keys(game.storage.room().players).length, 1);
});
