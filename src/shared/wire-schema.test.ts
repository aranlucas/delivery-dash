import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachmentSchema,
  clientEnvelopeSchema,
  decodeServerMessage,
  positionSchema,
} from "./wire-schema.ts";
import type { ServerMessage } from "./protocol.ts";

test("server message decoding retains the valid protocol and omitted deadlines", () => {
  const message: ServerMessage = {
    t: "welcome",
    id: "player-one",
    seed: 42,
    mode: "free",
    phase: "lobby",
    players: [],
  };

  assert.deepEqual(decodeServerMessage(JSON.stringify(message)), message);
  assert.equal(Object.hasOwn(decodeServerMessage(JSON.stringify(message)), "raceEndsAt"), false);
});

test("server decoding rejects malformed nested payloads without coercion", () => {
  for (const message of [
    { t: "roster", players: [{}] },
    { t: "pos", id: "player-one", x: "1", y: 0, z: 0, yaw: 0, speed: 0 },
    { t: "phase", mode: "invalid", phase: "lobby" },
  ]) {
    assert.throws(() => decodeServerMessage(JSON.stringify(message)));
  }
});

test("client envelopes retain staged validation and position checks reject nonfinite values", () => {
  assert.deepEqual(clientEnvelopeSchema.parse({ t: "ready", ready: "truthy" }), {
    t: "ready",
    ready: "truthy",
  });
  assert.equal(clientEnvelopeSchema.safeParse([]).success, false);
  assert.equal(
    positionSchema.safeParse({ t: "pos", x: Infinity, y: 0, z: 0, yaw: 0, speed: 0 }).success,
    false,
  );
  assert.equal(attachmentSchema.safeParse({ playerId: 1 }).success, false);
  assert.deepEqual(attachmentSchema.parse({ playerId: "player-one" }), { playerId: "player-one" });
});
