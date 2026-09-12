import { useState, type CSSProperties } from "react";
import { DEFAULT_MODE, GAME_MODES, GAME_MODE_IDS, type GameMode } from "../../shared/gameModes";
import { connect } from "../net";
import { useGameStore } from "../store";

const randomCode = () =>
  Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(
    "",
  );

export function Menu({ onGameIntent }: { onGameIntent: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<GameMode>(DEFAULT_MODE);
  const error = useGameStore((state) => state.lastError);
  const connecting = useGameStore((state) => state.connecting);
  const go = (room: string) => {
    if (!name.trim() || connecting) return;
    onGameIntent();
    connect(room.toUpperCase(), name.trim(), mode);
  };

  return (
    <main className="arcade-menu">
      <div className="menu-speed-lines" aria-hidden="true" />
      <div className="menu-road" aria-hidden="true" />
      <section className="menu-shell">
        <header className="arcade-logo" aria-label="Dash Rush">
          <span>DASH</span>
          <strong>RUSH</strong>
          <small>ONE CITY. FOUR WAYS TO PLAY.</small>
        </header>

        <form
          className="start-panel arcade-panel"
          onPointerEnter={onGameIntent}
          onFocusCapture={onGameIntent}
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
            disabled={connecting}
          />
          <fieldset className="mode-picker" disabled={connecting}>
            <legend>CHOOSE YOUR MODE</legend>
            <div className="mode-options">
              {GAME_MODE_IDS.map((id, index) => (
                <label
                  className={`mode-option ${mode === id ? "is-selected" : ""}`}
                  key={id}
                  style={{ "--mode-color": GAME_MODES[id].color } as CSSProperties}
                >
                  <input
                    type="radio"
                    name="game-mode"
                    value={id}
                    checked={mode === id}
                    onChange={() => setMode(id)}
                  />
                  <span className="mode-number" aria-hidden="true">
                    0{index + 1}
                  </span>
                  <strong>{GAME_MODES[id].name}</strong>
                  <small>{GAME_MODES[id].tagline}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mode-description" aria-live="polite">
            {GAME_MODES[mode].description}
          </p>
          <button
            className="arcade-button arcade-button-primary"
            type="submit"
            disabled={!name.trim() || connecting}
          >
            {connecting ? "CONNECTING…" : mode === "free" ? "EXPLORE THE CITY" : "START A NEW RACE"}
          </button>
          <div className="join-divider">
            <span>JOIN A CREW · PLAY THEIR MODE</span>
          </div>
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
              disabled={!name.trim() || code.length !== 4 || connecting}
              onClick={() => go(code)}
            >
              JOIN
            </button>
          </div>
          {error ? (
            <p className="arcade-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <div className="control-strip" aria-label="Driving controls">
          <span>
            <kbd>WASD</kbd> DRIVE
          </span>
          <span>
            <kbd>SPACE</kbd> DRIFT · RELEASE TO RUSH
          </span>
          <span>
            <kbd>SHIFT</kbd> BOOST
          </span>
        </div>
      </section>
    </main>
  );
}
