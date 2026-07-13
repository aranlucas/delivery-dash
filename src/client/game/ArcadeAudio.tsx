import { useEffect } from "react";
import { useGameStore } from "../store";
import { drivingTelemetry, ownPose } from "./drivingState";

export function ArcadeAudio() {
  useEffect(() => {
    let context: AudioContext | undefined;
    let engine: OscillatorNode | undefined;
    let engineGain: GainNode | undefined;
    let engineFilter: BiquadFilterNode | undefined;
    let tire: OscillatorNode | undefined;
    let tireGain: GainNode | undefined;
    let timer = 0;

    const start = () => {
      if (context) {
        if (context.state === "suspended") void context.resume();
        return;
      }
      context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);

      engine = context.createOscillator();
      engine.type = "sawtooth";
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = "lowpass";
      engine.connect(engineFilter).connect(engineGain).connect(master);
      engine.start();

      tire = context.createOscillator();
      tire.type = "triangle";
      tire.frequency.value = 420;
      tireGain = context.createGain();
      tireGain.gain.value = 0;
      tire.connect(tireGain).connect(master);
      tire.start();

      timer = window.setInterval(() => {
        if (!context || !engine || !engineGain || !engineFilter || !tire || !tireGain) return;
        const now = context.currentTime;
        const speedRatio = Math.min(1, ownPose.speed / 52);
        const currentPhase = useGameStore.getState().phase;
        const active = currentPhase === "racing" || currentPhase === "lobby";
        engine.frequency.setTargetAtTime(48 + speedRatio * 96, now, 0.045);
        engineFilter.frequency.setTargetAtTime(
          260 + speedRatio * 920 + (drivingTelemetry.boosting ? 420 : 0),
          now,
          0.04,
        );
        engineGain.gain.setTargetAtTime(active ? 0.055 + speedRatio * 0.085 : 0, now, 0.08);
        tire.frequency.setTargetAtTime(360 + speedRatio * 190, now, 0.035);
        tireGain.gain.setTargetAtTime(drivingTelemetry.drifting ? 0.045 : 0, now, 0.035);
      }, 50);
    };

    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      window.clearInterval(timer);
      engine?.stop();
      tire?.stop();
      void context?.close();
    };
  }, []);

  return null;
}
