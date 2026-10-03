import { DurableObject } from "cloudflare:workers";
import { RaceRoomCore } from "./room-core.ts";

/** Platform adapter; room behavior depends only on the explicit storage/socket contracts. */
export class RaceRoom extends DurableObject<Env> {
  private readonly room: RaceRoomCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = new RaceRoomCore(ctx);
  }

  fetch(request: Request): Promise<Response> {
    return this.room.fetch(request);
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return this.room.webSocketMessage(socket, message);
  }

  webSocketClose(socket: WebSocket): Promise<void> {
    return this.room.webSocketClose(socket);
  }

  webSocketError(socket: WebSocket): Promise<void> {
    return this.room.webSocketError(socket);
  }

  alarm(): Promise<void> {
    return this.room.alarm();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = new URL(request.url).pathname.match(/^\/api\/room\/([A-Z]{4})\/ws$/);

    if (!match) return new Response("Not found", { status: 404 });

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket upgrade required", { status: 426 });

    return env.RACE_ROOM.getByName(match[1]!).fetch(request);
  },
} satisfies ExportedHandler<Env>;
