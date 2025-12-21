import { fromBinary } from "@bufbuild/protobuf";
import { AudioPacketSchema } from "./audio_pb";

const PORT = 4000;

console.log(`Ingest Gateway (WebSocket) running on port ${PORT}`);

Bun.serve({
  port: PORT,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return;
    }
    return new Response("Upgrade failed", { status: 400 });
  },
  websocket: {
    open(ws) {
      console.log("Client connected to Ingest Service");
    },
    message(ws, message) {
      try {
        if (message instanceof Buffer || message instanceof Uint8Array) {
          // Decode the protobuf binary
          const packet = fromBinary(AudioPacketSchema, message);

          console.log(
            `[proto] Received Seq #${packet.sequenceId}, Data: ${packet.audioData.length} bytes, TS: ${packet.timestamp}`,
          );
        } else {
          console.log(`[warn] Received unexpected text data: ${message}`);
        }
      } catch (error) {
        console.error("[error] Failed to decode protobuf packet:", error);
      }
    },
    close(ws) {
      console.log("Client disconnected");
    },
  },
});
