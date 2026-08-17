import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { CAR_ORIGIN_HEIGHT, type CarKind } from "./carGeometry";

// Public assets keep readable filenames, so bump this when Blender output changes. This also
// invalidates drei's in-memory GLTF cache during development instead of showing stale geometry.
const ASSET_REVISION = "2026-08-17-car-shape-5";
const versioned = (path: string) => `${path}?v=${ASSET_REVISION}`;

const VEHICLE_URLS: Record<CarKind, string> = {
  taxi: versioned("/models/vehicles/taxi.glb"),
  sedan: versioned("/models/vehicles/sedan.glb"),
  van: versioned("/models/vehicles/van.glb"),
  hatch: versioned("/models/vehicles/hatch.glb"),
  sports: versioned("/models/vehicles/sports.glb"),
};
const STREET_PROPS_URL = versioned("/models/street-props.glb");

const bakedGeometry = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();
const localGeometry = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();

function mesh(nodes: Record<string, THREE.Object3D>, name: string) {
  const object = nodes[name];
  if (!(object instanceof THREE.Mesh)) throw new Error(`Missing mesh node \"${name}\" in Blender asset`);
  object.updateWorldMatrix(true, false);
  return object;
}

/** Bake a Blender node into the asset root; repeated callers share the resulting buffer. */
function geometry(nodes: Record<string, THREE.Object3D>, name: string, keepTranslation = true) {
  const object = mesh(nodes, name);
  const cache = keepTranslation ? bakedGeometry : localGeometry;
  const cached = cache.get(object);
  if (cached) return cached;
  const transform = object.matrixWorld.clone();
  if (!keepTranslation) transform.setPosition(0, 0, 0);
  const result = object.geometry.clone().applyMatrix4(transform);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  cache.set(object, result);
  return result;
}

export type VehicleAsset = {
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  headlights: THREE.BufferGeometry;
  taillights: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  topper: THREE.BufferGeometry;
  fleetTrim: THREE.BufferGeometry;
};

export function useVehicleAsset(kind: CarKind): VehicleAsset {
  const { nodes } = useGLTF(VEHICLE_URLS[kind]);
  return useMemo(
    () => ({
      body: geometry(nodes, `${kind}_body`),
      glass: geometry(nodes, `${kind}_glass`),
      trim: geometry(nodes, `${kind}_trim`),
      headlights: geometry(nodes, `${kind}_headlights`),
      taillights: geometry(nodes, `${kind}_taillights`),
      wheel: geometry(nodes, `${kind}_front_left_tyre`, false),
      rim: geometry(nodes, `${kind}_front_left_rim`, false),
      topper: geometry(nodes, `${kind}_topper`),
      fleetTrim: geometry(nodes, `${kind}_fleet_trim`),
    }),
    [kind, nodes],
  );
}

export function makeFleetGeometry(asset: VehicleAsset) {
  const elevated = (source: THREE.BufferGeometry) => {
    const clone = source.clone();
    clone.translate(0, CAR_ORIGIN_HEIGHT, 0);
    return clone;
  };
  return {
    painted: elevated(asset.body),
    glass: elevated(asset.glass),
    trim: elevated(asset.fleetTrim),
    headlights: elevated(asset.headlights),
    taillights: elevated(asset.taillights),
    topper: elevated(asset.topper),
  };
}

export function useStreetPropAssets() {
  const { nodes } = useGLTF(STREET_PROPS_URL);
  return useMemo(
    () => ({
      hydrant: geometry(nodes, "prop_hydrant_mesh"),
      bin: geometry(nodes, "prop_bin_mesh"),
      bench: geometry(nodes, "prop_bench_mesh"),
      streetlightPole: geometry(nodes, "prop_streetlight_pole"),
      streetlightLens: geometry(nodes, "prop_streetlight_lens"),
      palmTrunk: geometry(nodes, "prop_palm_trunk", false),
      palmFrond: geometry(nodes, "prop_palm_frond", false),
    }),
    [nodes],
  );
}

for (const url of Object.values(VEHICLE_URLS)) useGLTF.preload(url);
useGLTF.preload(STREET_PROPS_URL);
