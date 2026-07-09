import { Billboard, RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { TICK_HZ, type Phase } from "../../shared/protocol";
import { WORLD_HALF, type AABB } from "../../shared/city";
import { send } from "../net";

export type CarPose = { x: number; y: number; z: number; yaw: number; speed: number };
export const ownPose: CarPose = { x: 0, y: 0.8, z: 0, yaw: 0, speed: 0 };
const pressed = new Set<string>();
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => pressed.add(e.key.toLowerCase()));
  window.addEventListener("keyup", (e) => pressed.delete(e.key.toLowerCase()));
}
const collides = (x: number, z: number, boxes: AABB[]) =>
  Math.abs(x) > WORLD_HALF - 5 ||
  Math.abs(z) > WORLD_HALF - 5 ||
  boxes.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2);

export function OwnCar({
  spawn,
  boxes,
  phase,
  color,
  carrying,
}: {
  spawn: [number, number];
  boxes: AABB[];
  phase: Phase;
  color: string;
  carrying: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const velocity = useRef(new THREE.Vector2());
  const sent = useRef(0);
  const driving = phase === "racing" || phase === "lobby"; // free roam in the lobby, frozen during countdown/finish
  const reset = () => {
    ownPose.x = spawn[0];
    ownPose.z = spawn[1];
    ownPose.yaw = 0;
    ownPose.speed = 0;
    velocity.current.set(0, 0);
  };
  useEffect(() => {
    reset();
  }, [spawn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === "countdown") {
      reset();
      send({ t: "pos", ...ownPose });
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    if (driving) {
      const forward =
        pressed.has("w") || pressed.has("arrowup")
          ? 1
          : pressed.has("s") || pressed.has("arrowdown")
            ? -1
            : 0;
      const steer =
        pressed.has("a") || pressed.has("arrowleft")
          ? 1
          : pressed.has("d") || pressed.has("arrowright")
            ? -1
            : 0;
      const dir = new THREE.Vector2(Math.sin(ownPose.yaw), Math.cos(ownPose.yaw));
      velocity.current.addScaledVector(dir, forward * 28 * d);
      const speed = velocity.current.dot(dir);
      ownPose.yaw +=
        steer * Math.min(2.6, 0.45 + Math.abs(speed) * 0.055) * Math.sign(speed || forward) * d;
      const newDir = new THREE.Vector2(Math.sin(ownPose.yaw), Math.cos(ownPose.yaw));
      const longitudinal = velocity.current.dot(newDir);
      velocity.current.copy(newDir.multiplyScalar(longitudinal)).multiplyScalar(1 - 0.6 * d);
      velocity.current.clampLength(0, 38);
      const nx = ownPose.x + velocity.current.x * d,
        nz = ownPose.z + velocity.current.y * d;
      if (!collides(nx, ownPose.z, boxes)) ownPose.x = nx;
      else velocity.current.x = 0;
      if (!collides(ownPose.x, nz, boxes)) ownPose.z = nz;
      else velocity.current.y = 0;
    }
    ownPose.speed = velocity.current.length();
    if (group.current) {
      group.current.position.set(ownPose.x, ownPose.y, ownPose.z);
      group.current.rotation.y = ownPose.yaw;
    }
    sent.current += d;
    if (driving && sent.current >= 1 / TICK_HZ) {
      sent.current = 0;
      send({ t: "pos", ...ownPose });
    }
  });
  return (
    <group ref={group}>
      <CarVisual color={color} carrying={carrying} own />
    </group>
  );
}

const glass = <meshStandardMaterial color="#1c2a38" metalness={0.4} roughness={0.12} />;
const trim = <meshStandardMaterial color="#20242b" metalness={0.3} roughness={0.6} />;
export const CarVisual = ({
  pose,
  color,
  carrying,
  name,
  own = false,
}: {
  pose?: CarPose;
  color: string;
  carrying: boolean;
  name?: string;
  own?: boolean;
}) => (
  <group position={pose ? [pose.x, pose.y, pose.z] : undefined} rotation-y={pose?.yaw}>
    {/* body: main shell, tapered hood and trunk — rounded shells */}
    <RoundedBox
      castShadow
      position={[0, -0.12, 0]}
      args={[2.9, 0.72, 5.3]}
      radius={0.16}
      smoothness={3}
    >
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.32} />
    </RoundedBox>
    <RoundedBox
      castShadow
      position={[0, 0.3, 1.85]}
      args={[2.7, 0.34, 1.5]}
      radius={0.12}
      smoothness={3}
    >
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.32} />
    </RoundedBox>
    <RoundedBox
      castShadow
      position={[0, 0.3, -1.95]}
      args={[2.7, 0.34, 1.3]}
      radius={0.12}
      smoothness={3}
    >
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.32} />
    </RoundedBox>
    {/* cabin: glasshouse + painted roof */}
    <RoundedBox
      castShadow
      position={[0, 0.62, -0.15]}
      args={[2.45, 0.68, 2.5]}
      radius={0.18}
      smoothness={3}
    >
      {glass}
    </RoundedBox>
    <RoundedBox
      castShadow
      position={[0, 0.99, -0.15]}
      args={[2.3, 0.12, 2.3]}
      radius={0.06}
      smoothness={2}
    >
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.32} />
    </RoundedBox>
    {/* windshield + rear glass rake */}
    <mesh position={[0, 0.55, 1.22]} rotation-x={-0.5}>
      <boxGeometry args={[2.3, 0.05, 0.9]} />
      {glass}
    </mesh>
    <mesh position={[0, 0.55, -1.5]} rotation-x={0.45}>
      <boxGeometry args={[2.3, 0.05, 0.8]} />
      {glass}
    </mesh>
    {/* bumpers, mirrors */}
    <RoundedBox position={[0, -0.35, 2.68]} args={[2.95, 0.34, 0.3]} radius={0.1} smoothness={2}>
      {trim}
    </RoundedBox>
    <RoundedBox position={[0, -0.35, -2.68]} args={[2.95, 0.34, 0.3]} radius={0.1} smoothness={2}>
      {trim}
    </RoundedBox>
    <RoundedBox
      position={[-1.52, 0.35, 0.95]}
      args={[0.22, 0.16, 0.3]}
      radius={0.05}
      smoothness={2}
    >
      {trim}
    </RoundedBox>
    <RoundedBox position={[1.52, 0.35, 0.95]} args={[0.22, 0.16, 0.3]} radius={0.05} smoothness={2}>
      {trim}
    </RoundedBox>
    {/* lights */}
    <mesh position={[-0.95, -0.05, 2.66]}>
      <boxGeometry args={[0.55, 0.2, 0.08]} />
      <meshStandardMaterial color="#fff6da" emissive="#ffedb8" emissiveIntensity={2.2} />
    </mesh>
    <mesh position={[0.95, -0.05, 2.66]}>
      <boxGeometry args={[0.55, 0.2, 0.08]} />
      <meshStandardMaterial color="#fff6da" emissive="#ffedb8" emissiveIntensity={2.2} />
    </mesh>
    <mesh position={[-0.95, -0.05, -2.66]}>
      <boxGeometry args={[0.5, 0.18, 0.08]} />
      <meshStandardMaterial color="#7a1212" emissive="#ff2b1e" emissiveIntensity={1.6} />
    </mesh>
    <mesh position={[0.95, -0.05, -2.66]}>
      <boxGeometry args={[0.5, 0.18, 0.08]} />
      <meshStandardMaterial color="#7a1212" emissive="#ff2b1e" emissiveIntensity={1.6} />
    </mesh>
    {/* delivery topper + hot bag when carrying */}
    <RoundedBox
      castShadow
      position={[0, 1.28, -0.15]}
      args={[1.25, 0.42, 0.85]}
      radius={0.12}
      smoothness={3}
    >
      <meshStandardMaterial color="#eb1700" emissive="#eb1700" emissiveIntensity={0.5} />
    </RoundedBox>
    {carrying && (
      <RoundedBox
        castShadow
        position={[0, 0.62, -1.9]}
        args={[1.5, 0.7, 0.95]}
        radius={0.14}
        smoothness={3}
      >
        <meshStandardMaterial color="#f6b73c" roughness={0.8} />
      </RoundedBox>
    )}
    {[
      [-1.45, -1.65],
      [1.45, -1.65],
      [-1.45, 1.65],
      [1.45, 1.65],
    ].map(([x, z], i) => (
      <Wheel key={i} x={x} z={z} animate={own} />
    ))}
    {name && (
      <Suspense fallback={null}>
        <Billboard position={[0, 3.2, 0]}>
          <Text fontSize={0.8} color="white" outlineWidth={0.05} outlineColor="#000">
            {name}
          </Text>
        </Billboard>
      </Suspense>
    )}
  </group>
);
function Wheel({ x, z, animate }: { x: number; z: number; animate: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (animate && wheel.current) wheel.current.rotation.x -= ownPose.speed * dt * 0.7;
  });
  return (
    <group ref={wheel} position={[x, -0.32, z]}>
      <mesh rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.48, 0.48, 0.42, 16]} />
        <meshStandardMaterial color="#101114" roughness={0.9} />
      </mesh>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.22, 0.22, 0.44, 8]} />
        <meshStandardMaterial color="#8f959e" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}
