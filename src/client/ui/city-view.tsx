import { useEffect } from "react";
import { CITY_ZONES } from "../../shared/city";
import { focusCityView, returnToDriving, useGameStore } from "../store";

export function CityViewButton() {
  return (
    <button
      className="city-view-button"
      onClick={(event) => {
        focusCityView();
        event.currentTarget.blur();
      }}
      title="Inspect the whole island (V)"
    >
      <kbd>V</kbd> CITY VIEW
    </button>
  );
}

export function CityViewOverlay() {
  const cameraMode = useGameStore((state) => state.cameraMode);
  const focus = useGameStore((state) => state.cityViewFocus);
  const phase = useGameStore((state) => state.phase);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      const state = useGameStore.getState();
      const key = event.key.toLowerCase();
      if (state.phase === "racing" && key === "v") {
        event.preventDefault();
        if (state.cameraMode === "city") returnToDriving();
        else focusCityView();
      } else if (state.cameraMode === "city") {
        if (key === "escape") {
          event.preventDefault();
          returnToDriving();
        } else if (key === "home") {
          event.preventDefault();
          focusCityView();
        }
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, []);
  if (cameraMode !== "city" || phase !== "racing") return null;
  return (
    <div className="city-view-overlay">
      <header className="city-view-header">
        <div>
          <strong>CITY VIEW</strong>
          <span>Your car is held in place · The session continues</span>
        </div>
        <button onClick={returnToDriving}>
          <kbd>ESC</kbd> BACK TO DRIVING
        </button>
      </header>
      <nav className="city-view-controls" aria-label="City camera views">
        <div className="city-view-presets">
          <button aria-pressed={focus === "overview"} onClick={() => focusCityView()}>
            <kbd>HOME</kbd> WHOLE ISLAND
          </button>
          <button aria-pressed={focus === "overhead"} onClick={() => focusCityView("overhead")}>
            OVERHEAD
          </button>
          <button aria-pressed={focus === "car"} onClick={() => focusCityView("car")}>
            MY CAR
          </button>
        </div>
        <div className="city-view-landmarks">
          {CITY_ZONES.map((zone) => (
            <button
              key={zone.id}
              aria-pressed={focus === zone.id}
              onClick={() => focusCityView(zone.id)}
            >
              {zone.name}
            </button>
          ))}
        </div>
        <p>
          Drag to orbit · Right-drag to pan · Scroll to zoom · Touch: pinch or drag with two fingers
        </p>
      </nav>
    </div>
  );
}
