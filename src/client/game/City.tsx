import { useEffect, useMemo } from "react";
import { WORLD_HALF, type City as CityData } from "../../shared/city";
import { DeliveryAssets } from "./DeliveryAssets";
import { LandmarkCity } from "./LandmarkCity";
import { makeAsphaltTexture } from "./textures";
import {
  ArcadeCurbs,
  Blocks,
  BoostPads,
  Buildings,
  Crosswalks,
  Expressway,
  Ramps,
  RoadMarkings,
} from "./city/fabric";
import { FleetCars } from "./city/fleet";
import { Places } from "./city/places";
import {
  Greenery,
  PalmTrees,
  Rooftops,
  StreetFurniture,
  StreetLights,
  TrafficSignals,
} from "./city/scenery";

export function City({ city, seed }: { city: CityData; seed: number }) {
  const asphalt = useMemo(makeAsphaltTexture, []);
  useEffect(() => () => asphalt.dispose(), [asphalt]);
  return (
    <group>
      {/* asphalt ground */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[WORLD_HALF * 2, WORLD_HALF * 2]} />
        <meshStandardMaterial map={asphalt} roughness={0.96} />
      </mesh>
      <Blocks city={city} />
      <RoadMarkings city={city} />
      <Crosswalks />
      <ArcadeCurbs />
      <Buildings city={city} />
      <Rooftops city={city} seed={seed} />
      <Ramps city={city} />
      <Expressway city={city} />
      <BoostPads city={city} />
      <FleetCars city={city} />
      <TrafficSignals />
      <StreetFurniture city={city} seed={seed} />
      <Greenery city={city} seed={seed} />
      <PalmTrees city={city} seed={seed} />
      <StreetLights city={city} />
      <LandmarkCity />
      <DeliveryAssets city={city} />
      <Places city={city} />
    </group>
  );
}
