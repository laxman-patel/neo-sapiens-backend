import { spawn } from "bun";
import { AudioPacketSchema } from "./audio_pb";
import { unlink } from "node:fs/promises";
import { create, toBinary } from "@bufbuild/protobuf";

const CONFIG = {
  inputPath: "./input.wav",
  wsUrl: "ws://localhost:8080",
  authUrl: "http://localhost:8080/auth/login",
  deviceId: "device-001",
  deviceSecret: "secret-001",
  bufferDir: "./buffer",
  reconnectInterval: 3000,
};

// Ensure buffer directory exists (Native Bun Spawn)
await Bun.spawn(["mkdir", "-p", CONFIG.bufferDir]).exited;

export class StreamManager {
  private socket: WebSocket | null = null;
  private accessToken: string | null = null;
  private sequenceId = 0;
  private isFlushing = false;

  constructor() {
    this.connect();
    this.startFFmpeg();
  }

  private async connect() {
    // 1. Authenticate first
    try {
      this.accessToken = await this.login();
    } catch (e) {
      console.log("[net] Auth failed, retrying in 3s...");
      setTimeout(() => this.connect(), CONFIG.reconnectInterval);
      return;
    }

    // 2. Connect with token
    console.log("[net] Connecting...");
    const wsUrlWithToken = `${CONFIG.wsUrl}?token=${this.accessToken}`;
    this.socket = new WebSocket(wsUrlWithToken);

    this.socket.addEventListener("open", async () => {
      console.log("[net] Online");
      this.flushOfflineBuffer();
    });

    this.socket.addEventListener("close", () => {
      console.log("[net] Disconnected");
      setTimeout(() => this.connect(), CONFIG.reconnectInterval);
    });
  }

  private async login(): Promise<string> {
    console.log("[auth] Logging in...");
    try {
      const response = await fetch(CONFIG.authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: CONFIG.deviceId,
          deviceSecret: CONFIG.deviceSecret,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Login failed: ${response.status} ${text}`);
      }

      const data = (await response.json()) as { accessToken: string };
      console.log("[auth] Login successful");
      return data.accessToken;
    } catch (error) {
      console.error("[auth] Error:", error);
      throw error;
    }
  }

  public async handleChunk(chunk: Uint8Array) {
    this.sequenceId++;

    const packet = create(AudioPacketSchema, {
      sequenceId: this.sequenceId,
      audioData: chunk,
      timestamp: BigInt(Date.now()),
    });

    const binaryData = toBinary(AudioPacketSchema, packet);

    if (this.socket?.readyState === WebSocket.OPEN && !this.isFlushing) {
      this.socket.send(binaryData);
      process.stdout.write(`\r[live] Sent Seq #${this.sequenceId}  `);
    } else {
      await this.saveToDisk(this.sequenceId, binaryData);
    }
  }

  private async saveToDisk(id: number, data: Uint8Array) {
    const filename = `${CONFIG.bufferDir}/${id.toString().padStart(10, "0")}.bin`;

    // Bun.write is up to 3x faster than fs.writeFile
    await Bun.write(filename, data);

    process.stdout.write(`\r[disk] Buffered Seq #${id} to ${filename}  `);
  }

  private async flushOfflineBuffer() {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      // Use Bun.Glob to scan directory natively
      const glob = new Bun.Glob("*.bin");
      const files: string[] = [];

      // scan() returns an AsyncIterator
      for await (const file of glob.scan(CONFIG.bufferDir)) {
        files.push(file);
      }

      // Sort is crucial because Glob scan order is not guaranteed
      files.sort();

      if (files.length > 0) {
        console.log(
          `\n[flush] Found ${files.length} buffered packets. Uploading...`,
        );
      }

      for (const file of files) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) break;

        const path = `${CONFIG.bufferDir}/${file}`;

        // Bun.file() maps the file into memory lazily (very efficient)
        const fileRef = Bun.file(path);
        const fileData = await fileRef.bytes(); // Get raw Uint8Array

        this.socket.send(fileData);

        // Delete the file
        await unlink(path);

        process.stdout.write(`\r[flush] Recovered ${file}   `);
      }
    } catch (error) {
      console.error("[flush] Error:", error);
    } finally {
      this.isFlushing = false;
    }
  }

  private async startFFmpeg() {
    const ffmpegCmd = [
      "ffmpeg",
      "-re",
      "-i",
      CONFIG.inputPath,
      "-af",
      "silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-40dB",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-f",
      "ogg",
      "pipe:1",
    ];

    const proc = spawn(ffmpegCmd, { stdout: "pipe", stderr: "ignore" });

    if (!proc.stdout) return;
    for await (const chunk of proc.stdout) {
      await this.handleChunk(chunk);
    }
  }
}

new StreamManager();
