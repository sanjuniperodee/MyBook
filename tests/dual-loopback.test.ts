import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PRELOAD = path.resolve(__dirname, "../deploy/dual-loopback.cjs");

function httpGet(host: string, port: number, urlPath = "/ping"): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: urlPath, agent: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
  });
}

describe("deploy/dual-loopback.cjs", () => {
  it("слушает оба 127.0.0.1 и ::1 при listen(port, 'localhost') и закрывает оба сокета", async () => {
    const child = spawn(
      process.execPath,
      [
        `--require=${PRELOAD}`,
        "-e",
        `
        const http = require("node:http");
        const server = http.createServer((req, res) => {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end(req.socket.localAddress + ":" + req.url);
        });
        server.listen(0, "localhost", () => {
          const addr = server.address();
          process.stdout.write("READY:" + addr.port + ":" + addr.address + "\\n");
        });
        process.stdin.on("data", () => {
          server.close(() => {
            process.stdout.write("CLOSED\\n");
            process.exit(0);
          });
        });
        `,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    try {
      const ready = await new Promise<string>((resolve, reject) => {
        let buf = "";
        child.stdout.on("data", (chunk) => {
          buf += chunk.toString();
          const line = buf.split("\n").find((l) => l.startsWith("READY:"));
          if (line) resolve(line);
        });
        child.stderr.on("data", (chunk) => reject(new Error(chunk.toString())));
        child.on("exit", (code) => reject(new Error(`child exited early: ${code}`)));
      });

      const port = Number(ready.split(":")[1]);
      expect(port).toBeGreaterThan(0);

      // Небольшая пауза на поднятие парного сокета
      await new Promise((r) => setTimeout(r, 50));

      const v4 = await httpGet("127.0.0.1", port, "/v4");
      expect(v4.status).toBe(200);
      expect(v4.body).toContain("/v4");

      const v6 = await httpGet("::1", port, "/v6");
      expect(v6.status).toBe(200);
      expect(v6.body).toContain("/v6");

      // Закрытие сервера освобождает оба loopback-сокета
      const closed = new Promise<void>((resolve) => {
        child.stdout.on("data", (chunk) => {
          if (chunk.toString().includes("CLOSED")) resolve();
        });
      });
      child.stdin.write("stop\n");
      await closed;

      await expect(httpGet("127.0.0.1", port)).rejects.toThrow();
      await expect(httpGet("::1", port)).rejects.toThrow();
    } finally {
      child.kill("SIGKILL");
    }
  });

  it("работает с ESM-точкой входа (как standalone server.js) и не трогает явный 127.0.0.1", async () => {
    const child = spawn(
      process.execPath,
      [
        `--require=${PRELOAD}`,
        "--input-type=module",
        "-e",
        `
        import http from "node:http";
        const s1 = http.createServer((req, res) => res.end("both:" + req.url));
        const s2 = http.createServer((req, res) => res.end("v4only:" + req.url));
        s1.listen(0, "localhost", () => {
          s2.listen(0, "127.0.0.1", () => {
            process.stdout.write("PORTS:" + s1.address().port + ":" + s2.address().port + "\\n");
          });
        });
        `,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    try {
      const ready = await new Promise<string>((resolve, reject) => {
        let buf = "";
        child.stdout.on("data", (chunk) => {
          buf += chunk.toString();
          const line = buf.split("\n").find((l) => l.startsWith("PORTS:"));
          if (line) resolve(line);
        });
        child.stderr.on("data", (chunk) => reject(new Error(chunk.toString())));
        child.on("exit", (code) => reject(new Error(`child exited early: ${code}`)));
      });

      const [, p1, p2] = ready.split(":").map(Number);
      await new Promise((r) => setTimeout(r, 50));

      expect((await httpGet("127.0.0.1", p1, "/esm")).body).toBe("both:/esm");
      expect((await httpGet("::1", p1, "/esm")).body).toBe("both:/esm");

      expect((await httpGet("127.0.0.1", p2, "/only")).body).toBe("v4only:/only");
      await expect(httpGet("::1", p2, "/only")).rejects.toThrow();
    } finally {
      child.kill("SIGKILL");
    }
  });
});
