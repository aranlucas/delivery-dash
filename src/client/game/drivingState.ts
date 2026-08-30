export type CarPose = { x: number; y: number; z: number; yaw: number; speed: number };

export const ownPose: CarPose = { x: 0, y: 0.8, z: 0, yaw: 0, speed: 0 };

/** Actual camera view azimuth, published by ChaseCamera for screen-space guidance. */
export const cameraPose = { yaw: 0 };

/** Signed forward speed from the own-car simulation, shared with wheel animation. */
export const wheelDrive = { speed: 0 };

export type DrivingTelemetry = {
  boost: number;
  drifting: boolean;
  driftScore: number;
  /** Skill charge earned by holding a real drift, capped by arcadeRewards. */
  driftCharge: number;
  driftTier: 0 | 1 | 2 | 3;
  /** Active drift-release burst tier; 0 when no delivery rush is running. */
  rushTier: 0 | 1 | 2 | 3;
  callout: string;
  /** Score shown beside the active callout, separate from the running combo total. */
  calloutScore: number;
  combo: number;
  /** Monotonic counter used by audio without coupling it to the renderer. */
  rewardSequence: number;
  rewardTier: 0 | 1 | 2 | 3;
  impactPulse: number;
  steer: number;
  throttle: number;
  boosting: boolean;
  airborne: boolean;
  /** Seconds since the wheels left the ground; 0 while grounded. */
  airTime: number;
};

// Stable and mutable by design: frame-loop consumers can read telemetry
// without forcing React to render at the simulation frame rate.
export const drivingTelemetry: DrivingTelemetry = {
  boost: 100,
  drifting: false,
  driftScore: 0,
  driftCharge: 0,
  driftTier: 0,
  rushTier: 0,
  callout: "",
  calloutScore: 0,
  combo: 0,
  rewardSequence: 0,
  rewardTier: 0,
  impactPulse: 0,
  steer: 0,
  throttle: 0,
  boosting: false,
  airborne: false,
  airTime: 0,
};
