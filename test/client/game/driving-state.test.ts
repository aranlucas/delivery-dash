import assert from "node:assert/strict";
import { test } from "vitest";
import { drivingTelemetry, resetTelemetry } from "@/client/game/driving-state.ts";

test("recovery clears active driving effects without replaying audio or camera events", () => {
  const saved = { ...drivingTelemetry };

  try {
    Object.assign(drivingTelemetry, {
      boost: 12,
      drifting: true,
      driftCharge: 100,
      rushTier: 2,
      callout: "NICE DRIFT!",
      combo: 50,
      airborne: true,
      airTime: 2,
      boostPadIndex: 3,
      recoverySeconds: 1,
      rewardSequence: 7,
      recoverySequence: 9,
    });
    const reference = drivingTelemetry;
    resetTelemetry();
    assert.equal(drivingTelemetry, reference);
    assert.equal(drivingTelemetry.boost, 100);
    assert.equal(drivingTelemetry.drifting, false);
    assert.equal(drivingTelemetry.driftCharge, 0);
    assert.equal(drivingTelemetry.rushTier, 0);
    assert.equal(drivingTelemetry.callout, "");
    assert.equal(drivingTelemetry.combo, 0);
    assert.equal(drivingTelemetry.airborne, false);
    assert.equal(drivingTelemetry.airTime, 0);
    assert.equal(drivingTelemetry.boostPadIndex, -1);
    assert.equal(drivingTelemetry.recoverySeconds, 0);
    assert.equal(drivingTelemetry.rewardSequence, 7);
    assert.equal(drivingTelemetry.recoverySequence, 9);
  } finally {
    Object.assign(drivingTelemetry, saved);
  }
});
