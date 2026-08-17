import type { AABB } from "./city.ts";

/** Immutable uniform grid over XZ, stored in compact CSR-style arrays. */
export type SpatialGrid = {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  bucketStart: Int32Array;
  bucketItems: Int32Array;
  boxes: AABB[];
};

const clampInt = (value: number, low: number, high: number) =>
  value < low ? low : value > high ? high : value;

const colOf = (grid: SpatialGrid, x: number) =>
  clampInt(Math.floor((x - grid.minX) / grid.cell), 0, grid.cols - 1);
const rowOf = (grid: SpatialGrid, z: number) =>
  clampInt(Math.floor((z - grid.minZ) / grid.cell), 0, grid.rows - 1);

export function buildGrid(boxes: AABB[], cell = 50): SpatialGrid {
  if (boxes.length === 0)
    return {
      cell,
      cols: 1,
      rows: 1,
      minX: 0,
      minZ: 0,
      bucketStart: new Int32Array(2),
      bucketItems: new Int32Array(0),
      boxes,
    };

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.minX);
    minZ = Math.min(minZ, box.minZ);
    maxX = Math.max(maxX, box.maxX);
    maxZ = Math.max(maxZ, box.maxZ);
  }

  const cols = Math.max(1, Math.floor((maxX - minX) / cell) + 1);
  const rows = Math.max(1, Math.floor((maxZ - minZ) / cell) + 1);
  const cellCount = cols * rows;
  const bucketStart = new Int32Array(cellCount + 1);
  const spans = new Int32Array(boxes.length * 4);

  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index]!;
    const colStart = clampInt(Math.floor((box.minX - minX) / cell), 0, cols - 1);
    const colEnd = clampInt(Math.floor((box.maxX - minX) / cell), 0, cols - 1);
    const rowStart = clampInt(Math.floor((box.minZ - minZ) / cell), 0, rows - 1);
    const rowEnd = clampInt(Math.floor((box.maxZ - minZ) / cell), 0, rows - 1);
    spans.set([colStart, colEnd, rowStart, rowEnd], index * 4);
    for (let row = rowStart; row <= rowEnd; row++)
      for (let col = colStart; col <= colEnd; col++) bucketStart[row * cols + col + 1]!++;
  }
  for (let index = 0; index < cellCount; index++)
    bucketStart[index + 1]! += bucketStart[index]!;

  const bucketItems = new Int32Array(bucketStart[cellCount]!);
  const cursor = Int32Array.from(bucketStart.subarray(0, cellCount));
  for (let index = 0; index < boxes.length; index++) {
    const colStart = spans[index * 4]!;
    const colEnd = spans[index * 4 + 1]!;
    const rowStart = spans[index * 4 + 2]!;
    const rowEnd = spans[index * 4 + 3]!;
    for (let row = rowStart; row <= rowEnd; row++)
      for (let col = colStart; col <= colEnd; col++)
        bucketItems[cursor[row * cols + col]!++] = index;
  }

  return { cell, cols, rows, minX, minZ, bucketStart, bucketItems, boxes };
}

/**
 * Writes indices of boxes overlapping the XZ query into caller-owned `out`.
 * A box spanning several cells is returned once.
 */
export function queryRange(
  grid: SpatialGrid,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  out: number[],
): number {
  const colStart = colOf(grid, minX);
  const colEnd = colOf(grid, maxX);
  const rowStart = rowOf(grid, minZ);
  const rowEnd = rowOf(grid, maxZ);
  let count = 0;

  for (let row = rowStart; row <= rowEnd; row++)
    for (let col = colStart; col <= colEnd; col++) {
      const bucket = row * grid.cols + col;
      const end = grid.bucketStart[bucket + 1]!;
      for (let cursor = grid.bucketStart[bucket]!; cursor < end; cursor++) {
        const boxIndex = grid.bucketItems[cursor]!;
        const box = grid.boxes[boxIndex]!;
        if (box.maxX < minX || box.minX > maxX || box.maxZ < minZ || box.minZ > maxZ) continue;
        let duplicate = false;
        for (let index = 0; index < count; index++)
          if (out[index] === boxIndex) {
            duplicate = true;
            break;
          }
        if (!duplicate) out[count++] = boxIndex;
      }
    }
  return count;
}
