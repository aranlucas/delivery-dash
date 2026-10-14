import type { Attachment } from "./room-core.ts";
import type { ServerMessage } from "../shared/protocol.ts";
import { decodeServerMessage } from "../shared/wire-schema.ts";

export class Socket {
  attachment: Attachment | null = null;
  messages: ServerMessage[] = [];
  onSend: (message: ServerMessage) => void = () => {};
  serializeAttachment(value: Attachment) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
  send(value: string) {
    const message = decodeServerMessage(value);
    this.messages.push(message);
    this.onSend(message);
  }
  close() {}
  webSocket() {
    return this;
  }
}
