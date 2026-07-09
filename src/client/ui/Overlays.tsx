import { useEffect, useReducer, useState } from "react";
import { DELIVERIES_TO_WIN } from "../../shared/protocol";
import { generateCity, generateOrders } from "../../shared/city";
import { close, connect, rejoin, send } from "../net";
import { ownPose } from "../game/Car";
import { ownPlayer, useGameStore } from "../store";

const panel: React.CSSProperties = {
  background: "rgba(9,12,18,.87)",
  border: "1px solid #38404d",
  borderRadius: 12,
  padding: 18,
  boxShadow: "0 12px 40px #0008",
};
const button: React.CSSProperties = {
  background: "#eb1700",
  color: "white",
  border: 0,
  borderRadius: 7,
  padding: "10px 15px",
  fontWeight: 700,
  cursor: "pointer",
};
const randomCode = () =>
  Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(
    "",
  );
export function Menu() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const error = useGameStore((s) => s.lastError);
  const go = (room: string) => {
    if (!name.trim()) return;
    connect(room.toUpperCase(), name);
  };
  return (
    <main
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "white",
        fontFamily: "system-ui",
      }}
    >
      <section style={{ ...panel, width: 330 }}>
        <h1 style={{ margin: 0, color: "#eb1700" }}>Dash Rush</h1>
        <p style={{ color: "#b4bdcb" }}>Race deliveries. First to 3 wins.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your driver name"
          maxLength={20}
          style={input}
        />
        <button
          style={{ ...button, width: "100%", marginTop: 12 }}
          onClick={() => go(randomCode())}
        >
          Create room
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, "")
                  .slice(0, 4),
              )
            }
            placeholder="ROOM"
            style={{ ...input, flex: 1, textTransform: "uppercase" }}
          />
          <button style={button} onClick={() => code.length === 4 && go(code)}>
            Join
          </button>
        </div>
        {error && <p style={{ color: "#ff8f86" }}>{error}</p>}
      </section>
    </main>
  );
}
const input: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: 11,
  borderRadius: 7,
  border: "1px solid #46505f",
  background: "#151b24",
  color: "white",
};
export function Lobby() {
  const phase = useGameStore((s) => s.phase),
    players = useGameStore((s) => s.players),
    room = useGameStore((s) => s.roomCode),
    self = useGameStore(ownPlayer),
    connected = useGameStore((s) => s.connected),
    error = useGameStore((s) => s.lastError);
  if (phase !== "lobby") return null;
  return (
    <div style={{ position: "absolute", top: 18, left: 18, ...panel, minWidth: 230 }}>
      <small style={{ color: "#9aa6b7" }}>ROOM</small>
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 5 }}>{room}</div>
      <hr style={{ borderColor: "#303845" }} />
      {players.map((p) => (
        <div key={p.id} style={{ margin: "8px 0", color: p.color }}>
          {p.name}{" "}
          <span style={{ color: p.ready ? "#66e38b" : "#9aa6b7", float: "right" }}>
            {p.ready ? "READY" : "waiting"}
          </span>
        </div>
      ))}
      {connected ? (
        <button
          style={{ ...button, width: "100%", marginTop: 10 }}
          onClick={() => self && send({ t: "ready", ready: !self.ready })}
        >
          {self?.ready ? "Not ready" : "Ready"}
        </button>
      ) : (
        <button style={{ ...button, width: "100%", marginTop: 10 }} onClick={rejoin}>
          Rejoin room
        </button>
      )}
      <p style={{ color: "#9aa6b7", fontSize: 12, marginBottom: 0 }}>
        Free roam while you wait — WASD / arrows to drive.
      </p>
      {error && <p style={{ color: "#ff8f86", marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
export function Countdown() {
  const ends = useGameStore((s) => s.countdownEndsAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, []);
  const value = Math.max(1, Math.ceil(((ends ?? now) - now) / 1000));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        fontSize: 100,
        fontWeight: 900,
        textShadow: "0 4px 20px #000",
      }}
    >
      {value > 0 ? value : "GO!"}
    </div>
  );
}
export function HUD() {
  const seed = useGameStore((s) => s.seed),
    phase = useGameStore((s) => s.phase),
    players = useGameStore((s) => s.players),
    self = useGameStore(ownPlayer),
    connected = useGameStore((s) => s.connected);
  // ownPose mutates outside React — re-render every frame so the target arrow and speed track live
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    let id = 0;
    const loop = () => {
      tick();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  if (phase !== "racing" || !seed || !self) return connected ? null : <Reconnect />;
  const city = generateCity(seed),
    order = generateOrders(seed)[self.orderIndex],
    target =
      order &&
      (self.leg === "pickup" ? city.restaurants[order.restaurantId] : city.houses[order.houseId]);
  /* negated: screen x is mirrored vs world x when looking along +z */ const angle = target
    ? ownPose.yaw - Math.atan2(target.pos[0] - ownPose.x, target.pos[1] - ownPose.z)
    : 0;
  return (
    <>
      <div style={{ position: "absolute", top: 18, left: 18, ...panel }}>
        <b>
          {self.leg === "pickup" ? "🛍 Pick up from " : "🏠 Deliver to "}
          {target?.name}
        </b>
        <div style={{ marginTop: 7, color: "#f6b73c" }}>
          Deliveries {self.deliveries}/{DELIVERIES_TO_WIN}
        </div>
      </div>
      <div style={{ position: "absolute", right: 18, top: 18, ...panel, minWidth: 170 }}>
        <b>Leaderboard</b>
        {[...players]
          .sort((a, b) => b.deliveries - a.deliveries)
          .map((p) => (
            <div key={p.id} style={{ color: p.color, marginTop: 5 }}>
              {p.name} · {p.deliveries}
            </div>
          ))}
      </div>
      <div style={{ position: "absolute", bottom: 24, left: 24, ...panel }}>
        ⚡ {Math.round(ownPose.speed * 3.6)} km/h
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          fontSize: 46,
          transform: `translateX(-50%) rotate(${angle}rad)`,
          color: self.leg === "pickup" ? "#ff9d33" : "#38d986",
          textShadow: "0 2px 9px #000",
        }}
      >
        ▲
      </div>
    </>
  );
}
function Reconnect() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
      <div style={panel}>
        Disconnected.{" "}
        <button style={button} onClick={rejoin}>
          Rejoin room
        </button>
      </div>
    </div>
  );
}
export function WinnerScreen() {
  const standings = useGameStore((s) => s.standings) ?? [];
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "#070a10b8",
      }}
    >
      <section style={{ ...panel, minWidth: 280, textAlign: "center" }}>
        <h1 style={{ color: "#f6b73c" }}>Race complete!</h1>
        {standings.map((p, i) => (
          <p key={p.id}>
            {i + 1}. {p.name} — {p.deliveries} deliveries
          </p>
        ))}
        <small style={{ color: "#aeb8c6" }}>Back to lobby soon…</small>
      </section>
    </div>
  );
}
