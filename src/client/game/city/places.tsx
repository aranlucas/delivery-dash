import { Text } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BLOCK_SIZE,
  GRID_SIZE,
  PITCH,
  ROAD_WIDTH,
  WORLD_HALF,
  blockCenter,
  type City as CityData,
  type Pos2,
} from "../../../shared/city";
import { storefrontModel, storefrontYaw } from "../../../shared/deliveryAssets";
import { useInstances, type Instance } from "./instances";

const awningColors = ["#ff4f2e", "#00aeea", "#25bd69", "#f03363", "#9b62e7", "#ff8a20"];
const houseColors = ["#ffd28f", "#8bd1ea", "#ff9e96", "#9ddd85", "#d7a2ee"];

/** Yaw that turns a place's +z front toward the street corner it sits in. */
function outwardYaw([x, z]: Pos2) {
  const grid = (v: number) =>
    blockCenter(
      Math.max(
        0,
        Math.min(GRID_SIZE - 1, Math.round((v + WORLD_HALF - ROAD_WIDTH - BLOCK_SIZE / 2) / PITCH)),
      ),
    );
  return Math.atan2(Math.sign(x - grid(x)) || 1, Math.sign(z - grid(z)) || 1);
}

/** Convert an offset inside a yawed place group to an instance in world space. */
function placeOffset(
  [px, pz]: Pos2,
  yaw: number,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [px + x * cosine + z * sine, y, pz - x * sine + z * cosine];
}

/** All repeated place geometry is instanced; only restaurant text remains per-place. */
function PlaceProps({ city }: { city: CityData }) {
  const groups = useMemo(() => {
    const restaurantShells: Instance[] = [];
    const houseShells: Instance[] = [];
    const roofs: Instance[] = [];
    const doors: Instance[] = [];
    const windows: Instance[] = [];
    const signPanels: Instance[] = [];
    const awnings: Instance[] = [];
    const signBoards: Instance[] = [];

    city.houses.forEach((place, index) => {
      const yaw = outwardYaw(place.pos);
      houseShells.push({
        pos: [place.pos[0], 1.5, place.pos[1]],
        rotY: yaw,
        color: houseColors[index % houseColors.length]!,
      });
      roofs.push({
        pos: placeOffset(place.pos, yaw, 0, 4.05, 0),
        rotY: yaw + Math.PI / 4,
      });
      doors.push({
        pos: placeOffset(place.pos, yaw, 0, 0.95, 3.02),
        rotY: yaw,
      });
      windows.push({
        pos: placeOffset(place.pos, yaw, -1.8, 1.6, 3.02),
        rotY: yaw,
      });
      windows.push({
        pos: placeOffset(place.pos, yaw, 1.8, 1.6, 3.02),
        rotY: yaw,
      });
    });

    city.restaurants.forEach((place, index) => {
      if (storefrontModel(place.name)) return;
      const yaw = outwardYaw(place.pos);
      restaurantShells.push({
        pos: [place.pos[0], 1.9, place.pos[1]],
        rotY: yaw,
      });
      signPanels.push({
        pos: placeOffset(place.pos, yaw, 0, 1.35, 3.02),
        rotY: yaw,
      });
      awnings.push({
        pos: placeOffset(place.pos, yaw, 0, 2.85, 3.4),
        rotY: yaw,
        rotX: 0.5,
        color: awningColors[index % awningColors.length]!,
      });
      signBoards.push({
        pos: placeOffset(place.pos, yaw, 0, 4.15, 3.05),
        rotY: yaw,
      });
    });

    return {
      restaurantShells,
      houseShells,
      roofs,
      doors,
      windows,
      signPanels,
      awnings,
      signBoards,
    };
  }, [city]);

  const geometries = useMemo(
    () => ({
      restaurant: new RoundedBoxGeometry(8.5, 3.8, 6, 3, 0.22),
      house: new RoundedBoxGeometry(6, 3, 6, 3, 0.2),
      awning: new RoundedBoxGeometry(7.6, 0.16, 1.7, 2, 0.07),
      signBoard: new RoundedBoxGeometry(7, 1.1, 0.3, 2, 0.1),
    }),
    [],
  );
  const restaurantMesh = useRef<THREE.InstancedMesh>(null);
  const houseMesh = useRef<THREE.InstancedMesh>(null);
  const roofMesh = useRef<THREE.InstancedMesh>(null);
  const doorMesh = useRef<THREE.InstancedMesh>(null);
  const windowMesh = useRef<THREE.InstancedMesh>(null);
  const panelMesh = useRef<THREE.InstancedMesh>(null);
  const awningMesh = useRef<THREE.InstancedMesh>(null);
  const boardMesh = useRef<THREE.InstancedMesh>(null);
  useInstances(restaurantMesh, groups.restaurantShells);
  useInstances(houseMesh, groups.houseShells);
  useInstances(roofMesh, groups.roofs);
  useInstances(doorMesh, groups.doors);
  useInstances(windowMesh, groups.windows);
  useInstances(panelMesh, groups.signPanels);
  useInstances(awningMesh, groups.awnings);
  useInstances(boardMesh, groups.signBoards);

  return (
    <>
      <instancedMesh
        ref={restaurantMesh}
        args={[geometries.restaurant, undefined, groups.restaurantShells.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#ffd09b" roughness={0.86} />
      </instancedMesh>
      <instancedMesh
        ref={houseMesh}
        args={[geometries.house, undefined, groups.houseShells.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="white" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={roofMesh} args={[undefined, undefined, groups.roofs.length]} castShadow>
        <coneGeometry args={[4.7, 2.1, 4]} />
        <meshStandardMaterial color="#e85c42" roughness={0.86} flatShading />
      </instancedMesh>
      <instancedMesh ref={doorMesh} args={[undefined, undefined, groups.doors.length]}>
        <planeGeometry args={[1.1, 1.9]} />
        <meshStandardMaterial color="#4a3527" />
      </instancedMesh>
      <instancedMesh ref={windowMesh} args={[undefined, undefined, groups.windows.length]}>
        <planeGeometry args={[1.2, 1.1]} />
        <meshStandardMaterial color="#ffe6b0" emissive="#ffd98c" emissiveIntensity={0.9} />
      </instancedMesh>
      <instancedMesh ref={panelMesh} args={[undefined, undefined, groups.signPanels.length]}>
        <planeGeometry args={[6.4, 1.9]} />
        <meshStandardMaterial color="#fff0bd" emissive="#ffb84c" emissiveIntensity={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={awningMesh}
        args={[geometries.awning, undefined, groups.awnings.length]}
        castShadow
      >
        <meshStandardMaterial color="white" roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={boardMesh}
        args={[geometries.signBoard, undefined, groups.signBoards.length]}
      >
        <meshStandardMaterial color="#241f1c" />
      </instancedMesh>
    </>
  );
}

function RestaurantSign({ place }: { place: CityData["restaurants"][number] }) {
  return (
    <group
      position={[place.pos[0], 0, place.pos[1]]}
      rotation-y={storefrontModel(place.name) ? storefrontYaw(place) : outwardYaw(place.pos)}
    >
      <Suspense fallback={null}>
        <Text
          position={[0, storefrontModel(place.name) ? 4.5 : 4.15, 3.25]}
          fontSize={0.78}
          color="#ffd98c"
          anchorX="center"
          anchorY="middle"
          maxWidth={6.6}
        >
          {place.name}
        </Text>
      </Suspense>
    </group>
  );
}

/** Procedural houses plus restaurant shells; GLB storefronts stay on DeliveryAssets. */
export function Places({ city }: { city: CityData }) {
  return (
    <>
      <PlaceProps city={city} />
      {city.restaurants.map((place) => (
        <RestaurantSign key={`r${place.id}`} place={place} />
      ))}
    </>
  );
}
