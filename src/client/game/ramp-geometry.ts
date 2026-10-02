import * as THREE from "three";
import type { Ramp } from "../../shared/city.ts";
import {
  RAMP_BARRIER_WIDTH,
  rampBarrierHeight,
  rampHeight,
  rampSegments,
  rampUnderside,
} from "../../shared/ramps.ts";

type RampShape = Pick<Ramp, "kind" | "length" | "width" | "height">;
type Vertex = [number, number, number];
type UV = [number, number];

/** Indexed ribbons keep the curved riding surface smooth and the structural edges crisp. */
class RampMesh {
  positions: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  ribbon(rows: [Vertex, Vertex][], uvRows: [UV, UV][]) {
    const start = this.positions.length / 3;
    for (let i = 0; i < rows.length; i++) {
      this.positions.push(...rows[i]![0], ...rows[i]![1]);
      this.uvs.push(...uvRows[i]![0], ...uvRows[i]![1]);
      if (i === rows.length - 1) continue;
      const a = start + i * 2;
      this.indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }

  quad(a: Vertex, b: Vertex, c: Vertex, d: Vertex, width: number, height: number) {
    this.ribbon(
      [
        [a, d],
        [b, c],
      ],
      [
        [
          [0, 0],
          [width, 0],
        ],
        [
          [0, height],
          [width, height],
        ],
      ],
    );
  }

  finish(surfaceIndices = 0) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    if (surfaceIndices) {
      geometry.addGroup(0, surfaceIndices, 0);
      geometry.addGroup(surfaceIndices, this.indices.length - surfaceIndices, 1);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
}

/** Asphalt top and separate structural shell, both following the collision profile. */
export function makeRampGeometry(ramp: RampShape) {
  const mesh = new RampMesh();
  const segments = rampSegments(ramp.kind);
  const halfW = ramp.width / 2;
  const halfL = ramp.length / 2;
  const rows: [Vertex, Vertex][] = [];
  const uvs: [UV, UV][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = -halfL + t * ramp.length;
    const y = rampHeight(ramp, t);
    rows.push([
      [-halfW, y, z],
      [halfW, y, z],
    ]);
    // A kicker wears one graphic. Grade asphalt tiles in world metres.
    uvs.push([
      [0, ramp.kind === "kicker" ? t : (t * ramp.length) / 4],
      [
        ramp.kind === "kicker" ? 1 : ramp.width / 4,
        ramp.kind === "kicker" ? t : (t * ramp.length) / 4,
      ],
    ]);
  }
  mesh.ribbon(rows, uvs);
  const surfaceIndices = mesh.indices.length;
  for (const side of [-1, 1]) {
    const edgeRows: [Vertex, Vertex][] = [];
    const edgeUvs: [UV, UV][] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -halfL + t * ramp.length;
      const top: Vertex = [side * halfW, rampHeight(ramp, t), z];
      const bottom: Vertex = [side * halfW, rampUnderside(ramp, t), z];
      edgeRows.push(side < 0 ? [bottom, top] : [top, bottom]);
      const a: UV = [(t * ramp.length) / 4, bottom[1] / 4];
      const b: UV = [(t * ramp.length) / 4, top[1] / 4];
      edgeUvs.push(side < 0 ? [a, b] : [b, a]);
    }
    mesh.ribbon(edgeRows, edgeUvs);
  }
  const bottomRows: [Vertex, Vertex][] = [];
  const bottomUvs: [UV, UV][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = -halfL + t * ramp.length;
    const y = rampUnderside(ramp, t);
    bottomRows.push([
      [halfW, y, z],
      [-halfW, y, z],
    ]);
    bottomUvs.push([
      [ramp.width / 4, (t * ramp.length) / 4],
      [0, (t * ramp.length) / 4],
    ]);
  }
  mesh.ribbon(bottomRows, bottomUvs);
  const base = rampUnderside(ramp, 1);
  mesh.quad(
    [-halfW, base, halfL],
    [halfW, base, halfL],
    [halfW, ramp.height, halfL],
    [-halfW, ramp.height, halfL],
    ramp.width / 4,
    (ramp.height - base) / 4,
  );
  return mesh.finish(surfaceIndices);
}

/** A flush paint ribbon or tapered concrete barrier that follows every profile segment. */
export function makeRampRibbonGeometry(
  ramp: RampShape,
  across: number,
  width: number,
  from = 0,
  to = 1,
  barrier = false,
) {
  const mesh = new RampMesh();
  const segments = Math.max(1, Math.ceil(rampSegments(ramp.kind) * (to - from)));
  const rows: [Vertex, Vertex][] = [];
  const uvs: [UV, UV][] = [];
  const left = across - width / 2;
  const right = across + width / 2;
  for (let i = 0; i <= segments; i++) {
    const t = from + ((to - from) * i) / segments;
    const y = rampHeight(ramp, t) + (barrier ? rampBarrierHeight(ramp, t) : 0.025);
    const z = (t - 0.5) * ramp.length;
    const taper = barrier ? RAMP_BARRIER_WIDTH * 0.22 : 0;
    rows.push([
      [left + taper, y, z],
      [right - taper, y, z],
    ]);
    uvs.push([
      [0, t],
      [1, t],
    ]);
  }
  mesh.ribbon(rows, uvs);
  if (barrier) {
    for (const side of [-1, 1]) {
      const edgeRows: [Vertex, Vertex][] = [];
      for (let i = 0; i <= segments; i++) {
        const t = from + ((to - from) * i) / segments;
        const z = (t - 0.5) * ramp.length;
        const bottom: Vertex = [side < 0 ? left : right, rampHeight(ramp, t), z];
        const top: Vertex = [
          bottom[0] - side * RAMP_BARRIER_WIDTH * 0.22,
          bottom[1] + rampBarrierHeight(ramp, t),
          z,
        ];
        edgeRows.push(side < 0 ? [bottom, top] : [top, bottom]);
      }
      mesh.ribbon(edgeRows, uvs);
    }
    const y = rampHeight(ramp, to);
    const z = (to - 0.5) * ramp.length;
    mesh.quad(
      [left, y, z],
      [right, y, z],
      [right - RAMP_BARRIER_WIDTH * 0.22, y + rampBarrierHeight(ramp, to), z],
      [left + RAMP_BARRIER_WIDTH * 0.22, y + rampBarrierHeight(ramp, to), z],
      width,
      1,
    );
  }
  return mesh.finish();
}
