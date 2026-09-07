import { useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { CITY_ZONES, type City } from "../../shared/city";
import {
  storefrontModel,
  storefrontYaw,
  jumpGatePosition,
  type DeliveryModel,
} from "../../shared/deliveryAssets";
import { StaticInstances, type StaticInstance } from "./StaticInstances";
const assetUrl = (name: DeliveryModel) => `/models/delivery/${name}.glb?v=delivery-2`;
function Batch({ model, items }: { model: DeliveryModel; items: StaticInstance[] }) {
  const { scene } = useGLTF(assetUrl(model));
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    return meshes;
  }, [scene]);
  return (
    <>
      {parts.map((part) => (
        <StaticInstances
          key={part.uuid}
          items={items}
          geometry={part.geometry}
          material={part.material}
          localMatrix={part.matrixWorld}
        />
      ))}
    </>
  );
}
const gates: StaticInstance[] = CITY_ZONES.filter(
  (zone) => zone.id === "stunt" || zone.id === "freight",
).map((zone) => {
  const [x, z] = jumpGatePosition(zone);
  return { position: [x, 0, z] };
});
const targets: StaticInstance[] = gates.flatMap((gate) =>
  [-35, 35].map((offset) => ({ position: [gate.position[0], 0, gate.position[2] + offset] })),
);
export function DeliveryAssets({ city }: { city: City }) {
  const shops = useMemo(
    () =>
      city.restaurants.flatMap((place) => {
        const model = storefrontModel(place.name);
        return model
          ? [
              {
                model,
                items: [
                  {
                    position: [place.pos[0], 0, place.pos[1]] as [number, number, number],
                    rotation: [0, storefrontYaw(place), 0] as [number, number, number],
                  },
                ],
              },
            ]
          : [];
      }),
    [city],
  );
  return (
    <>
      {shops.map((shop) => (
        <Suspense key={shop.model} fallback={null}>
          <Batch {...shop} />
        </Suspense>
      ))}
      <Suspense fallback={null}>
        <Batch model="jump-gate" items={gates} />
        <Batch model="landing-target" items={targets} />
      </Suspense>
    </>
  );
}
