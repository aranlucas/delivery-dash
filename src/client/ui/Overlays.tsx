import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DELIVERIES_TO_WIN } from "../../shared/protocol";
import {
  BLOCK_SIZE,
  GRID_SIZE,
  ROAD_WIDTH,
  WORLD_HALF,
  generateCity,
  generateOrders,
  roadCenter,
  type City,
} from "../../shared/city";
import { drivingTelemetry, ownPose } from "../game/drivingState";
import { close, connect, rejoin, send } from "../net";
import { ownPlayer, remotePositions, useGameStore } from "../store";

const randomCode = () =>
  Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(
    "",
  );

export function Menu() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const error = useGameStore((state) => state.lastError);
  const go = (room: string) => {
    if (!name.trim()) return;
    connect(room.toUpperCase(), name.trim());
  };

  return (
    <main className="arcade-menu">
      <div className="menu-speed-lines" aria-hidden="true" />
      <div className="menu-road" aria-hidden="true" />
      <section className="menu-shell">
        <header className="arcade-logo" aria-label="Dash Rush">
          <span>DASH</span>
          <strong>RUSH</strong>
          <small>ARCADE DELIVERY RACING</small>
        </header>

        <form
          className="start-panel arcade-panel"
          onSubmit={(event) => {
            event.preventDefault();
            go(randomCode());
          }}
        >
          <label htmlFor="driver-name">DRIVER NAME</label>
          <input
            id="driver-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            autoComplete="nickname"
          />
          <button className="arcade-button arcade-button-primary" type="submit" disabled={!name.trim()}>
            START A NEW RACE
          </button>
          <div className="join-divider"><span>OR JOIN A CREW</span></div>
          <div className="join-row">
            <input
              aria-label="Room code"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "")
                    .slice(0, 4),
                )
              }
              placeholder="ROOM"
              inputMode="text"
            />
            <button
              className="arcade-button arcade-button-secondary"
              type="button"
              disabled={!name.trim() || code.length !== 4}
              onClick={() => go(code)}
            >
              JOIN
            </button>
          </div>
          {error ? <p className="arcade-error" role="alert">{error}</p> : null}
        </form>

        <div className="control-strip" aria-label="Driving controls">
          <span><kbd>WASD</kbd> DRIVE</span>
          <span><kbd>SPACE</kbd> DRIFT</span>
          <span><kbd>SHIFT</kbd> BOOST</span>
        </div>
      </section>
    </main>
  );
}

export function Lobby() {
  const phase = useGameStore((state) => state.phase);
  const players = useGameStore((state) => state.players);
  const room = useGameStore((state) => state.roomCode);
  const self = useGameStore(ownPlayer);
  const connected = useGameStore((state) => state.connected);
  const error = useGameStore((state) => state.lastError);
  if (phase !== "lobby") return null;

  return (
    <aside className="lobby-panel arcade-panel">
      <div className="panel-kicker">STARTING GRID</div>
      <div className="room-code"><small>ROOM</small><strong>{room}</strong></div>
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
          {self?.ready ? "CANCEL READY" : "READY TO RACE"}
        </button>
      ) : (
        <button className="arcade-button arcade-button-primary lobby-ready" onClick={rejoin}>
          REJOIN RACE
        </button>
      )}
      <p className="lobby-hint">FREE ROAM IS OPEN · WASD TO DRIVE</p>
      {error ? <p className="arcade-error" role="alert">{error}</p> : null}
      <button
        className="leave-room"
        onClick={() => {
          close();
          useGameStore.getState().reset();
        }}
      >
        LEAVE ROOM
      </button>
    </aside>
  );
}

const MINIMAP_SIZE = 190;
/** Top-down city plan with the expressways, the jump ramps, the target, and every driver. */
function Minimap({ city, target, dropoff }: { city: City; target?: [number, number]; dropoff: boolean }) {
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
    const toMap = (x: number, z: number): [number, number] => [
      (x + WORLD_HALF) * scale,
      (z + WORLD_HALF) * scale,
    ];
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
        const [px, pz] = toMap(x, z);
        context.fillRect(px - block / 2, pz - block / 2, block, block);
      }

      context.strokeStyle = "#39434f";
      context.lineWidth = Math.max(1.4, ROAD_WIDTH * scale);
      context.beginPath();
      for (let i = 0; i < GRID_SIZE; i++) {
        const [c] = toMap(roadCenter(i), 0);
        context.moveTo(c, 0);
        context.lineTo(c, MINIMAP_SIZE);
        context.moveTo(0, c);
        context.lineTo(MINIMAP_SIZE, c);
      }
      context.stroke();

      context.strokeStyle = "#ff9d33";
      context.lineWidth = 3;
      context.beginPath();
      for (const deck of city.decks) {
        const alongX = deck.maxX - deck.minX > deck.maxZ - deck.minZ;
        const midX = (deck.minX + deck.maxX) / 2,
          midZ = (deck.minZ + deck.maxZ) / 2;
        const [ax, az] = toMap(alongX ? deck.minX : midX, alongX ? midZ : deck.minZ);
        const [bx, bz] = toMap(alongX ? deck.maxX : midX, alongX ? midZ : deck.maxZ);
        context.moveTo(ax, az);
        context.lineTo(bx, bz);
      }
      context.stroke();

      context.fillStyle = "#ffd400";
      for (const ramp of city.ramps) {
        if (ramp.kind !== "kicker") continue;
        const [px, pz] = toMap(ramp.x, ramp.z);
        context.fillRect(px - 1.6, pz - 1.6, 3.2, 3.2);
      }

      if (target) {
        const [tx, tz] = toMap(target[0], target[1]);
        const pulse = 5 + Math.sin(time / 220) * 2;
        context.strokeStyle = dropoff ? "#65f578" : "#ff7a00";
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(tx, tz, pulse, 0, Math.PI * 2);
        context.stroke();
      }

      for (const [id, pose] of remotePositions) {
        if (id === selfId) continue;
        const [px, pz] = toMap(pose.x, pose.z);
        context.fillStyle = colors.get(id) ?? "#ffffff";
        context.beginPath();
        context.arc(px, pz, 2.8, 0, Math.PI * 2);
        context.fill();
      }

      // Own car as an arrow: world +z is map +y, so the heading maps straight across.
      const [sx, sz] = toMap(ownPose.x, ownPose.z);
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
  }, [city, target, dropoff, players, selfId]);

  return (
    <canvas className="minimap" ref={canvas} aria-hidden="true" />
  );
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function Countdown() {
  const phase = useGameStore((state) => state.phase);
  const ends = useGameStore((state) => state.countdownEndsAt);
  const started = useGameStore((state) => state.raceStartedAt);
  const [now, setNow] = useState(Date.now());
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
  const city = useMemo(() => (seed === undefined ? undefined : generateCity(seed)), [seed]);
  const orders = useMemo(() => (seed === undefined ? [] : generateOrders(seed)), [seed]);
  const [, tick] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    if (phase !== "racing") return;
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [phase]);

  if (phase !== "racing" || !city || !self) return connected ? null : <Reconnect />;
  const order = orders[self.orderIndex];
  const target =
    order &&
    (self.leg === "pickup" ? city.restaurants[order.restaurantId] : city.houses[order.houseId]);
  const distance = target ? Math.hypot(target.stop[0] - ownPose.x, target.stop[1] - ownPose.z) : 0;
  const arrowAngle = target
    ? ownPose.yaw - Math.atan2(target.stop[0] - ownPose.x, target.stop[1] - ownPose.z)
    : 0;
  const speed = Math.round(ownPose.speed * 3.6);
  const speedRatio = Math.min(100, (ownPose.speed / 52) * 100);
  const elapsed = raceStartedAt ? (Date.now() - raceStartedAt) / 1000 : 0;
  const sortedPlayers = [...players].sort(
    (a, b) => b.deliveries - a.deliveries || b.orderIndex - a.orderIndex,
  );
  const fast = ownPose.speed > 26 || drivingTelemetry.boosting;

  return (
    <div className={`arcade-hud ${fast ? "is-fast" : ""}`}>
      <div className="hud-speed-lines" aria-hidden="true" />

      <section className="order-progress hud-panel">
        <span>ORDER</span>
        <strong>{Math.min(DELIVERIES_TO_WIN, self.deliveries + 1)} / {DELIVERIES_TO_WIN}</strong>
        <div className="delivery-boxes" aria-label={`${self.deliveries} of ${DELIVERIES_TO_WIN} deliveries`}>
          {Array.from({ length: DELIVERIES_TO_WIN }, (_, index) => (
            <i key={index} className={index < self.deliveries ? "is-complete" : index === self.deliveries ? "is-current" : ""} />
          ))}
        </div>
      </section>

      <section className={`destination-banner ${self.leg === "dropoff" ? "is-dropoff" : ""}`}>
        <div>{self.leg === "pickup" ? "PICK UP" : "DROP OFF"} <i /> <strong>{target?.name}</strong></div>
        <b>{Math.round(distance)}<small>m</small></b>
        <span className="destination-arrow" style={{ transform: `rotate(${arrowAngle}rad)` }} aria-hidden="true" />
      </section>

      <section className="race-panel hud-panel">
        <header><strong>RACE</strong><span>{formatTime(elapsed)}</span></header>
        {sortedPlayers.slice(0, 5).map((player, index) => (
          <div className={player.id === self.id ? "is-self" : ""} key={player.id}>
            <b>{index + 1}</b>
            <i style={{ background: player.color }} />
            <span>{player.name}</span>
            <em>{player.deliveries}/{DELIVERIES_TO_WIN}</em>
          </div>
        ))}
      </section>

      <section
        className="speed-cluster"
        style={{ "--speed": `${Math.max(8, speedRatio)}%`, "--boost": `${drivingTelemetry.boost}%` } as React.CSSProperties}
        aria-label={`${speed} kilometers per hour, ${Math.round(drivingTelemetry.boost)} percent boost`}
      >
        <div className="speed-dial"><strong>{speed}</strong><span>KM/H</span></div>
        <div className="boost-meter"><i /><b>BOOST</b></div>
      </section>

      <Minimap city={city} target={target?.stop} dropoff={self.leg === "dropoff"} />

      <div className={`air-gauge ${drivingTelemetry.airborne ? "is-visible" : ""}`}>
        <b>AIR</b>
        <span>{drivingTelemetry.airTime.toFixed(1)}s</span>
      </div>

      <div className={`stunt-callout ${drivingTelemetry.callout ? "is-visible" : ""}`} aria-live="polite">
        <strong>{drivingTelemetry.callout}</strong>
        <span>+{Math.round(drivingTelemetry.driftScore)}</span>
      </div>
      <div className={`combo-strip ${drivingTelemetry.combo > 1 ? "is-visible" : ""}`}>
        <b>x{Math.max(1, drivingTelemetry.combo)}</b> COMBO
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
        <button className="arcade-button arcade-button-primary" onClick={rejoin}>REJOIN RACE</button>
      </section>
    </div>
  );
}

export function WinnerScreen() {
  const standings = useGameStore((state) => state.standings) ?? [];
  return (
    <div className="modal-backdrop winner-backdrop">
      <section className="arcade-panel winner-panel">
        <div className="panel-kicker">CHECKERED FLAG</div>
        <h1>RACE COMPLETE!</h1>
        {standings.map((player, index) => (
          <div className={index === 0 ? "winner-row is-first" : "winner-row"} key={player.id}>
            <b>{index + 1}</b><span>{player.name}</span><em>{player.deliveries} DELIVERIES</em>
          </div>
        ))}
        <small>RETURNING TO THE GRID…</small>
      </section>
    </div>
  );
}
