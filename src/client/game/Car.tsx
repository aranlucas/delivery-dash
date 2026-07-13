import { Billboard, RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { TICK_HZ, type Phase } from "../../shared/protocol";
import { WORLD_HALF, type AABB } from "../../shared/city";
import { send } from "../net";
import { drivingTelemetry, ownPose, type CarPose } from "./drivingState";

const FORWARD_ACCELERATION = 31;
const REVERSE_ACCELERATION = 18;
const BRAKE_DECELERATION = 48;
const COAST_DECELERATION = 5.5;
const HANDBRAKE_DECELERATION = 8;
const NORMAL_MAX_SPEED = 38;
const BOOST_MAX_SPEED = 52;
const REVERSE_MAX_SPEED = 16;
const COLLISION_BOUNCE = 0.16;
const BOOST_DRAIN_PER_SECOND = 27;
const BOOST_RECHARGE_PER_SECOND = 12;

const pressed = new Set<string>();
const CONTROL_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowleft",
  "arrowdown",
  "arrowright",
  " ",
  "shift",
]);
const collides = (x: number, z: number, boxes: AABB[]) =>
  Math.abs(x) > WORLD_HALF - 5 ||
  Math.abs(z) > WORLD_HALF - 5 ||
  boxes.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2);

const approachZero = (value: number, amount: number) =>
  value > 0 ? Math.max(0, value - amount) : Math.min(0, value + amount);

const resetTelemetry = () => {
  drivingTelemetry.boost = 100;
  drivingTelemetry.drifting = false;
  drivingTelemetry.driftScore = 0;
  drivingTelemetry.callout = "";
  drivingTelemetry.combo = 0;
  drivingTelemetry.impactPulse = 0;
  drivingTelemetry.steer = 0;
  drivingTelemetry.throttle = 0;
  drivingTelemetry.boosting = false;
};

const driftCallout = (score: number) => {
  if (score >= 600) return "CRAZY DRIFT!";
  if (score >= 300) return "WILD DRIFT!";
  if (score >= 120) return "NICE DRIFT!";
  return "DRIFT!";
};

let signedWheelSpeed = 0;
const WHEEL_POSITIONS = [
  [-1.45, -1.65],
  [1.45, -1.65],
  [-1.45, 1.65],
  [1.45, 1.65],
] as const;
const EXHAUST_POSITIONS = [-0.7, 0.7] as const;

export function OwnCar({
  spawn,
  spawnYaw = 0,
  boxes,
  phase,
  color,
  carrying,
}: {
  spawn: [number, number];
  spawnYaw?: number;
  boxes: AABB[];
  phase: Phase;
  color: string;
  carrying: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const velocity = useRef(new THREE.Vector2());
  const forwardVector = useRef(new THREE.Vector2());
  const rightVector = useRef(new THREE.Vector2());
  const driftGrace = useRef(0);
  const driftHold = useRef(0);
  const sent = useRef(0);
  const driving = phase === "racing" || phase === "lobby"; // free roam in the lobby, frozen during countdown/finish
  const spawnX = spawn[0];
  const spawnZ = spawn[1];
  const reset = useCallback(() => {
    ownPose.x = spawnX;
    ownPose.z = spawnZ;
    ownPose.yaw = spawnYaw;
    ownPose.speed = 0;
    signedWheelSpeed = 0;
    sent.current = 0;
    velocity.current.set(0, 0);
    driftGrace.current = 0;
    driftHold.current = 0;
    resetTelemetry();
  }, [spawnX, spawnZ, spawnYaw]);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      const key = event.key.toLowerCase();
      if (!CONTROL_KEYS.has(key)) return;
      event.preventDefault();
      pressed.add(key);
    };
    const keyUp = (event: KeyboardEvent) => pressed.delete(event.key.toLowerCase());
    const clearKeys = () => pressed.clear();
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clearKeys);
      clearKeys();
    };
  }, []);
  useEffect(() => {
    reset();
  }, [reset]);
  useEffect(() => {
    if (phase === "countdown") {
      reset();
      send({ t: "pos", ...ownPose });
    }
  }, [phase, reset]);
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    drivingTelemetry.impactPulse = Math.max(0, drivingTelemetry.impactPulse - d * 2.8);

    if (driving) {
      const throttle =
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
      const handbrake = pressed.has(" ") || pressed.has("space");
      const boostHeld = pressed.has("shift");
      const forward = forwardVector.current.set(Math.sin(ownPose.yaw), Math.cos(ownPose.yaw));
      let longitudinal = velocity.current.dot(forward);
      const speedBeforeSteer = velocity.current.length();
      const steeringAuthority = THREE.MathUtils.clamp(speedBeforeSteer / 3, 0, 1);
      const steeringRate = THREE.MathUtils.lerp(
        0.85,
        handbrake ? 2.8 : 2.15,
        THREE.MathUtils.clamp(speedBeforeSteer / 28, 0, 1),
      );
      const motionDirection = Math.sign(longitudinal || throttle);
      ownPose.yaw += steer * steeringRate * steeringAuthority * motionDirection * d;

      forward.set(Math.sin(ownPose.yaw), Math.cos(ownPose.yaw));
      const right = rightVector.current.set(Math.cos(ownPose.yaw), -Math.sin(ownPose.yaw));
      longitudinal = velocity.current.dot(forward);
      let lateral = velocity.current.dot(right);
      const boosting = boostHeld && throttle > 0 && longitudinal > -1 && drivingTelemetry.boost > 0;

      if (throttle > 0) {
        longitudinal +=
          (longitudinal < 0
            ? BRAKE_DECELERATION
            : FORWARD_ACCELERATION + (boosting ? 24 : 0)) * d;
      } else if (throttle < 0) {
        longitudinal -=
          (longitudinal > 0 ? BRAKE_DECELERATION : REVERSE_ACCELERATION) * d;
      } else {
        longitudinal = approachZero(longitudinal, COAST_DECELERATION * d);
      }
      if (handbrake) longitudinal = approachZero(longitudinal, HANDBRAKE_DECELERATION * d);

      if (longitudinal >= 0) {
        const maxForward = boosting ? BOOST_MAX_SPEED : NORMAL_MAX_SPEED;
        longitudinal =
          longitudinal > maxForward
            ? Math.max(maxForward, longitudinal - 9 * d)
            : Math.min(maxForward, longitudinal);
      } else {
        longitudinal = Math.max(-REVERSE_MAX_SPEED, longitudinal);
      }

      // Keep a world-space lateral component. Low grip on the handbrake lets
      // the car rotate underneath its momentum instead of snapping to forward.
      lateral *= Math.exp(-(handbrake ? 0.65 : 3.8) * d);
      velocity.current.copy(forward).multiplyScalar(longitudinal).addScaledVector(right, lateral);

      const speedLimit =
        longitudinal < 0 ? REVERSE_MAX_SPEED : boosting ? BOOST_MAX_SPEED : NORMAL_MAX_SPEED;
      const totalSpeed = velocity.current.length();
      if (totalSpeed > speedLimit) {
        const easedLimit = boosting ? speedLimit : Math.max(speedLimit, totalSpeed - 9 * d);
        velocity.current.setLength(easedLimit);
      }

      if (boosting)
        drivingTelemetry.boost = Math.max(
          0,
          drivingTelemetry.boost - BOOST_DRAIN_PER_SECOND * d,
        );
      else
        drivingTelemetry.boost = Math.min(
          100,
          drivingTelemetry.boost + BOOST_RECHARGE_PER_SECOND * d,
        );

      const nx = ownPose.x + velocity.current.x * d,
        nz = ownPose.z + velocity.current.y * d;
      if (!collides(nx, ownPose.z, boxes)) ownPose.x = nx;
      else {
        const impact = Math.abs(velocity.current.x);
        velocity.current.x *= -COLLISION_BOUNCE;
        drivingTelemetry.impactPulse = Math.max(
          drivingTelemetry.impactPulse,
          THREE.MathUtils.clamp(impact / 18, 0.18, 1),
        );
      }
      if (!collides(ownPose.x, nz, boxes)) ownPose.z = nz;
      else {
        const impact = Math.abs(velocity.current.y);
        velocity.current.y *= -COLLISION_BOUNCE;
        drivingTelemetry.impactPulse = Math.max(
          drivingTelemetry.impactPulse,
          THREE.MathUtils.clamp(impact / 18, 0.18, 1),
        );
      }

      forward.set(Math.sin(ownPose.yaw), Math.cos(ownPose.yaw));
      right.set(Math.cos(ownPose.yaw), -Math.sin(ownPose.yaw));
      const finalLongitudinal = velocity.current.dot(forward);
      const finalLateral = velocity.current.dot(right);
      const finalSpeed = velocity.current.length();
      const drifting =
        finalSpeed > 10 &&
        Math.abs(finalLongitudinal) > 5 &&
        Math.abs(finalLateral) > Math.max(2.6, finalSpeed * 0.12);

      if (drifting) {
        driftGrace.current = 0.55;
        driftHold.current = 1;
        drivingTelemetry.driftScore += Math.abs(finalLateral) * finalSpeed * d * 0.85;
        drivingTelemetry.combo = Math.min(8, 1 + Math.floor(drivingTelemetry.driftScore / 220));
        drivingTelemetry.callout = driftCallout(drivingTelemetry.driftScore);
      } else if (driftGrace.current > 0) {
        driftGrace.current = Math.max(0, driftGrace.current - d);
      } else if (driftHold.current > 0) {
        driftHold.current = Math.max(0, driftHold.current - d);
      } else {
        drivingTelemetry.driftScore = 0;
        drivingTelemetry.combo = 0;
        drivingTelemetry.callout = "";
      }

      drivingTelemetry.drifting = drifting;
      drivingTelemetry.steer = steer;
      drivingTelemetry.throttle = throttle;
      drivingTelemetry.boosting = boosting;
      signedWheelSpeed = finalLongitudinal;
    } else {
      drivingTelemetry.drifting = false;
      drivingTelemetry.steer = 0;
      drivingTelemetry.throttle = 0;
      drivingTelemetry.boosting = false;
    }
    ownPose.speed = velocity.current.length();
    if (group.current) {
      group.current.position.set(ownPose.x, ownPose.y, ownPose.z);
      group.current.rotation.y = ownPose.yaw;
    }
    if (visual.current) {
      const speedRatio = THREE.MathUtils.clamp(ownPose.speed / NORMAL_MAX_SPEED, 0, 1);
      const impactWobble =
        Math.sin(state.clock.elapsedTime * 42) * drivingTelemetry.impactPulse * 0.065;
      visual.current.rotation.z = THREE.MathUtils.lerp(
        visual.current.rotation.z,
        -drivingTelemetry.steer * speedRatio * 0.085 + impactWobble,
        Math.min(1, d * 10),
      );
      visual.current.rotation.x = THREE.MathUtils.lerp(
        visual.current.rotation.x,
        drivingTelemetry.throttle * 0.035,
        Math.min(1, d * 7),
      );
      visual.current.position.y = Math.sin(state.clock.elapsedTime * 17) * speedRatio * 0.018;
    }
    sent.current += d;
    if (driving && sent.current >= 1 / TICK_HZ) {
      sent.current = 0;
      send({ t: "pos", ...ownPose });
    }
  });
  return (
    <group ref={group}>
      <group ref={visual}>
        <CarVisual color={color} carrying={carrying} own />
      </group>
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
}) => {
  const bodyColor = own ? "#ffe100" : color;
  return (
  <group position={pose ? [pose.x, pose.y, pose.z] : undefined} rotation-y={pose?.yaw}>
    {/* body: main shell, tapered hood and trunk — rounded shells */}
    <RoundedBox
      castShadow
      position={[0, -0.12, 0]}
      args={[2.9, 0.72, 5.3]}
      radius={0.16}
      smoothness={3}
    >
      <meshStandardMaterial color={bodyColor} emissive={own ? "#4a2600" : "#000"} emissiveIntensity={own ? 0.22 : 0} metalness={own ? 0.12 : 0.48} roughness={own ? 0.4 : 0.34} />
    </RoundedBox>
    <RoundedBox
      castShadow
      position={[0, 0.3, 1.85]}
      args={[2.7, 0.34, 1.5]}
      radius={0.12}
      smoothness={3}
    >
      <meshStandardMaterial color={bodyColor} emissive={own ? "#4a2600" : "#000"} emissiveIntensity={own ? 0.22 : 0} metalness={own ? 0.12 : 0.48} roughness={own ? 0.4 : 0.34} />
    </RoundedBox>
    <RoundedBox
      castShadow
      position={[0, 0.3, -1.95]}
      args={[2.7, 0.34, 1.3]}
      radius={0.12}
      smoothness={3}
    >
      <meshStandardMaterial color={bodyColor} emissive={own ? "#4a2600" : "#000"} emissiveIntensity={own ? 0.22 : 0} metalness={own ? 0.12 : 0.48} roughness={own ? 0.4 : 0.34} />
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
      <meshStandardMaterial color={bodyColor} emissive={own ? "#4a2600" : "#000"} emissiveIntensity={own ? 0.22 : 0} metalness={own ? 0.12 : 0.48} roughness={own ? 0.4 : 0.34} />
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
    {own
      ? Array.from({ length: 6 }, (_, i) => {
          const dark = i % 2 === 0;
          const z = -1.45 + i * 0.58;
          return (
            <group key={i}>
              <mesh position={[-1.48, -0.02, z]}>
                <boxGeometry args={[0.07, 0.34, 0.56]} />
                <meshStandardMaterial color={dark ? "#121417" : "#fff5cf"} />
              </mesh>
              <mesh position={[1.48, -0.02, z]}>
                <boxGeometry args={[0.07, 0.34, 0.56]} />
                <meshStandardMaterial color={dark ? "#121417" : "#fff5cf"} />
              </mesh>
            </group>
          );
        })
      : null}
    {/* delivery topper + hot bag when carrying */}
    <RoundedBox
      castShadow
      position={[0, 1.28, -0.15]}
      args={[1.25, 0.42, 0.85]}
      radius={0.12}
      smoothness={3}
    >
      <meshStandardMaterial
        color={own ? "#15191d" : color}
        emissive={own ? "#ff8a00" : color}
        emissiveIntensity={own ? 0.35 : 0.2}
      />
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
    {WHEEL_POSITIONS.map(([x, z]) => (
      <Wheel key={`${x}:${z}`} x={x} z={z} animate={own} steerable={z > 0} />
    ))}
    {own ? (
      <>
        <BoostFlames />
        <DriftSmoke />
      </>
    ) : null}
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
};
function Wheel({
  x,
  z,
  animate,
  steerable,
}: {
  x: number;
  z: number;
  animate: boolean;
  steerable: boolean;
}) {
  const steering = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!animate) return;
    if (wheel.current) wheel.current.rotation.x -= signedWheelSpeed * dt * 0.7;
    if (steerable && steering.current)
      steering.current.rotation.y = THREE.MathUtils.lerp(
        steering.current.rotation.y,
        drivingTelemetry.steer * 0.48,
        Math.min(1, dt * 14),
      );
  });
  return (
    <group ref={steering} position={[x, -0.32, z]}>
      <group ref={wheel}>
        <mesh rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.48, 0.48, 0.42, 16]} />
          <meshStandardMaterial color="#101114" roughness={0.9} />
        </mesh>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.22, 0.22, 0.44, 8]} />
          <meshStandardMaterial color="#8f959e" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function BoostFlames() {
  const flames = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!flames.current) return;
    flames.current.visible = drivingTelemetry.boosting;
    flames.current.scale.z = 0.75 + Math.sin(state.clock.elapsedTime * 55) * 0.22;
  });
  return (
    <group ref={flames} visible={false}>
      {EXHAUST_POSITIONS.map((x) => (
        <mesh key={x} position={[x, -0.28, -3.08]} rotation-x={-Math.PI / 2}>
          <coneGeometry args={[0.18, 0.95, 8]} />
          <meshStandardMaterial
            color="#fff2a3"
            emissive="#ff4d00"
            emissiveIntensity={4}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

function DriftSmoke() {
  const particles = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(({ clock }) => {
    const active = drivingTelemetry.drifting;
    for (let i = 0; i < particles.current.length; i++) {
      const particle = particles.current[i];
      if (!particle) continue;
      const phase = (clock.elapsedTime * 1.7 + i / particles.current.length) % 1;
      particle.visible = active;
      particle.position.set(i % 2 === 0 ? -1.15 : 1.15, -0.18 + phase * 0.85, -1.7 - phase * 4.2);
      const scale = 0.18 + phase * 0.92;
      particle.scale.set(scale, scale * 0.7, scale);
    }
  });
  return (
    <group>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            particles.current[i] = mesh;
          }}
          visible={false}
        >
          <icosahedronGeometry args={[0.55, 1]} />
          <meshBasicMaterial color="#dff7ff" transparent opacity={0.26} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
