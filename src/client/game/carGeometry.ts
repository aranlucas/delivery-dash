import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const fleetBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
};

const fleetWheel = (x: number, z: number) => {
  const geometry = new THREE.CylinderGeometry(0.54, 0.54, 0.42, 8, 1);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(x, 0.54, z);
  return geometry;
};

/**
 * Background cars keep the sedan's lofted silhouette, but use a purpose-built low-detail trim LOD.
 * Hundreds of instances make player-car wheels, rims and wheel wells disproportionately expensive.
 */
export function makeFleetGeometry() {
  const geometry = CAR_GEOMETRY.sedan;
  const elevated = (source: THREE.BufferGeometry) => {
    const clone = source.clone();
    clone.translate(0, CAR_ORIGIN_HEIGHT, 0);
    return clone;
  };
  return {
    painted: elevated(geometry.body),
    trim: merge(
      [
        fleetBox(1.9, 0.44, 0.1, 0, 1.5, 1.15),
        fleetBox(1.9, 0.44, 0.1, 0, 1.5, -1.42),
        fleetBox(0.1, 0.42, 2.15, -1.08, 1.48, -0.1),
        fleetBox(0.1, 0.42, 2.15, 1.08, 1.48, -0.1),
        fleetBox(2.34, 0.25, 0.2, 0, 0.53, 2.54),
        fleetBox(2.34, 0.25, 0.2, 0, 0.53, -2.54),
        fleetBox(1.16, 0.24, 0.08, 0, 0.62, 2.65),
        fleetBox(1.24, 0.18, 0.1, 0, 0.43, -2.65),
        fleetWheel(-1.17, 1.35),
        fleetWheel(1.17, 1.35),
        fleetWheel(-1.17, -1.35),
        fleetWheel(1.17, -1.35),
      ],
      "fleet trim LOD",
    ),
    headlights: elevated(geometry.headlights),
    taillights: elevated(geometry.taillights),
  };
}

/** Player and rival cars are low-poly lofts with hard, readable creases. */
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

export const CAR_ORIGIN_HEIGHT = 0.8;

function normalize(geometry: THREE.BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(flat.attributes))
    if (name !== "position" && name !== "normal") flat.deleteAttribute(name);
  if (!flat.getAttribute("normal")) flat.computeVertexNormals();
  return flat;
}

function merge(parts: THREE.BufferGeometry[], label: string) {
  const merged = mergeGeometries(parts.map(normalize), false);
  if (!merged) throw new Error(`carGeometry: failed to merge ${label}`);
  return merged;
}

function chamferedRing(halfWidth: number, bottom: number, top: number, chamfer: number) {
  const amount = Math.min(chamfer, halfWidth * 0.6, (top - bottom) * 0.4);
  return [
    [-halfWidth + amount, bottom],
    [halfWidth - amount, bottom],
    [halfWidth, bottom + amount],
    [halfWidth, top - amount],
    [halfWidth - amount, top],
    [-halfWidth + amount, top],
    [-halfWidth, top - amount],
    [-halfWidth, bottom + amount],
  ] as [number, number][];
}

type Station = { z: number; ring: [number, number][] };

function loft(stations: Station[]) {
  const ringSize = stations[0]!.ring.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const station of stations)
    for (const [x, y] of station.ring) positions.push(x, y, station.z);

  for (let station = 0; station < stations.length - 1; station++)
    for (let point = 0; point < ringSize; point++) {
      const next = (point + 1) % ringSize;
      const a = station * ringSize + point;
      const b = station * ringSize + next;
      const c = (station + 1) * ringSize + next;
      const d = (station + 1) * ringSize + point;
      indices.push(a, b, d, b, c, d);
    }

  for (const [stationIndex, flip] of [
    [0, true],
    [stations.length - 1, false],
  ] as const) {
    const base = stationIndex * ringSize;
    let centerX = 0;
    let centerY = 0;
    for (const [x, y] of stations[stationIndex]!.ring) {
      centerX += x;
      centerY += y;
    }
    const center = positions.length / 3;
    positions.push(centerX / ringSize, centerY / ringSize, stations[stationIndex]!.z);
    for (let point = 0; point < ringSize; point++) {
      const next = (point + 1) % ringSize;
      if (flip) indices.push(center, base + next, base + point);
      else indices.push(center, base + point, base + next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

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

function buildFromProfile(
  spec: CarSpec,
  profile: [number, number, number, number][],
  options: { flare: boolean; widthScale?: number; inset?: number },
) {
  return loft(
    profile.map(([position, , bottom, top]) => {
      const halfWidth =
        (options.flare
          ? bodyHalfWidth(spec, position)
          : (spec.width / 2) * (options.widthScale ?? 1)) - (options.inset ?? 0);
      const archLift = options.flare
        ? spec.wheelRadius *
          0.82 *
          Math.max(
            bump(position, spec.axleInset, 0.11),
            bump(position, 1 - spec.axleInset, 0.11),
          )
        : 0;
      return {
        z: -spec.length / 2 + position * spec.length,
        ring: chamferedRing(
          halfWidth,
          spec.sill + bottom + archLift,
          spec.sill + top,
          spec.chamfer,
        ),
      };
    }),
  );
}

const buildBody = (spec: CarSpec) => buildFromProfile(spec, spec.profile, { flare: true });

function buildGlass(spec: CarSpec) {
  return loft(
    spec.cabin.map(([position, width, bottom, top]) => ({
      z: -spec.length / 2 + position * spec.length,
      ring: chamferedRing(
        (spec.width / 2) * width * 0.985,
        spec.sill + bottom,
        spec.sill + top - Math.max(0.09, (top - bottom) * 0.24),
        spec.chamfer * 0.6,
      ),
    })),
  );
}

function buildRoof(spec: CarSpec) {
  return loft(
    spec.cabin.map(([position, width, bottom, top]) => ({
      z: -spec.length / 2 + position * spec.length,
      ring: chamferedRing(
        (spec.width / 2) * width * 1.015,
        spec.sill + top - Math.max(0.13, (top - bottom) * 0.3),
        spec.sill + top + 0.02,
        spec.chamfer * 0.5,
      ),
    })),
  );
}

function buildWheel(spec: CarSpec) {
  const tyre = new THREE.CylinderGeometry(
    spec.wheelRadius,
    spec.wheelRadius,
    spec.wheelWidth,
    16,
    1,
  );
  tyre.rotateZ(Math.PI / 2);
  return tyre;
}

function buildRim(spec: CarSpec) {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const face = new THREE.CylinderGeometry(
      spec.wheelRadius * 0.6,
      spec.wheelRadius * 0.6,
      spec.wheelWidth * 0.14,
      12,
      1,
    );
    face.rotateZ(Math.PI / 2);
    face.translate(side * spec.wheelWidth * 0.5, 0, 0);
    parts.push(face);
  }
  return merge(parts, "rim");
}

function buildTrim(spec: CarSpec) {
  const parts: THREE.BufferGeometry[] = [];
  const top = Math.max(...spec.profile.map((station) => station[3]));
  for (const end of [1, -1]) {
    const bumper = new THREE.BoxGeometry(spec.width * 0.9, 0.3, 0.24);
    bumper.translate(0, spec.sill + 0.24, (end * spec.length) / 2 - end * 0.05);
    parts.push(bumper);
  }
  for (const side of [-1, 1]) {
    const mirror = new THREE.BoxGeometry(0.3, 0.12, 0.26);
    mirror.translate(side * (spec.width / 2 + 0.12), spec.sill + top * 0.95, spec.length * 0.14);
    parts.push(mirror);

    // A shallow liner sits behind each tyre. It reads as a real wheel well without the heavy,
    // bolt-on fender arches rejected in the Blender silhouette study.
    for (const position of [spec.axleInset, 1 - spec.axleInset]) {
      const well = new THREE.CylinderGeometry(
        spec.wheelRadius * 1.11,
        spec.wheelRadius * 1.11,
        spec.wheelWidth * 0.16,
        16,
        1,
      );
      well.rotateZ(Math.PI / 2);
      well.translate(
        side * (bodyHalfWidth(spec, position) - spec.wheelWidth * 0.1),
        spec.wheelRadius - CAR_ORIGIN_HEIGHT,
        -spec.length / 2 + position * spec.length,
      );
      parts.push(well);
    }

    const rocker = new THREE.BoxGeometry(0.12, 0.18, spec.length * 0.54);
    rocker.translate(side * (spec.width / 2 + 0.01), spec.sill + 0.16, 0);
    parts.push(rocker);

    // One flush B-pillar per side breaks the glasshouse into readable front and rear windows.
    const cabinMiddle = spec.cabin[Math.floor(spec.cabin.length / 2)]!;
    const [, cabinWidth, cabinBottom, cabinTop] = cabinMiddle;
    const pillarHeight = Math.max(0.3, cabinTop - cabinBottom - 0.08);
    const pillar = new THREE.BoxGeometry(0.07, pillarHeight, 0.13);
    pillar.translate(
      side * ((spec.width / 2) * cabinWidth + 0.01),
      spec.sill + cabinBottom + pillarHeight / 2,
      -spec.length / 2 + cabinMiddle[0] * spec.length,
    );
    parts.push(pillar);
  }

  const grille = new THREE.BoxGeometry(spec.width * 0.46, 0.24, 0.08);
  grille.translate(0, spec.sill + 0.35, spec.length / 2 + 0.01);
  parts.push(grille);

  const diffuser = new THREE.BoxGeometry(spec.width * 0.5, 0.18, 0.11);
  diffuser.translate(0, spec.sill + 0.19, -spec.length / 2 - 0.015);
  parts.push(diffuser);
  if (spec.hasLightBar) {
    const peak = Math.max(...spec.cabin.map((station) => station[3]));
    const bar = new THREE.BoxGeometry(1, 0.34, 0.66);
    bar.translate(0, spec.sill + peak + 0.19, -spec.length * 0.02);
    parts.push(bar);
  }
  return merge(parts, "trim");
}

function buildCheckers(spec: CarSpec, dark: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const squares = 8;
  const span = 0.56;
  const start = 0.22;
  const cellLength = (spec.length * span) / squares;
  for (let index = 0; index < squares; index++) {
    if (index % 2 === (dark ? 0 : 1)) continue;
    const position = start + ((index + 0.5) / squares) * span;
    const cell = new THREE.BoxGeometry(0.05, 0.26, cellLength);
    for (const side of [-1, 1]) {
      const square = cell.clone();
      square.translate(
        side * (bodyHalfWidth(spec, position) + 0.015),
        spec.sill + 0.46,
        -spec.length / 2 + position * spec.length,
      );
      parts.push(square);
    }
    cell.dispose();
  }
  return parts.length ? merge(parts, "checkers") : null;
}

function buildLights(spec: CarSpec, rear: boolean) {
  const position = rear ? 0.02 : 0.98;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const lamp = new THREE.BoxGeometry(spec.width * 0.24, 0.17, 0.14);
    lamp.translate(
      side * bodyHalfWidth(spec, position) * 0.62,
      spec.sill + (rear ? 0.44 : 0.38),
      rear ? -spec.length / 2 + 0.05 : spec.length / 2 - 0.05,
    );
    parts.push(lamp);
  }
  return merge(parts, "lights");
}

export function buildCarGeometry(spec: CarSpec) {
  const checkersDark = spec.hasCheckers ? buildCheckers(spec, true) : null;
  const checkersLight = spec.hasCheckers ? buildCheckers(spec, false) : null;
  const trimGeometry = buildTrim(spec);
  return {
    body: merge(
      [buildBody(spec), buildRoof(spec), ...(checkersLight ? [checkersLight] : [])],
      "body",
    ),
    glass: buildGlass(spec),
    trim: merge(
      [trimGeometry, ...(checkersDark ? [checkersDark] : [])],
      "trim and checkers",
    ),
    headlights: buildLights(spec, false),
    taillights: buildLights(spec, true),
    wheel: buildWheel(spec),
    rim: buildRim(spec),
  };
}

/** Built once and shared by every player car. */
export const CAR_GEOMETRY = {
  taxi: buildCarGeometry(TAXI_SPEC),
  sedan: buildCarGeometry(SEDAN_SPEC),
  van: buildCarGeometry(VAN_SPEC),
  hatch: buildCarGeometry(HATCH_SPEC),
  sports: buildCarGeometry(SPORTS_SPEC),
};
export type CarKind = keyof typeof CAR_GEOMETRY;

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

export const roofPeakY = (spec: CarSpec) =>
  spec.sill + Math.max(...spec.cabin.map((station) => station[3]));
