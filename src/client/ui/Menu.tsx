import { useState } from "react";
import { connect } from "../net";
import { useGameStore } from "../store";

const randomCode = () =>
  Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(
    "",
  );

export function Menu({ onGameIntent }: { onGameIntent: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const error = useGameStore((state) => state.lastError);
  const go = (room: string) => {
    if (!name.trim()) return;
    onGameIntent();
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
          />
          <button
            className="arcade-button arcade-button-primary"
            type="submit"
            disabled={!name.trim()}
          >
            START A NEW RACE
          </button>
          <div className="join-divider">
            <span>OR JOIN A CREW</span>
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
              disabled={!name.trim() || code.length !== 4}
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
            <kbd>SPACE</kbd> DRIFT
          </span>
          <span>
            <kbd>SHIFT</kbd> BOOST
          </span>
        </div>
      </section>
    </main>
  );
}
