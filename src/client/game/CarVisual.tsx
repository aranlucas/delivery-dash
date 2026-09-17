import { Billboard, RoundedBox, Text } from "@react-three/drei";
import { Suspense } from "react";
import { CarModel, type CarLod } from "./CarModel";
import type { CarKind } from "./carGeometry";
import { BoostFlames, DriftSmoke, RushTrails } from "./carEffects";

const TAXI_YELLOW = "#ffd400";

/**
 * Shared lofted car model plus the delivery-specific topper, cargo, and effects.
 * Remote cars choose a silhouette and LOD; the player's taxi always stays full.
 */
export const CarVisual = ({
  color,
  carrying,
  name,
  own = false,
  kind = "taxi",
  lod = "full",
}: {
  color: string;
  carrying: boolean;
  name?: string;
  own?: boolean;
  kind?: CarKind;
  lod?: CarLod;
}) => {
  const modelKind = own ? "taxi" : kind;
  return (
    <group>
      <CarModel
        kind={modelKind}
        color={own ? TAXI_YELLOW : color}
        lod={lod}
        animateWheels={own}
        topperColor={own ? "#15191d" : color}
        topperEmissive={own ? "#ff8a00" : color}
        topperEmissiveIntensity={own ? 0.45 : 0.2}
      />
      {lod === "full" ? (
        <>
          {carrying ? (
            <RoundedBox
              castShadow
              position={[0, 0.72, -1.72]}
              args={[1.35, 0.62, 0.85]}
              radius={0.12}
              smoothness={3}
            >
              <meshStandardMaterial color="#f6b73c" roughness={0.8} />
            </RoundedBox>
          ) : null}
        </>
      ) : null}
      {own ? (
        <>
          <BoostFlames />
          <RushTrails />
          <DriftSmoke />
        </>
      ) : null}
      {name && lod !== "box" ? (
        <Suspense fallback={null}>
          <Billboard position={[0, 3.2, 0]}>
            <Text fontSize={0.8} color="white" outlineWidth={0.05} outlineColor="#000">
              {name}
            </Text>
          </Billboard>
        </Suspense>
      ) : null}
    </group>
  );
};
