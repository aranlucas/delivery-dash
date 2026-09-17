import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
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

/** Walk a GLB scene into instanced parts, sharing the cached model's buffers. */
export function GltfInstances({
  scene,
  items,
  shadows,
  batchKey,
}: {
  scene: THREE.Object3D;
  items: StaticInstance[];
  shadows?: boolean;
  batchKey?: string;
}) {
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (shadows) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
      meshes.push(object);
    });
    return meshes;
  }, [scene, shadows]);
  return (
    <>
      {parts.map((part) => (
        <StaticInstances
          key={batchKey ? `${batchKey}-${part.uuid}` : part.uuid}
          items={items}
          geometry={part.geometry}
          material={part.material}
          localMatrix={part.matrixWorld}
        />
      ))}
    </>
  );
}
