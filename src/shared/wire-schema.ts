import { z } from "zod";
import type { ServerMessage } from "./protocol.ts";

const modeSchema = z.enum(["delivery", "rush", "checkpoint", "free"]);

const phaseSchema = z.enum(["lobby", "countdown", "racing", "finished"]);

const legSchema = z.enum(["pickup", "dropoff"]);

const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  ready: z.boolean(),
  color: z.string(),
  deliveries: z.number(),
  orderIndex: z.number(),
  leg: legSchema,
  checkpointIndex: z.number(),
  spawnIndex: z.number(),
});

const standingSchema = playerSchema.pick({
  id: true,
  name: true,
  deliveries: true,
  checkpointIndex: true,
});

const deadlines = {
  countdownEndsAt: z.number().optional(),
  raceStartedAt: z.number().optional(),
  raceEndsAt: z.number().optional(),
};

export const attachmentSchema = z.object({ playerId: z.string() });

export const clientEnvelopeSchema = z.looseObject({ t: z.string() });

export const playerNameSchema = z.string();

export const positionSchema = z.object({
  t: z.literal("pos"),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  yaw: z.number(),
  speed: z.number(),
});

export const serverMessageSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("welcome"),
    id: z.string(),
    seed: z.number(),
    mode: modeSchema,
    phase: phaseSchema,
    players: z.array(playerSchema),
    ...deadlines,
  }),
  z.object({ t: z.literal("roster"), players: z.array(playerSchema) }),
  z.object({
    t: z.literal("phase"),
    mode: modeSchema,
    phase: phaseSchema,
    ...deadlines,
    standings: z.array(standingSchema).optional(),
  }),
  positionSchema.extend({ id: z.string() }),
  z.object({
    t: z.literal("progress"),
    id: z.string(),
    orderIndex: z.number(),
    leg: legSchema,
    deliveries: z.number(),
    checkpointIndex: z.number(),
  }),
  z.object({ t: z.literal("win"), standings: z.array(standingSchema) }),
  z.object({ t: z.literal("error"), message: z.string() }),
]);

export function decodeServerMessage(raw: string): ServerMessage {
  return serverMessageSchema.parse(JSON.parse(raw));
}
