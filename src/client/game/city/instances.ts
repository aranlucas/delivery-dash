import { useLayoutEffect, type RefObject } from "react";
import * as THREE from "three";
import type { AABB } from "../../../shared/city";

export type Instance = {
  pos: [number, number, number];
  scale?: number | [number, number, number];
  rotY?: number;
  rotX?: number;
  color?: string;
};

export function useInstances(ref: RefObject<THREE.InstancedMesh | null>, items: Instance[]) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(1, 0, 0);
    const color = new THREE.Color();
    items.forEach((it, i) => {
      const s = it.scale ?? 1;
      const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
      q.setFromAxisAngle(up, it.rotY ?? 0);
      if (it.rotX) q.multiply(tilt.setFromAxisAngle(right, it.rotX));
      matrix.compose(new THREE.Vector3(...it.pos), q, sv);
      mesh.setMatrixAt(i, matrix);
      if (it.color) mesh.setColorAt(i, color.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, items]);
}

/** Box instance that exactly fills a solid AABB, so visuals and collision never disagree. */
export const boxInstance = (box: AABB): Instance => ({
  pos: [(box.minX + box.maxX) / 2, (box.base + box.top) / 2, (box.minZ + box.maxZ) / 2],
  scale: [box.maxX - box.minX, box.top - box.base, box.maxZ - box.minZ],
});
