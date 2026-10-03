import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { CITY_ZONES, WORLD_HALF } from "../../shared/city";
import { useGameStore } from "../store";
import { ownPose } from "./driving-state";

const offset = new THREE.Vector3(-0.65, 0.85, -0.75).normalize();

function updateClipping(camera: THREE.PerspectiveCamera, distance: number) {
  // A street-level near plane loses ground/water precision when viewing the island from kilometres away.
  const near = THREE.MathUtils.clamp(distance / 20, 0.35, 100);

  if (Math.abs(camera.near - near) < 0.01) return;
  camera.near = near;
  camera.updateProjectionMatrix();
}

/** One camera owner at a time; preset requests are discrete, orbiting stays outside React state. */
export function CityViewCamera() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const seen = useRef(-1);
  const lastSize = useRef({ width: 0, height: 0 });
  useFrame(({ camera, size }) => {
    const orbit = controls.current;

    if (!orbit) return;
    const { cityViewFocus, cityViewSequence } = useGameStore.getState();
    const entireCity = cityViewFocus === "overview" || cityViewFocus === "overhead";

    const resized =
      lastSize.current.width !== size.width || lastSize.current.height !== size.height;

    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const perspective = camera;

    if (seen.current === cityViewSequence && !(entireCity && resized)) {
      updateClipping(perspective, orbit.getDistance());

      return;
    }

    seen.current = cityViewSequence;
    lastSize.current.width = size.width;
    lastSize.current.height = size.height;
    // Flush the previous drag's inertia before placing the new camera and target.
    const damping = orbit.enableDamping;
    orbit.enableDamping = false;
    orbit.update();
    orbit.enableDamping = damping;
    perspective.fov = 50;
    perspective.updateProjectionMatrix();
    let distance: number;

    if (entireCity) {
      orbit.target.set(0, 2, 0);
      const vertical = THREE.MathUtils.degToRad(perspective.fov / 2);
      const horizontal = Math.atan((Math.tan(vertical) * size.width) / size.height);
      const usableHeight = Math.max(0.55, (size.height - 165) / size.height);
      distance = (WORLD_HALF * 1.75) / Math.sin(Math.min(vertical, horizontal)) / usableHeight;
    } else if (cityViewFocus === "car") {
      orbit.target.set(ownPose.x, ownPose.y, ownPose.z);
      distance = 50;
    } else {
      const zone = CITY_ZONES.find((entry) => entry.id === cityViewFocus)!;
      orbit.target.set(zone.x, zone.height * 0.16, zone.z);
      distance = Math.max(135, zone.height * 2.1);
    }

    if (cityViewFocus === "overhead") camera.position.set(0, distance + 2, -0.01);
    else camera.position.copy(orbit.target).addScaledVector(offset, distance);
    orbit.saveState();
    orbit.reset();
    camera.lookAt(orbit.target);
    updateClipping(perspective, distance);
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={12}
      maxDistance={4200}
      minPolarAngle={0.001}
      maxPolarAngle={Math.PI / 2 - 0.035}
      zoomSpeed={0.8}
      panSpeed={0.85}
      rotateSpeed={0.65}
    />
  );
}
