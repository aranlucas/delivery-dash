import * as THREE from "three";
import type { Ramp } from "../../shared/city.ts";
import { rampHeight, rampSegments } from "../../shared/ramps.ts";

/**
 * Wedge whose top face follows the same profile the physics samples, so what you see is what you
 * drive. Local +z climbs; the mesh is rotated into place by the ramp's yaw.
 */
export function makeRampGeometry(ramp: Pick<Ramp, "kind" | "length" | "width" | "height">) {
  const segments = rampSegments(ramp.kind);
  const halfW = ramp.width / 2,
    halfL = ramp.length / 2;
  const TILE = ramp.kind === "kicker" ? 1 : 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  type Vertex = [number, number, number];
  type UV = [number, number];
  const quad = (
    corners: [Vertex, Vertex, Vertex, Vertex],
    texels: [UV, UV, UV, UV],
    surface = false,
  ) => {
    const [a, b, c, d] = corners;
    const side = ramp.kind === "kicker" && !surface;
    const [ta, tb, tc, td] = side
      ? [
          [0.5, 0.98],
          [0.5, 0.98],
          [0.5, 0.98],
          [0.5, 0.98],
        ]
      : texels;
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    uvs.push(...ta, ...tb, ...tc, ...ta, ...tc, ...td);
  };
  const profile = (t: number) => rampHeight(ramp, t);
  const across = ramp.width / TILE;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments,
      t1 = (i + 1) / segments;
    const z0 = -halfL + t0 * ramp.length,
      z1 = -halfL + t1 * ramp.length;
    const y0 = profile(t0),
      y1 = profile(t1);
    const v0 = (z0 + halfL) / TILE,
      v1 = (z1 + halfL) / TILE;
    quad(
      [
        [-halfW, y0, z0],
        [-halfW, y1, z1],
        [halfW, y1, z1],
        [halfW, y0, z0],
      ],
      [
        [0, v0],
        [0, v1],
        [across, v1],
        [across, v0],
      ],
      true,
    );
    quad(
      [
        [-halfW, 0, z0],
        [-halfW, 0, z1],
        [-halfW, y1, z1],
        [-halfW, y0, z0],
      ],
      [
        [v0, 0],
        [v1, 0],
        [v1, y1 / TILE],
        [v0, y0 / TILE],
      ],
    );
    quad(
      [
        [halfW, 0, z0],
        [halfW, y0, z0],
        [halfW, y1, z1],
        [halfW, 0, z1],
      ],
      [
        [v0, 0],
        [v0, y0 / TILE],
        [v1, y1 / TILE],
        [v1, 0],
      ],
    );
  }
  quad(
    [
      [-halfW, 0, halfL],
      [halfW, 0, halfL],
      [halfW, ramp.height, halfL],
      [-halfW, ramp.height, halfL],
    ],
    [
      [0, 0],
      [across, 0],
      [across, ramp.height / TILE],
      [0, ramp.height / TILE],
    ],
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
