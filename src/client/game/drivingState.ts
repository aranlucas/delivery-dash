export type CarPose = { x: number; y: number; z: number; yaw: number; speed: number };

export const ownPose: CarPose = { x: 0, y: 0.8, z: 0, yaw: 0, speed: 0 };

export type DrivingTelemetry = {
  boost: number;
  drifting: boolean;
  driftScore: number;
  callout: string;
  combo: number;
  impactPulse: number;
  steer: number;
  throttle: number;
  boosting: boolean;
};

// Stable and mutable by design: frame-loop consumers can read telemetry
// without forcing React to render at the simulation frame rate.
export const drivingTelemetry: DrivingTelemetry = {
  boost: 100,
  drifting: false,
  driftScore: 0,
  callout: "",
  combo: 0,
  impactPulse: 0,
  steer: 0,
  throttle: 0,
  boosting: false,
};
