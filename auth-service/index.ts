import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const JWT_ISSUER = process.env.JWT_ISSUER || "test-issuer";
const PORT = 3000;

console.log(`Auth service starting on port ${PORT}`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/auth/login" && req.method === "POST") {
      try {
        const body = (await req.json()) as {
          deviceId?: string;
          deviceSecret?: string;
        };
        const { deviceId, deviceSecret } = body;
        console.log(`Login attempt for device: ${deviceId}`);

        if (deviceId === "device-001" && deviceSecret === "secret-001") {
          const token = jwt.sign(
            {
              sub: deviceId,
              iss: JWT_ISSUER,
            },
            JWT_SECRET,
            { expiresIn: "1h" },
          );
          console.log("Token issued");
          return Response.json({ accessToken: token });
        }

        console.log("Login failed: Invalid credentials");
        return new Response("Invalid credentials", { status: 401 });
      } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});
