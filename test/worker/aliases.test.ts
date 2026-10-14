import assert from "node:assert/strict";
import { test } from "vitest";
import { RUSH_DURATION_MS } from "@/shared/game-modes.ts";
import { Socket } from "@test/worker/helpers/socket.ts";

test("source and helper aliases resolve at runtime", () => {
  assert.equal(RUSH_DURATION_MS, 180_000);
  assert.equal(new Socket().messages.length, 0);
});
