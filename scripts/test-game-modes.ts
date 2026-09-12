/**
 * Live mode contract test. Run the Vite worker first, then:
 *
 *   node --experimental-strip-types scripts/test-game-modes.ts
 *
 * TEST_GAME_URL points at the Vite origin (it defaults to http://localhost:5173).
 * TEST_GAME_RUSH_TIMER=1 additionally waits for the real 180 second rush deadline.
 * TEST_GAME_RECONNECT=1 runs the optional reconnect/next-round checks.
 */
import { strict as assert } from "node:assert";
import {
  generateCity,
  generateOrders,
  type City,
  type Order,
  type Place,
} from "../src/shared/city.ts";
import {
  CHECKPOINT_COUNT,
  RUSH_DURATION_MS,
  getCheckpoints,
  type GameMode,
} from "../src/shared/gameModes.ts";

type WireMessage = Record<string, unknown> & { t: string };
type WireMode = GameMode | string;

const origin = process.env.TEST_GAME_URL ?? "http://localhost:5173";
const timeoutScale = Number(process.env.TEST_GAME_TIMEOUT_SCALE ?? "1");
const timeout = (milliseconds: number) => Math.max(100, milliseconds * timeoutScale);
const roomCounter = { value: 0 };

function websocketUrl(room: string): string {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/api/room/${room}/ws`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function roomCode(label: string): string {
  roomCounter.value++;
  const suffix = [roomCounter.value - 1].map(
    (value) =>
      String.fromCharCode(65 + (Math.floor(value / 26) % 26)) +
      String.fromCharCode(65 + (value % 26)),
  )[0]!;
  return `${label.slice(0, 2).toUpperCase()}${suffix}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class Client {
  readonly socket: WebSocket;
  private readonly inbox: WireMessage[] = [];
  private readonly waiters = new Set<{
    predicate: (message: WireMessage) => boolean;
    resolve: (message: WireMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private failure?: Error;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.fail(new Error(`invalid JSON from worker: ${raw}`));
        return;
      }
      if (!isObject(parsed) || typeof parsed.t !== "string") {
        this.fail(new Error(`invalid message from worker: ${raw}`));
        return;
      }
      const message = parsed as WireMessage;
      const waiter = [...this.waiters].find(({ predicate }) => predicate(message));
      if (waiter) {
        this.waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else this.inbox.push(message);
    });
    socket.addEventListener("error", () => this.fail(new Error("WebSocket error")));
    socket.addEventListener("close", () => this.fail(new Error("WebSocket closed")));
  }

  static async open(room: string): Promise<Client> {
    const socket = new WebSocket(websocketUrl(room));
    const client = new Client(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`WebSocket open timed out for ${room}`)),
        timeout(8_000),
      );
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error(`WebSocket failed to open for ${room}`));
        },
        { once: true },
      );
    });
    return client;
  }

  private fail(error: Error) {
    this.failure ??= error;
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(this.failure);
    }
    this.waiters.clear();
  }

  send(message: Record<string, unknown>) {
    assert.equal(this.socket.readyState, WebSocket.OPEN, "cannot send on a closed WebSocket");
    this.socket.send(JSON.stringify(message));
  }

  async waitFor(
    predicate: (message: WireMessage) => boolean,
    description: string,
    milliseconds = 10_000,
  ): Promise<WireMessage> {
    if (this.failure) throw this.failure;
    const queuedIndex = this.inbox.findIndex(predicate);
    if (queuedIndex >= 0) return this.inbox.splice(queuedIndex, 1)[0]!;
    return new Promise<WireMessage>((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`timed out waiting for ${description}`));
        }, timeout(milliseconds)),
      };
      this.waiters.add(waiter);
    });
  }

  async waitForNo(
    predicate: (message: WireMessage) => boolean,
    description: string,
    milliseconds: number,
  ) {
    if (this.failure) throw this.failure;
    if (this.inbox.some(predicate)) throw new Error(`unexpected ${description}`);
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        predicate,
        resolve: () => {
          this.waiters.delete(waiter);
          reject(new Error(`unexpected ${description}`));
        },
        reject: () => undefined,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          resolve();
        }, timeout(milliseconds)),
      };
      this.waiters.add(waiter);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeout(1_000));
      this.socket.addEventListener(
        "close",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      this.socket.close();
    });
  }
}

function hasType(message: WireMessage, t: string): boolean {
  return message.t === t;
}

function numberField(message: WireMessage, key: string): number {
  const value = message[key];
  assert.equal(typeof value, "number", `${key} should be a number in ${message.t}`);
  assert.ok(Number.isFinite(value), `${key} should be finite in ${message.t}`);
  return value;
}

function stringField(message: WireMessage, key: string): string {
  const value = message[key];
  assert.equal(typeof value, "string", `${key} should be a string in ${message.t}`);
  return value;
}

function messageMode(message: WireMessage): WireMode {
  return stringField(message, "mode");
}

async function join(client: Client, name: string, mode?: WireMode): Promise<WireMessage> {
  client.send({ t: "join", name, ...(mode === undefined ? {} : { mode }) });
  return client.waitFor(
    (message) => hasType(message, "welcome") || hasType(message, "error"),
    "join response",
  );
}

function assertWelcome(message: WireMessage, mode: WireMode): { seed: number; id: string } {
  assert.equal(message.t, "welcome");
  assert.equal(messageMode(message), mode, "room adopts the creator's requested mode");
  const seed = numberField(message, "seed");
  const id = stringField(message, "id");
  assert.ok(Array.isArray(message.players), "welcome includes the player roster");
  return { seed, id };
}

async function readyAndRace(clients: Client[]): Promise<WireMessage> {
  for (const client of clients) client.send({ t: "ready", ready: true });
  const countdownObservedAt = Date.now();
  const countdown = await clients[0]!.waitFor(
    (message) => hasType(message, "phase") && message.phase === "countdown",
    "countdown phase",
  );
  const countdownEndsAt = numberField(countdown, "countdownEndsAt");
  assert.ok(countdownEndsAt > Date.now(), "countdown deadline is in the future");
  const race = await clients[0]!.waitFor(
    (message) => hasType(message, "phase") && message.phase === "racing",
    "racing phase",
    8_000,
  );
  const raceStartedAt = numberField(race, "raceStartedAt");
  assert.ok(raceStartedAt >= countdownEndsAt - 800, "race starts at the countdown deadline");
  assert.ok(raceStartedAt - countdownObservedAt >= 2_000, "countdown does not end early");
  assert.ok(
    raceStartedAt - countdownObservedAt <= 5_000,
    `countdown is approximately three seconds (countdownEndsAt=${countdownEndsAt}, raceStartedAt=${raceStartedAt})`,
  );
  return race;
}

function position(client: Client, place: Place) {
  // A car's origin is 0.8m above the ground plane in the game client.
  client.send({ t: "pos", x: place.stop[0], y: 0.8, z: place.stop[1], yaw: 0, speed: 0 });
}

async function progressFor(
  client: Client,
  id: string,
  deliveries: number,
  checkpointIndex: number,
  milliseconds = 10_000,
) {
  const progress = await client.waitFor(
    (message) =>
      hasType(message, "progress") &&
      message.id === id &&
      message.deliveries === deliveries &&
      message.checkpointIndex === checkpointIndex,
    `progress deliveries=${deliveries} checkpointIndex=${checkpointIndex}`,
    milliseconds,
  );
  assert.equal(progress.id, id);
  return progress;
}

async function completeDelivery(
  client: Client,
  id: string,
  city: City,
  orders: Order[],
  orderIndex: number,
  expectWin = false,
) {
  const order = orders[orderIndex % orders.length]!;
  position(client, city.restaurants[order.restaurantId]!);
  await progressFor(client, id, orderIndex, 0);
  position(client, city.houses[order.houseId]!);
  if (expectWin) {
    await progressFor(client, id, orderIndex + 1, 0);
    await client.waitFor((message) => hasType(message, "win"), "delivery win");
  } else await progressFor(client, id, orderIndex + 1, 0);
}

async function testCreatorModeAndRush(): Promise<void> {
  const room = roomCode("RU");
  const creator = await Client.open(room);
  let joiner: Client | undefined;
  try {
    joiner = await Client.open(room);
    const creatorWelcome = await join(creator, "Rush creator", "rush");
    const creatorInfo = assertWelcome(creatorWelcome, "rush");
    const joinerWelcome = await join(joiner, "Free chooser", "free");
    assertWelcome(joinerWelcome, "rush");
    const players = joinerWelcome.players;
    assert.ok(Array.isArray(players));
    assert.equal(players.length, 2, "joining a second player creates exactly one roster entry");
    assert.equal(
      new Set((players as Array<{ id: string }>).map((player) => player.id)).size,
      2,
      "roster ids are unique",
    );

    // A duplicate join on an already attached socket must not create a ghost player.
    const duplicate = await join(creator, "Rush creator", "free");
    assertWelcome(duplicate, "rush");
    const rosterAfterDuplicate = Array.isArray(duplicate.players) ? duplicate.players : [];
    assert.equal(rosterAfterDuplicate.length, 2, "duplicate join does not create a ghost");

    const race = await readyAndRace([creator, joiner]);
    const raceEndsAt = numberField(race, "raceEndsAt");
    assert.ok(
      Math.abs(raceEndsAt - (numberField(race, "raceStartedAt") + RUSH_DURATION_MS)) < 2_000,
      "rush deadline is 180 seconds",
    );
    const city = generateCity(creatorInfo.seed);
    const orders = generateOrders(creatorInfo.seed);
    for (let index = 0; index < 7; index++)
      await completeDelivery(creator, creatorInfo.id, city, orders, index);
    assert.equal(
      creator.socket.readyState,
      WebSocket.OPEN,
      "rush remains connected after more than three deliveries",
    );
    assert.ok(
      Date.now() < raceEndsAt,
      "rush remains before its deadline after seven fast deliveries",
    );

    if (process.env.TEST_GAME_RUSH_TIMER === "1") {
      const finished = await creator.waitFor(
        (message) => hasType(message, "phase") && message.phase === "finished",
        "rush deadline finish",
        185_000,
      );
      assert.equal(finished.phase, "finished");
      assert.ok(Array.isArray(finished.standings), "rush deadline publishes standings");
    }
  } finally {
    await Promise.all([creator.close(), joiner?.close()]);
  }
}

async function testDeliveryRace(): Promise<void> {
  const creator = await Client.open(roomCode("DE"));
  try {
    const welcome = await join(creator, "Delivery creator", "delivery");
    const { seed, id } = assertWelcome(welcome, "delivery");
    await readyAndRace([creator]);
    const city = generateCity(seed);
    const orders = generateOrders(seed);
    for (let index = 0; index < 3; index++)
      await completeDelivery(creator, id, city, orders, index, index === 2);
    const finished = await creator.waitFor(
      (message) => hasType(message, "phase") && message.phase === "finished",
      "delivery finished phase",
    );
    assert.equal(finished.phase, "finished");
    const lobby = await creator.waitFor(
      (message) => hasType(message, "phase") && message.phase === "lobby",
      "next-round lobby reset",
      15_000,
    );
    assert.equal(lobby.phase, "lobby");
    const roster = await creator.waitFor(
      (message) =>
        hasType(message, "roster") &&
        Array.isArray(message.players) &&
        (message.players as Array<Record<string, unknown>>).some(
          (player) =>
            player.id === id &&
            player.ready === false &&
            player.deliveries === 0 &&
            player.orderIndex === 0 &&
            player.checkpointIndex === 0,
        ),
      "next-round reset roster",
    );
    const resetPlayer = (roster.players as Array<Record<string, unknown>>).find(
      (player) => player.id === id,
    );
    assert.ok(resetPlayer, "finished player remains for the next round");
    assert.equal(resetPlayer.ready, false, "next round clears readiness");
    assert.equal(resetPlayer.deliveries, 0, "next round clears delivery score");
    assert.equal(resetPlayer.orderIndex, 0, "next round clears order progress");
    assert.equal(resetPlayer.checkpointIndex, 0, "next round clears checkpoint progress");
  } finally {
    await creator.close();
  }
}

async function testCheckpointRace(): Promise<void> {
  const creator = await Client.open(roomCode("CP"));
  try {
    const welcome = await join(creator, "Checkpoint creator", "checkpoint");
    const { seed, id } = assertWelcome(welcome, "checkpoint");
    await readyAndRace([creator]);
    const checkpoints = getCheckpoints(generateCity(seed));
    assert.equal(checkpoints.length, CHECKPOINT_COUNT, "shared checkpoint route has eight targets");
    for (let index = 0; index < CHECKPOINT_COUNT; index++) {
      position(creator, checkpoints[index]!);
      const progress = await progressFor(creator, id, 0, index + 1);
      assert.equal(progress.orderIndex, 0, "checkpoint mode does not advance delivery orders");
      assert.equal(progress.deliveries, 0, "checkpoint mode does not award delivery score");
    }
    await creator.waitFor((message) => hasType(message, "win"), "checkpoint win");
  } finally {
    await creator.close();
  }
}

async function testFreeDrive(): Promise<void> {
  const room = roomCode("FR");
  const creator = await Client.open(room);
  let lateJoiner: Client | undefined;
  try {
    const welcome = await join(creator, "Free driver", "free");
    const { seed, id } = assertWelcome(welcome, "free");
    assert.equal(welcome.raceEndsAt, undefined, "free drive has no deadline");
    await readyAndRace([creator]);
    lateJoiner = await Client.open(room);
    // Free Drive permits exploration joins after the shared countdown; competitive rounds do not.
    const lateWelcome = await join(lateJoiner, "Late free driver", "free");
    assertWelcome(lateWelcome, "free");
    assert.equal(
      lateWelcome.phase,
      "racing",
      "late free-drive join starts directly in racing phase",
    );
    assert.equal((lateWelcome.players as unknown[]).length, 2, "late free-drive join appears once");
    const city = generateCity(seed);
    const orders = generateOrders(seed);
    for (let index = 0; index < 3; index++)
      await completeFreeDriveRoute(creator, city, orders[index % orders.length]!);
    await creator.waitForNo(
      (message) =>
        hasType(message, "progress") ||
        (hasType(message, "phase") && message.phase === "finished") ||
        hasType(message, "win"),
      "free-drive progress or finish",
      300,
    );
    assert.equal(id.length > 0, true);
    assert.equal(creator.socket.readyState, WebSocket.OPEN, "free drive remains connected");
  } finally {
    await creator.close();
    await lateJoiner?.close();
  }
}

async function completeFreeDriveRoute(client: Client, city: City, order: Order) {
  position(client, city.restaurants[order.restaurantId]!);
  position(client, city.houses[order.houseId]!);
}

async function testInvalidMode(): Promise<void> {
  const client = await Client.open(roomCode("IV"));
  try {
    const result = await join(client, "Invalid mode", "not-a-mode");
    assert.equal(result.t, "error", "invalid mode is rejected");
    assert.match(stringField(result, "message"), /mode/i, "invalid mode error explains the field");
  } finally {
    await client.close();
  }
}

async function testReconnectAndNextRound(): Promise<void> {
  if (process.env.TEST_GAME_RECONNECT !== "1") return;
  const room = roomCode("RC");
  const client = await Client.open(room);
  try {
    const welcome = await join(client, "Reconnect driver", "free");
    assertWelcome(welcome, "free");
    await client.close();
    const reconnected = await Client.open(room);
    try {
      const rejoinWelcome = await join(reconnected, "Reconnect driver", "free");
      assertWelcome(rejoinWelcome, "free");
      assert.equal(
        (rejoinWelcome.players as unknown[]).length,
        1,
        "reconnect prunes the disconnected player before rejoining",
      );
    } finally {
      await reconnected.close();
    }
  } finally {
    await client.close();
  }
}

async function main() {
  const tests: Array<[string, () => Promise<void>]> = [
    ["creator mode adoption, duplicate join, rush routes", testCreatorModeAndRush],
    ["delivery first-to-three race", testDeliveryRace],
    ["checkpoint sequence", testCheckpointRace],
    ["free drive", testFreeDrive],
    ["invalid mode rejection", testInvalidMode],
    ["reconnect and next-round reset", testReconnectAndNextRound],
  ];
  for (const [name, test] of tests) {
    const started = Date.now();
    await test();
    console.log(`ok - ${name} (${Date.now() - started}ms)`);
  }
  console.log(`game modes integration passed (${origin})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
