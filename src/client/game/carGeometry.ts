/** Wheel layout shared by gameplay placement. Body loft lives in the Blender asset script. */
export type CarSpec = {
  length: number;
  width: number;
  /** Stations: [position along body, width scale]. */
  profile: [number, number][];
  wheelRadius: number;
  wheelWidth: number;
  axleInset: number;
  arch: number;
};

const SEDAN_PROFILE: [number, number][] = [
  [0, 0.78],
  [0.06, 0.92],
  [0.2, 1],
  [0.5, 1],
  [0.78, 1],
  [0.92, 0.93],
  [1, 0.8],
];

export const TAXI_SPEC: CarSpec = {
  length: 5.2,
  width: 2.5,
  profile: SEDAN_PROFILE,
  wheelRadius: 0.54,
  wheelWidth: 0.42,
  axleInset: 0.24,
  arch: 0.1,
};

export const SEDAN_SPEC: CarSpec = TAXI_SPEC;

export const VAN_SPEC: CarSpec = {
  ...TAXI_SPEC,
  length: 5.6,
  width: 2.6,
  profile: [
    [0, 0.86],
    [0.08, 0.98],
    [0.3, 1],
    [0.62, 1],
    [0.84, 0.98],
    [0.94, 0.92],
    [1, 0.82],
  ],
};

export const HATCH_SPEC: CarSpec = {
  ...TAXI_SPEC,
  length: 4.2,
  width: 2.35,
  profile: [
    [0, 0.82],
    [0.08, 0.95],
    [0.26, 1],
    [0.6, 1],
    [0.86, 0.96],
    [1, 0.82],
  ],
};

export const SPORTS_SPEC: CarSpec = {
  ...TAXI_SPEC,
  length: 5,
  width: 2.62,
  wheelRadius: 0.56,
  arch: 0.14,
  profile: [
    [0, 0.84],
    [0.08, 0.96],
    [0.26, 1],
    [0.55, 1],
    [0.82, 0.98],
    [1, 0.82],
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
    (bump(position, spec.axleInset, 0.15) +
      bump(position, 1 - spec.axleInset, 0.15));
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
