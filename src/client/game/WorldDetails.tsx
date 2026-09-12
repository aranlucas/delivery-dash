import { useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

import { CITY_ZONES } from "../../shared/city";
import { StaticInstances, type StaticInstance } from "./StaticInstances";

type WorldModel = "market" | "harbor" | "plaza";

const assetUrl = (name: WorldModel) => `/models/world/${name}.glb?v=world-4`;

/**
 * The authored kit lives at the outer corners of each superblock; the harbor boat sits
 * beyond the west seawall beside Lighthouse Point. The center 20–36 m drift ring,
 * landmark footprint, and approach portals remain open for driving.
 * These are visual props only, so no city collision contract is needed.
 */
const RELATIVE_PLACEMENTS: Record<
  (typeof CITY_ZONES)[number]["id"],
  Array<{
    model: WorldModel;
    position: [number, number, number];
    rotation: [number, number, number];
    scale?: [number, number, number];
  }>
> = {
  festival: [
    { model: "market", position: [-32, 0, 36], rotation: [0, -0.18, 0], scale: [0.8, 0.8, 0.8] },
    {
      model: "market",
      position: [32, 0, 36],
      rotation: [0, Math.PI + 0.18, 0],
      scale: [0.8, 0.8, 0.8],
    },
  ],
  // The beach extends to x=-332.5. The dock meets that shore and the hull sits in the water.
  harbor: [
    { model: "harbor", position: [-99, -1.0, 0], rotation: [0, 0, 0], scale: [0.75, 0.75, 0.75] },
  ],
  skyline: [{ model: "plaza", position: [32, 0, 36], rotation: [0, 0, 0] }],
  freight: [{ model: "plaza", position: [-32, 0, 36], rotation: [0, 0, 0] }],
  stunt: [{ model: "plaza", position: [32, 0, 36], rotation: [0, 0, 0] }],
};

const WORLD_PLACEMENTS: Record<WorldModel, StaticInstance[]> = {
  market: [],
  harbor: [],
  plaza: [],
};
for (const zone of CITY_ZONES)
  for (const placement of RELATIVE_PLACEMENTS[zone.id])
    WORLD_PLACEMENTS[placement.model].push({
      position: [
        zone.x + placement.position[0],
        placement.position[1],
        zone.z + placement.position[2],
      ],
      rotation: placement.rotation,
      scale: placement.scale,
    });

function ModelBatch({ name, items }: { name: WorldModel; items: StaticInstance[] }) {
  const { scene } = useGLTF(assetUrl(name));
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        meshes.push(object);
      }
    });
    return meshes;
  }, [scene]);
  return (
    <>
      {parts.map((part) => (
        <StaticInstances
          key={`${name}-${part.uuid}`}
          items={items}
          geometry={part.geometry}
          material={part.material}
          localMatrix={part.matrixWorld}
        />
      ))}
    </>
  );
}

/** Large, authored silhouettes for the festival, harbor, and public-plaza edges. */
export function WorldDetails() {
  return (
    <Suspense fallback={null}>
      {(Object.keys(WORLD_PLACEMENTS) as WorldModel[]).map((name) => (
        <ModelBatch key={name} name={name} items={WORLD_PLACEMENTS[name]} />
      ))}
    </Suspense>
  );
}

for (const name of ["market", "harbor", "plaza"] as const) useGLTF.preload(assetUrl(name));
