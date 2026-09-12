import { useEffect, useMemo, useRef, useState } from "react";
import { DELIVERIES_TO_WIN } from "../../shared/protocol";
import { CHECKPOINT_COUNT, GAME_MODES, getObjective } from "../../shared/gameModes";
import {
  BLOCK_SIZE,
  CITY_ZONES,
  GRID_SIZE,
  ROAD_WIDTH,
  WORLD_HALF,
  generateCity,
  generateOrders,
  roadCenter,
  type City,
} from "../../shared/city";
import { relativeBearing } from "../../shared/nav";
import { MAX_DRIFT_CHARGE } from "../game/arcadeRewards";
import { cameraPose, drivingTelemetry, ownPose } from "../game/drivingState";
import { close, rejoin, send } from "../net";
import { ownPlayer, remotePositions, useGameStore } from "../store";

function leaveRoom() {
  close();
  useGameStore.getState().reset();
}

export function Lobby() {
  const phase = useGameStore((state) => state.phase);
  const players = useGameStore((state) => state.players);
  const room = useGameStore((state) => state.roomCode);
  const self = useGameStore(ownPlayer);
  const connected = useGameStore((state) => state.connected);
  const error = useGameStore((state) => state.lastError);
  const mode = useGameStore((state) => state.mode);
  if (phase !== "lobby") return null;

  return (
    <aside className="lobby-panel arcade-panel">
      <div className="panel-kicker">{GAME_MODES[mode].name.toUpperCase()}</div>
      <div className="room-code">
        <small>ROOM</small>
        <strong>{room}</strong>
      </div>
      <p className="lobby-mode-description">{GAME_MODES[mode].description}</p>
      <div className="lobby-roster">
        {players.map((player, index) => (
          <div className="lobby-driver" key={player.id}>
            <span className="grid-position">{String(index + 1).padStart(2, "0")}</span>
            <i style={{ background: player.color }} />
            <b>{player.name}</b>
            <em className={player.ready ? "is-ready" : ""}>{player.ready ? "READY" : "WAITING"}</em>
          </div>
        ))}
      </div>
      {connected ? (
        <button
          className="arcade-button arcade-button-primary lobby-ready"
          onClick={() => self && send({ t: "ready", ready: !self.ready })}
        >
          {self?.ready ? "CANCEL READY" : mode === "free" ? "READY TO EXPLORE" : "READY TO RACE"}
        </button>
      ) : (
        <button className="arcade-button arcade-button-primary lobby-ready" onClick={rejoin}>
          REJOIN RACE
        </button>
      )}
      <p className="lobby-hint">FREE ROAM IS OPEN · WASD TO DRIVE</p>
      {error ? (
        <p className="arcade-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="leave-room" onClick={leaveRoom}>
        LEAVE ROOM
      </button>
    </aside>
  );
}

const MINIMAP_SIZE = 190;
/** Top-down city plan with the expressways, the jump ramps, the target, and every driver. */
function Minimap({
  city,
  target,
  dropoff,
  checkpoint = false,
}: {
  city: City;
  target?: [number, number];
  dropoff: boolean;
  checkpoint?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const players = useGameStore((state) => state.players);
  const selfId = useGameStore((state) => state.selfId);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    element.width = element.height = MINIMAP_SIZE * ratio;
    const world = WORLD_HALF * 2;
    const scale = MINIMAP_SIZE / world;
    const toMap = (coordinate: number) => (coordinate + WORLD_HALF) * scale;
    const colors = new Map(players.map((p) => [p.id, p.color]));

    let frame = 0;
    let previous = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (time - previous < 55) return;
      previous = time;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#0d1218";
      context.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      const block = BLOCK_SIZE * scale;
      context.fillStyle = "#1f4c2c";
      for (const [x, z] of city.parks) {
        const px = toMap(x),
          pz = toMap(z);
        context.fillRect(px - block / 2, pz - block / 2, block, block);
      }

      context.strokeStyle = "#39434f";
      context.lineWidth = Math.max(1.4, ROAD_WIDTH * scale);
      context.beginPath();
      for (let i = 0; i < GRID_SIZE; i++) {
        const c = toMap(roadCenter(i));
        context.moveTo(c, 0);
        context.lineTo(c, MINIMAP_SIZE);
        context.moveTo(0, c);
        context.lineTo(MINIMAP_SIZE, c);
      }
      context.stroke();

      for (const zone of CITY_ZONES) {
        const x = toMap(zone.x),
          z = toMap(zone.z),
          half = zone.half * scale;
        context.globalAlpha = 0.3;
        context.fillStyle = zone.color;
        context.fillRect(x - half, z - half, half * 2, half * 2);
        context.globalAlpha = 1;
        context.strokeStyle = zone.color;
        context.lineWidth = 1;
        context.strokeRect(x - half, z - half, half * 2, half * 2);
        context.fillStyle = zone.color;
        context.font = "bold 8px sans-serif";
        context.textAlign = "center";
        context.fillText(zone.id === "stunt" ? "JUMP" : zone.name.split(" ")[0]!, x, z + 3);
      }
      context.strokeStyle = "#ff9d33";
      context.lineWidth = 3;
      context.beginPath();
      for (const deck of city.decks) {
        const alongX = deck.maxX - deck.minX > deck.maxZ - deck.minZ;
        const midX = (deck.minX + deck.maxX) / 2,
          midZ = (deck.minZ + deck.maxZ) / 2;
        const ax = toMap(alongX ? deck.minX : midX),
          az = toMap(alongX ? midZ : deck.minZ),
          bx = toMap(alongX ? deck.maxX : midX),
          bz = toMap(alongX ? midZ : deck.maxZ);
        context.moveTo(ax, az);
        context.lineTo(bx, bz);
      }
      context.stroke();

      context.fillStyle = "#ffd400";
      for (const ramp of city.ramps) {
        if (ramp.kind !== "kicker") continue;
        const px = toMap(ramp.x),
          pz = toMap(ramp.z);
        context.fillRect(px - 1.6, pz - 1.6, 3.2, 3.2);
      }

      if (target) {
        const tx = toMap(target[0]),
          tz = toMap(target[1]);
        const pulse = 5 + Math.sin(time / 220) * 2;
        context.strokeStyle = checkpoint ? "#00dcff" : dropoff ? "#65f578" : "#ff7a00";
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(tx, tz, pulse, 0, Math.PI * 2);
        context.stroke();
      }

      for (const [id, pose] of remotePositions) {
        if (id === selfId) continue;
        const px = toMap(pose.x),
          pz = toMap(pose.z);
        context.fillStyle = colors.get(id) ?? "#ffffff";
        context.beginPath();
        context.arc(px, pz, 2.8, 0, Math.PI * 2);
        context.fill();
      }

      // Own car as an arrow: world +z is map +y, so the heading maps straight across.
      const sx = toMap(ownPose.x),
        sz = toMap(ownPose.z);
      const dx = Math.sin(ownPose.yaw),
        dz = Math.cos(ownPose.yaw);
      context.fillStyle = "#ffe100";
      context.beginPath();
      context.moveTo(sx + dx * 6.5, sz + dz * 6.5);
      context.lineTo(sx - dx * 3.5 + dz * 4, sz - dz * 3.5 - dx * 4);
      context.lineTo(sx - dx * 3.5 - dz * 4, sz - dz * 3.5 + dx * 4);
      context.closePath();
      context.fill();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [city, target, dropoff, checkpoint, players, selfId]);

  return <canvas className="minimap" ref={canvas} aria-hidden="true" />;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function Countdown() {
  const phase = useGameStore((state) => state.phase);
  const ends = useGameStore((state) => state.countdownEndsAt);
  const started = useGameStore((state) => state.raceStartedAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);

  const count = Math.ceil(((ends ?? now) - now) / 1000);
  const showGo = phase === "racing" && started !== undefined && now - started < 900;
  if (phase !== "countdown" && !showGo) return null;
  return (
    <div className={`countdown ${showGo ? "is-go" : ""}`} aria-live="assertive">
      <span>{showGo ? "GO!" : Math.max(1, count)}</span>
    </div>
  );
}

export function HUD() {
  const seed = useGameStore((state) => state.seed);
  const phase = useGameStore((state) => state.phase);
  const players = useGameStore((state) => state.players);
  const self = useGameStore(ownPlayer);
  const connected = useGameStore((state) => state.connected);
  const raceStartedAt = useGameStore((state) => state.raceStartedAt);
  const raceEndsAt = useGameStore((state) => state.raceEndsAt);
  const mode = useGameStore((state) => state.mode);
  const city = useMemo(() => (seed === undefined ? undefined : generateCity(seed)), [seed]);
  const orders = useMemo(() => (seed === undefined ? [] : generateOrders(seed)), [seed]);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (phase !== "racing") return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [phase]);

  if (phase !== "racing" || !city || !self) return connected ? null : <Reconnect />;
  const target = getObjective(mode, city, orders, self);
  const checkpoint = mode === "checkpoint";
  const free = mode === "free";
  const timed = mode === "rush";
  const total = checkpoint ? CHECKPOINT_COUNT : DELIVERIES_TO_WIN;
  const completed = checkpoint ? self.checkpointIndex : self.deliveries;
  const distance = target ? Math.hypot(target.stop[0] - ownPose.x, target.stop[1] - ownPose.z) : 0;
  const arrowAngle = target
    ? relativeBearing(ownPose.x, ownPose.z, cameraPose.yaw, target.stop[0], target.stop[1])
    : 0;
  const speed = Math.round(ownPose.speed * 3.6);
  const speedRatio = Math.min(100, (ownPose.speed / 52) * 100);
  const elapsed = raceStartedAt ? (now - raceStartedAt) / 1000 : 0;
  const remaining = raceEndsAt ? Math.max(0, Math.ceil((raceEndsAt - now) / 1000)) : 0;
  const district = CITY_ZONES.find(
    (zone) => Math.hypot(ownPose.x - zone.x, ownPose.z - zone.z) < 85,
  );
  const sortedPlayers = [...players].sort((a, b) =>
    checkpoint ? b.checkpointIndex - a.checkpointIndex : b.deliveries - a.deliveries,
  );
  const fast = ownPose.speed > 26 || drivingTelemetry.boosting || drivingTelemetry.rushTier > 0;
  const hasDriftCharge = drivingTelemetry.driftCharge > 1;
  const rushLabel = ["BUILDING", "LOCAL", "EXPRESS", "OVERNIGHT"][drivingTelemetry.driftTier];

  return (
    <div
      className={`arcade-hud ${fast ? "is-fast" : ""} ${drivingTelemetry.rushTier ? `is-rushing rush-tier-${drivingTelemetry.rushTier}` : ""} ${hasDriftCharge ? "has-drift-charge" : ""}`}
    >
      <div className="hud-speed-lines" aria-hidden="true" />

      <section className="order-progress hud-panel">
        <span>{checkpoint ? "GATES" : free ? "FREE DRIVE" : timed ? "DELIVERED" : "ORDER"}</span>
        <strong>
          {free ? "∞" : timed ? completed : `${Math.min(total, completed + 1)} / ${total}`}
        </strong>
        {free || timed ? (
          <small className="mode-progress-hint">
            {free ? "EXPLORE · DRIFT · JUMP" : "EVERY DELIVERY COUNTS"}
          </small>
        ) : (
          <div
            className="delivery-boxes"
            aria-label={`${completed} of ${total} ${checkpoint ? "checkpoints" : "deliveries"}`}
          >
            {Array.from({ length: total }, (_, index) => (
              <i
                key={index}
                className={
                  index < completed ? "is-complete" : index === completed ? "is-current" : ""
                }
              />
            ))}
          </div>
        )}
      </section>

      <button className="hud-leave" onClick={leaveRoom}>
        ← CHANGE MODE / LEAVE
      </button>

      <section
        className={`destination-banner ${checkpoint ? "is-checkpoint" : self.leg === "dropoff" ? "is-dropoff" : ""} ${free ? "is-exploring" : ""}`}
      >
        <div>
          {free
            ? "EXPLORING"
            : checkpoint
              ? completed + 1 === CHECKPOINT_COUNT
                ? "FINISH"
                : "NEXT GATE"
              : self.leg === "pickup"
                ? "PICK UP"
                : "DROP OFF"}{" "}
          <i /> <strong>{free ? (district?.name ?? "CITY STREETS") : target?.name}</strong>
        </div>
        {target && (
          <>
            <b>
              {Math.round(distance)}
              <small>m</small>
            </b>
            <span
              className="destination-arrow"
              style={{ transform: `rotate(${arrowAngle}rad)` }}
              aria-hidden="true"
            />
          </>
        )}
      </section>

      <section
        className={`race-panel hud-panel ${timed && remaining <= 30 ? "time-running-out" : ""}`}
      >
        <header>
          <strong>{free ? "CREW" : timed ? "TIME LEFT" : checkpoint ? "SPRINT" : "RACE"}</strong>
          <span aria-label={free ? "City open" : timed ? "Time remaining" : "Time elapsed"}>
            {free ? "OPEN" : formatTime(timed ? remaining : elapsed)}
          </span>
        </header>
        {sortedPlayers.slice(0, 5).map((player, index) => (
          <div className={player.id === self.id ? "is-self" : ""} key={player.id}>
            <b>
              {free
                ? "•"
                : timed
                  ? sortedPlayers.findIndex((entry) => entry.deliveries === player.deliveries) + 1
                  : index + 1}
            </b>
            <i style={{ background: player.color }} />
            <span>{player.name}</span>
            <em>
              {free
                ? "DRIVING"
                : timed
                  ? player.deliveries
                  : `${checkpoint ? player.checkpointIndex : player.deliveries}/${total}`}
            </em>
          </div>
        ))}
      </section>

      <section
        className="speed-cluster"
        style={
          {
            "--speed": `${Math.max(8, speedRatio)}%`,
            "--boost": `${drivingTelemetry.boost}%`,
          } as React.CSSProperties
        }
        aria-label={`${speed} kilometers per hour, ${Math.round(drivingTelemetry.boost)} percent boost`}
      >
        <div className="speed-dial">
          <strong>{speed}</strong>
          <span>KM/H</span>
        </div>
        <div className="boost-meter">
          <i />
          <b>BOOST</b>
        </div>
      </section>

      <Minimap
        city={city}
        target={target?.stop}
        dropoff={self.leg === "dropoff"}
        checkpoint={checkpoint}
      />

      <div className={`air-gauge ${drivingTelemetry.airborne ? "is-visible" : ""}`}>
        <b>AIR</b>
        <span>{drivingTelemetry.airTime.toFixed(1)}s</span>
      </div>

      <div
        className={`stunt-callout ${drivingTelemetry.callout ? "is-visible" : ""}`}
        aria-live="polite"
      >
        <strong>{drivingTelemetry.callout}</strong>
        <span>+{Math.round(drivingTelemetry.calloutScore)}</span>
      </div>
      <div className={`combo-strip ${drivingTelemetry.combo > 1 ? "is-visible" : ""}`}>
        <b>x{Math.max(1, drivingTelemetry.combo)}</b> COMBO
      </div>
      <div
        className={`rush-meter rush-tier-${drivingTelemetry.driftTier} ${hasDriftCharge ? "is-visible" : ""}`}
        style={
          {
            "--charge": `${Math.min(100, (drivingTelemetry.driftCharge / MAX_DRIFT_CHARGE) * 100)}%`,
          } as React.CSSProperties
        }
        role="meter"
        aria-hidden={!hasDriftCharge}
        aria-label={`Delivery rush charge, ${rushLabel}`}
        aria-valuemin={0}
        aria-valuemax={MAX_DRIFT_CHARGE}
        aria-valuenow={Math.round(drivingTelemetry.driftCharge)}
      >
        <header>
          <b>DRIFT CHARGE</b>
          <span>{rushLabel}</span>
        </header>
        <div>
          <i />
          <em />
          <em />
          <em />
        </div>
        <small>RELEASE SPACE</small>
      </div>
    </div>
  );
}

function Reconnect() {
  return (
    <div className="modal-backdrop">
      <section className="arcade-panel reconnect-panel">
        <h2>CONNECTION LOST</h2>
        <p>Your taxi is waiting at the curb.</p>
        <button className="arcade-button arcade-button-primary" onClick={rejoin}>
          REJOIN RACE
        </button>
        <button className="leave-room" onClick={leaveRoom}>
          RETURN TO MODES
        </button>
      </section>
    </div>
  );
}

export function WinnerScreen() {
  const standings = useGameStore((state) => state.standings) ?? [];
  const mode = useGameStore((state) => state.mode);
  const tied =
    mode === "rush" &&
    standings.length > 1 &&
    standings[0]?.deliveries === standings[1]?.deliveries;
  return (
    <div className="modal-backdrop winner-backdrop">
      <section className="arcade-panel winner-panel">
        <div className="panel-kicker">{GAME_MODES[mode].name.toUpperCase()}</div>
        <h1>{mode === "rush" ? "TIME'S UP!" : "RACE COMPLETE!"}</h1>
        {tied && <p className="result-tie">A SHARED FIRST PLACE!</p>}
        {standings.map((player, index) => (
          <div
            className={
              index === 0 || (tied && player.deliveries === standings[0]?.deliveries)
                ? "winner-row is-first"
                : "winner-row"
            }
            key={player.id}
          >
            <b>
              {mode === "rush"
                ? standings.findIndex((entry) => entry.deliveries === player.deliveries) + 1
                : index + 1}
            </b>
            <span>{player.name}</span>
            <em>
              {mode === "checkpoint"
                ? `${player.checkpointIndex} / ${CHECKPOINT_COUNT} GATES`
                : `${player.deliveries} DELIVERIES`}
            </em>
          </div>
        ))}
        <small>RETURNING TO THE GRID…</small>
        <button className="leave-room" onClick={leaveRoom}>
          CHOOSE ANOTHER MODE
        </button>
      </section>
    </div>
  );
}
