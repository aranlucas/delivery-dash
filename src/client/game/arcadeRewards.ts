export const MAX_DRIFT_CHARGE = 210;

export type RushTier = 0 | 1 | 2 | 3;

export type RushReward = {
  tier: Exclude<RushTier, 0>;
  threshold: number;
  duration: number;
  impulse: number;
  maxSpeed: number;
  score: number;
  label: string;
};

const RUSH_REWARDS: readonly RushReward[] = [
  {
    tier: 1,
    threshold: 45,
    duration: 0.55,
    impulse: 5,
    maxSpeed: 44,
    score: 80,
    label: "LOCAL RUSH!",
  },
  {
    tier: 2,
    threshold: 105,
    duration: 0.9,
    impulse: 8,
    maxSpeed: 50,
    score: 160,
    label: "EXPRESS RUSH!",
  },
  {
    tier: 3,
    threshold: 180,
    duration: 1.25,
    impulse: 12,
    maxSpeed: 58,
    score: 280,
    label: "OVERNIGHT RUSH!",
  },
];

/**
 * Charge a delivery rush from genuine sideways momentum. Holding the handbrake
 * while crawling or driving straight cannot farm a burst.
 */
export function addDriftCharge(
  current: number,
  lateralSpeed: number,
  totalSpeed: number,
  deltaSeconds: number,
) {
  const driftEnergy =
    Math.abs(lateralSpeed) * Math.max(0, totalSpeed - 7) * deltaSeconds * 0.72;
  return Math.min(MAX_DRIFT_CHARGE, Math.max(0, current) + driftEnergy);
}

export function rushRewardForCharge(charge: number): RushReward | undefined {
  for (let index = RUSH_REWARDS.length - 1; index >= 0; index--) {
    const reward = RUSH_REWARDS[index]!;
    if (charge >= reward.threshold) return reward;
  }
  return undefined;
}

export function rushTierForCharge(charge: number): RushTier {
  return rushRewardForCharge(charge)?.tier ?? 0;
}

export const TRAFFIC_CONTACT_RADIUS = 2.9;
export const NEAR_MISS_ENTRY_RADIUS = 5.6;
export const NEAR_MISS_EXIT_RADIUS = 7.4;
export const NEAR_MISS_MIN_SPEED = 20;
/** Ignore route wrapping or background-tab jumps instead of sweeping across the whole city. */
export const MAX_TRAFFIC_SWEEP = 12;

type NearMissPass = {
  closest: number;
  fastEnough: boolean;
  hit: boolean;
};

export type NearMissTracker = {
  previousX: number;
  previousZ: number;
  previousSpeed: number;
  pass?: NearMissPass;
};

export type NearMissUpdate = {
  tracker: NearMissTracker;
  awarded: boolean;
  contacted: boolean;
};

function closestSegmentPointToOrigin(
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return { distance: Math.hypot(ax, az), progress: 0 };
  const t = Math.max(0, Math.min(1, -(ax * dx + az * dz) / lengthSquared));
  return { distance: Math.hypot(ax + dx * t, az + dz * t), progress: t };
}

/**
 * Track one complete pass by a traffic car. The reward is emitted only after
 * the player exits the danger zone and only if the closest point stayed clear
 * of contact. Sweeping the relative motion segment prevents a low frame rate
 * from skipping over a collision and turning it into a false near miss.
 */
export function updateNearMissPass(
  tracker: NearMissTracker | undefined,
  relativeX: number,
  relativeZ: number,
  speed: number,
): NearMissUpdate {
  const distance = Math.hypot(relativeX, relativeZ);
  const nextPosition = {
    previousX: relativeX,
    previousZ: relativeZ,
    previousSpeed: speed,
  };
  if (!Number.isFinite(distance)) {
    return {
      tracker: tracker ?? nextPosition,
      awarded: false,
      contacted: false,
    };
  }

  if (!tracker) {
    const contacted = distance <= TRAFFIC_CONTACT_RADIUS;
    return {
      tracker: {
        ...nextPosition,
        ...(distance <= NEAR_MISS_ENTRY_RADIUS
          ? {
              pass: {
                closest: distance,
                fastEnough: speed >= NEAR_MISS_MIN_SPEED,
                hit: contacted,
              },
            }
          : {}),
      },
      awarded: false,
      contacted,
    };
  }

  const step = Math.hypot(
    relativeX - tracker.previousX,
    relativeZ - tracker.previousZ,
  );
  if (step > MAX_TRAFFIC_SWEEP) {
    const contacted = distance <= TRAFFIC_CONTACT_RADIUS;
    return {
      tracker: {
        ...nextPosition,
        ...(distance <= NEAR_MISS_ENTRY_RADIUS
          ? {
              pass: {
                closest: distance,
                fastEnough: speed >= NEAR_MISS_MIN_SPEED,
                hit: contacted,
              },
            }
          : {}),
      },
      awarded: false,
      contacted,
    };
  }

  const sweep = closestSegmentPointToOrigin(
    tracker.previousX,
    tracker.previousZ,
    relativeX,
    relativeZ,
  );
  const contacted = sweep.distance <= TRAFFIC_CONTACT_RADIUS;
  const closest = Math.min(
    tracker.pass?.closest ?? Infinity,
    sweep.distance,
    distance,
  );
  const speedAtClosest =
    tracker.previousSpeed + (speed - tracker.previousSpeed) * sweep.progress;
  const pass =
    tracker.pass || sweep.distance <= NEAR_MISS_ENTRY_RADIUS
      ? {
          closest,
          fastEnough:
            (tracker.pass?.fastEnough ?? false) ||
            (sweep.distance <= NEAR_MISS_ENTRY_RADIUS &&
              speedAtClosest >= NEAR_MISS_MIN_SPEED),
          hit: (tracker.pass?.hit ?? false) || contacted,
        }
      : undefined;

  if (!pass || distance <= NEAR_MISS_EXIT_RADIUS) {
    return {
      tracker: { ...nextPosition, ...(pass ? { pass } : {}) },
      awarded: false,
      contacted,
    };
  }

  return {
    tracker: nextPosition,
    awarded:
      pass.fastEnough && !pass.hit && pass.closest <= NEAR_MISS_ENTRY_RADIUS,
    contacted,
  };
}
