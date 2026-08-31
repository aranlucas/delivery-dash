import { useEffect } from "react";
import { useGameStore } from "../store";
import { drivingTelemetry, ownPose } from "./drivingState";

function playRewardStinger(
  context: AudioContext,
  destination: AudioNode,
  tier: number,
) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = tier >= 3 ? "sawtooth" : "square";
  oscillator.frequency.setValueAtTime(210 + tier * 70, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    430 + tier * 150,
    now + 0.13,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  oscillator.connect(gain).connect(destination);
  oscillator.addEventListener(
    "ended",
    () => {
      oscillator.disconnect();
      gain.disconnect();
    },
    { once: true },
  );
  oscillator.start(now);
  oscillator.stop(now + 0.21);
}

export function ArcadeAudio() {
  useEffect(() => {
    let context: AudioContext | undefined;
    let master: GainNode | undefined;
    let engine: OscillatorNode | undefined;
    let engineGain: GainNode | undefined;
    let engineFilter: BiquadFilterNode | undefined;
    let tire: OscillatorNode | undefined;
    let tireGain: GainNode | undefined;
    let heardReward = drivingTelemetry.rewardSequence;
    let timer = 0;

    const start = () => {
      if (context) {
        if (context.state === "suspended") void context.resume();
        return;
      }
      context = new AudioContext();
      master = context.createGain();
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
        if (
          !context ||
          !master ||
          !engine ||
          !engineGain ||
          !engineFilter ||
          !tire ||
          !tireGain
        )
          return;
        const now = context.currentTime;
        const speedRatio = Math.min(1, ownPose.speed / 52);
        const currentPhase = useGameStore.getState().phase;
        const active = currentPhase === "racing" || currentPhase === "lobby";
        engine.frequency.setTargetAtTime(48 + speedRatio * 96, now, 0.045);
        engineFilter.frequency.setTargetAtTime(
          260 +
            speedRatio * 920 +
            (drivingTelemetry.boosting ? 420 : 0) +
            drivingTelemetry.rushTier * 160,
          now,
          0.04,
        );
        engineGain.gain.setTargetAtTime(
          active ? 0.055 + speedRatio * 0.085 : 0,
          now,
          0.08,
        );
        tire.frequency.setTargetAtTime(360 + speedRatio * 190, now, 0.035);
        tireGain.gain.setTargetAtTime(
          drivingTelemetry.drifting ? 0.045 : 0,
          now,
          0.035,
        );
        if (heardReward !== drivingTelemetry.rewardSequence) {
          heardReward = drivingTelemetry.rewardSequence;
          playRewardStinger(context, master, drivingTelemetry.rewardTier);
        }
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
