import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";

export type StaticInstance = {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
};

/** Upload immutable scenery once. Separate batches retain useful frustum-culling bounds. */
export function StaticInstances({
  items,
  geometry,
  material,
  localMatrix,
  children,
}: {
  items: StaticInstance[];
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
  localMatrix?: THREE.Matrix4;
  children?: ReactNode;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    items.forEach((item, index) => {
      transform.position.set(...item.position);
      transform.rotation.set(...(item.rotation ?? [0, 0, 0]));
      transform.scale.set(...(item.scale ?? [1, 1, 1]));
      transform.updateMatrix();
      if (localMatrix) transform.matrix.multiply(localMatrix);
      mesh.setMatrixAt(index, transform.matrix);
      if (item.color) mesh.setColorAt(index, color.set(item.color));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, localMatrix]);
  return (
    <instancedMesh ref={ref} args={[geometry, material, items.length]}>
      {children}
    </instancedMesh>
  );
}
