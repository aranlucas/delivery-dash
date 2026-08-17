import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useReducer, useRef } from "react";
import { trafficCars } from "../game/traffic";

/** Written by the render loop and sampled by the DOM overlay at 4Hz. */
const perfStats = { fps: 0, frameMs: 0, calls: 0, triangles: 0, traffic: 0 };

export function PerfProbe() {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    frames.current++;
    elapsed.current += dt;
    if (elapsed.current >= 0.25) {
      perfStats.fps = frames.current / elapsed.current;
      perfStats.frameMs = (elapsed.current / frames.current) * 1000;
      frames.current = 0;
      elapsed.current = 0;
    }
    // R3F resets renderer.info after a render, so this is the previous frame.
    perfStats.calls = gl.info.render.calls;
    perfStats.triangles = gl.info.render.triangles;
    perfStats.traffic = trafficCars.length;
  });
  return null;
}

export function PerfOverlay() {
  const [visible, toggle] = useReducer((value: boolean) => !value, false);
  const [, tick] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F3") return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [visible]);

  if (!visible) return null;
  const overBudget = perfStats.frameMs > 16.6 || perfStats.calls > 60;
  return (
    <aside className={`perf-overlay ${overBudget ? "is-over" : ""}`} aria-label="Render performance">
      <b>{perfStats.fps.toFixed(0)} FPS</b>
      <span>{perfStats.frameMs.toFixed(2)} ms</span>
      <span>{perfStats.calls} calls</span>
      <span>{(perfStats.triangles / 1000).toFixed(0)}k tris</span>
      <span>{perfStats.traffic} traffic</span>
    </aside>
  );
}
