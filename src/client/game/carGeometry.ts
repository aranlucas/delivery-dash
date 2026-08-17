/** Dimensions shared by gameplay placement and the Blender-authored vehicle assets. */
export type CarSpec = {
  length: number;
  width: number;
  sill: number;
  /** Stations: [position along body, width scale, bottom, top]. */
  profile: [number, number, number, number][];
  cabin: [number, number, number, number][];
  chamfer: number;
  wheelRadius: number;
  wheelWidth: number;
  axleInset: number;
  arch: number;
  hasLightBar: boolean;
  hasCheckers: boolean;
};

const SEDAN_PROFILE: [number, number, number, number][] = [
  [0, 0.78, 0.14, 0.62],
  [0.06, 0.92, 0.06, 0.72],
  [0.2, 1, 0.03, 0.76],
  [0.5, 1, 0.03, 0.78],
  [0.78, 1, 0.03, 0.72],
  [0.92, 0.93, 0.06, 0.58],
  [1, 0.8, 0.15, 0.48],
];
const SEDAN_CABIN: [number, number, number, number][] = [
  [0.2, 0.72, 0.76, 0.86],
  [0.3, 0.86, 0.76, 1.26],
  [0.44, 0.88, 0.78, 1.32],
  [0.58, 0.86, 0.78, 1.3],
  [0.7, 0.74, 0.76, 0.94],
];

export const TAXI_SPEC: CarSpec = {
  length: 5.2,
  width: 2.5,
  sill: -0.5,
  profile: SEDAN_PROFILE,
  cabin: SEDAN_CABIN,
  chamfer: 0.16,
  wheelRadius: 0.54,
  wheelWidth: 0.42,
  axleInset: 0.24,
  arch: 0.1,
  hasLightBar: false,
  hasCheckers: true,
};

export const SEDAN_SPEC: CarSpec = { ...TAXI_SPEC, hasCheckers: false };

export const VAN_SPEC: CarSpec = {
  ...TAXI_SPEC,
  length: 5.6,
  width: 2.6,
  hasCheckers: false,
  chamfer: 0.12,
  profile: [
    [0, 0.86, 0.1, 1.5],
    [0.08, 0.98, 0.04, 1.56],
    [0.3, 1, 0.02, 1.58],
    [0.62, 1, 0.02, 1.56],
    [0.84, 0.98, 0.04, 1.2],
    [0.94, 0.92, 0.08, 0.78],
    [1, 0.82, 0.16, 0.6],
  ],
  cabin: [
    [0.06, 0.82, 1.56, 1.64],
    [0.16, 0.94, 1.56, 1.72],
    [0.7, 0.94, 1.56, 1.72],
    [0.82, 0.82, 1.2, 1.62],
  ],
};

export const HATCH_SPEC: CarSpec = {
  ...TAXI_SPEC,
  length: 4.2,
  width: 2.35,
  hasCheckers: false,
  profile: [
    [0, 0.82, 0.12, 0.92],
    [0.08, 0.95, 0.05, 0.98],
    [0.26, 1, 0.03, 1],
    [0.6, 1, 0.03, 0.86],
    [0.86, 0.96, 0.05, 0.6],
    [1, 0.82, 0.14, 0.48],
  ],
  cabin: [
    [0.1, 0.76, 0.96, 1.06],
    [0.22, 0.88, 0.98, 1.34],
    [0.5, 0.88, 0.9, 1.34],
    [0.66, 0.76, 0.82, 1],
  ],
};

export const SPORTS_SPEC: CarSpec = {
  ...TAXI_SPEC,
  length: 5,
  width: 2.62,
  sill: -0.6,
  hasCheckers: false,
  chamfer: 0.2,
  wheelRadius: 0.56,
  arch: 0.14,
  profile: [
    [0, 0.84, 0.1, 0.5],
    [0.08, 0.96, 0.04, 0.58],
    [0.26, 1, 0.02, 0.6],
    [0.55, 1, 0.02, 0.58],
    [0.82, 0.98, 0.02, 0.46],
    [1, 0.82, 0.1, 0.34],
  ],
  cabin: [
    [0.24, 0.7, 0.58, 0.66],
    [0.36, 0.84, 0.58, 0.98],
    [0.5, 0.84, 0.58, 1],
    [0.72, 0.68, 0.5, 0.62],
  ],
};

export type CarKind = "taxi" | "sedan" | "van" | "hatch" | "sports";

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  taxi: TAXI_SPEC,
  sedan: SEDAN_SPEC,
  van: VAN_SPEC,
  hatch: HATCH_SPEC,
  sports: SPORTS_SPEC,
};

export const CAR_ORIGIN_HEIGHT = 0.8;

const bump = (position: number, center: number, spread: number) =>
  Math.max(0, 1 - ((position - center) / spread) ** 2);

export function bodyHalfWidth(spec: CarSpec, position: number) {
  let widthScale = spec.profile[spec.profile.length - 1]![1];
  for (let index = 0; index < spec.profile.length - 1; index++) {
    const [start, startWidth] = spec.profile[index]!;
    const [end, endWidth] = spec.profile[index + 1]!;
    if (position < start || position > end) continue;
    const progress = end === start ? 0 : (position - start) / (end - start);
    widthScale = startWidth + (endWidth - startWidth) * progress;
    break;
  }
  const flare =
    spec.arch *
    (bump(position, spec.axleInset, 0.15) + bump(position, 1 - spec.axleInset, 0.15));
  return (spec.width / 2) * widthScale + flare;
}

export function wheelPositions(spec: CarSpec): [number, number, number][] {
  const y = spec.wheelRadius - CAR_ORIGIN_HEIGHT;
  const frontPosition = 1 - spec.axleInset;
  const rearPosition = spec.axleInset;
  const front = -spec.length / 2 + frontPosition * spec.length;
  const rear = -spec.length / 2 + rearPosition * spec.length;
  const frontX = bodyHalfWidth(spec, frontPosition) - spec.wheelWidth * 0.3;
  const rearX = bodyHalfWidth(spec, rearPosition) - spec.wheelWidth * 0.3;
  return [
    [-frontX, y, front],
    [frontX, y, front],
    [-rearX, y, rear],
    [rearX, y, rear],
  ];
}
