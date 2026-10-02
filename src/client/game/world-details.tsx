import { useGLTF } from "@react-three/drei";
import { Suspense } from "react";

import { CITY_ZONES } from "../../shared/city";
import { GltfInstances, StaticInstances, type StaticInstance } from "./static-instances";

type WorldModel = "market" | "harbor" | "plaza";

const assetUrl = (name: WorldModel) => `/models/world/${name}.glb?v=world-4`;

/**
 * The authored kit lives at the outer corners of each superblock; the harbor boat sits
 * off the west shore beside Lighthouse Point. The center 20–36 m drift ring,
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
  // The harbor occupies a sheltered cove in the west shore; its hull sits at sea level.
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
  return <GltfInstances scene={scene} items={items} shadows batchKey={name} />;
}

const HARBOR = CITY_ZONES.find((zone) => zone.id === "harbor")!;
const GANGWAY_POSTS: StaticInstance[] = [-14, -5, 5, 14].flatMap((x) =>
  [-1.15, 1.15].map((z) => ({ position: [x, 0.45, z], scale: [0.18, 1.35, 0.18] })),
);
const GANGWAY_PLANKS: StaticInstance[] = Array.from({ length: 32 }, (_, x) => ({
  position: [-15.5 + x, 0.11, 0],
  scale: [0.94, 0.06, 2.2],
}));

function HarborGangway() {
  return (
    <group position={[HARBOR.x - 76, -0.14, HARBOR.z]} rotation-z={Math.atan2(0.44, 32)}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[32, 0.18, 2.2]} />
        <meshStandardMaterial color="#78573a" roughness={0.95} />
      </mesh>
      <StaticInstances items={GANGWAY_PLANKS} shadows>
        <boxGeometry />
        <meshStandardMaterial color="#b99966" roughness={0.95} />
      </StaticInstances>
      <StaticInstances items={GANGWAY_POSTS} shadows>
        <boxGeometry />
        <meshStandardMaterial color="#78573a" roughness={0.95} />
      </StaticInstances>
      {[-1.15, 1.15].map((z) => (
        <mesh key={z} position={[0, 1.03, z]} castShadow>
          <boxGeometry args={[32, 0.12, 0.16]} />
          <meshStandardMaterial color="#b99966" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Large, authored silhouettes for the festival, harbor, and public-plaza edges. */
export function WorldDetails() {
  return (
    <Suspense fallback={null}>
      <HarborGangway />
      {(Object.keys(WORLD_PLACEMENTS) as WorldModel[]).map((name) => (
        <ModelBatch key={name} name={name} items={WORLD_PLACEMENTS[name]} />
      ))}
    </Suspense>
  );
}

for (const name of ["market", "harbor", "plaza"] as const) useGLTF.preload(assetUrl(name));
