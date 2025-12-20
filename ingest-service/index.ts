const PORT = 4000;

console.log(`Ingest Gateway (WebSocket) running on port ${PORT}`);

Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade the request to a WebSocket
    if (server.upgrade(req)) {
      return; // Bun handles the response
    }
    return new Response("Upgrade failed", { status: 400 });
  },
  websocket: {
    open(ws) {
      console.log("Client connected to Ingest Service");
    },
    message(ws, message) {
        if (message instanceof Buffer || message instanceof Uint8Array) {
            console.log(`Received binary data size: ${message.length} bytes`);
        } else {
            console.log(`Received text data: ${message}`);
        }
    },
    close(ws) {
      console.log("Client disconnected");
    },
  },
});
