import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_DRIFT_CHARGE,
  addDriftCharge,
  rushRewardForCharge,
  rushTierForCharge,
  updateNearMissPass,
  type NearMissTracker,
} from "./arcadeRewards.ts";

test("drift charge requires speed and sideways momentum", () => {
  assert.equal(addDriftCharge(0, 8, 6, 1), 0);
  assert.equal(addDriftCharge(0, 0, 30, 1), 0);
  assert.ok(addDriftCharge(0, 7, 26, 1) > 90);
  assert.equal(addDriftCharge(205, 12, 40, 1), MAX_DRIFT_CHARGE);
});

test("delivery rush tiers reward longer controlled drifts", () => {
  assert.equal(rushTierForCharge(44.99), 0);
  assert.equal(rushTierForCharge(45), 1);
  assert.equal(rushTierForCharge(105), 2);
  assert.equal(rushTierForCharge(180), 3);
  assert.equal(rushRewardForCharge(180)?.label, "OVERNIGHT RUSH!");
  assert.ok(
    (rushRewardForCharge(180)?.duration ?? 0) >
      (rushRewardForCharge(45)?.duration ?? 0),
  );
});

function samplePass(distances: number[], speed: number) {
  let tracker: NearMissTracker | undefined;
  let awards = 0;
  for (const distance of distances) {
    const update = updateNearMissPass(tracker, distance, 0, speed);
    tracker = update.tracker;
    if (update.awarded) awards++;
  }
  return { tracker, awards };
}

test("a clean, fast traffic pass rewards once after clearing the car", () => {
  const result = samplePass([8, 5.4, 4.1, 3.35, 4.5, 6.8, 7.5, 9], 27);
  assert.equal(result.awards, 1);
  assert.ok(result.tracker);
  assert.equal(result.tracker.pass, undefined);
});

test("a collision and a slow pass never count as near misses", () => {
  assert.equal(samplePass([6, 5.2, 2.7, 5, 7.5], 30).awards, 0);
  assert.equal(samplePass([6, 5.2, 3.4, 5, 7.5], 12).awards, 0);
});

test("accelerating only after leaving the close zone does not retroactively score", () => {
  let tracker: NearMissTracker | undefined;
  let awards = 0;
  for (const [distance, speed] of [
    [5.2, 10],
    [3.4, 10],
    [6.5, 30],
    [7.5, 30],
  ] as const) {
    const update = updateNearMissPass(tracker, distance, 0, speed);
    tracker = update.tracker;
    if (update.awarded) awards++;
  }
  assert.equal(awards, 0);
});

test("a frame-spanning swept collision cannot become a near-miss reward", () => {
  let tracker: NearMissTracker | undefined;
  let contacted = false;
  let awards = 0;
  for (const relativeX of [5.4, -5.4, -8]) {
    const update = updateNearMissPass(tracker, relativeX, 0, 32);
    tracker = update.tracker;
    contacted ||= update.contacted;
    if (update.awarded) awards++;
  }
  assert.equal(contacted, true);
  assert.equal(awards, 0);
});

test("a route-wrap jump resets tracking instead of sweeping across the city", () => {
  const initial = updateNearMissPass(undefined, 120, 0, 30);
  const wrapped = updateNearMissPass(initial.tracker, -120, 0, 30);
  assert.equal(wrapped.contacted, false);
  assert.equal(wrapped.awarded, false);
  assert.equal(wrapped.tracker.previousX, -120);
});

test("hovering inside the danger zone cannot farm rewards", () => {
  const result = samplePass([5.4, 4.8, 5.1, 4.9, 5.2, 7.5, 8, 8], 28);
  assert.equal(result.awards, 1);
});
