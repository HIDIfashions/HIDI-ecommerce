import { spawn } from "node:child_process";
import net from "node:net";

const children = new Set();
let shuttingDown = false;

function start(label, args) {
  const child = spawn("pnpm", args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;

    if (signal) {
      console.error(`[HIDI dev] ${label} stopped with signal ${signal}.`);
      shutdown(1);
      return;
    }

    if ((code ?? 0) !== 0) {
      console.error(`[HIDI dev] ${label} exited with code ${code}.`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

function portOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(host, port, timeoutMs) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await portOpen(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 100).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[HIDI dev] Starting API first…");
const api = start("API", ["--filter", "@hidi/api", "dev"]);

const ready = await waitForPort("127.0.0.1", 4000, 90000);
if (!ready) {
  console.error("[HIDI dev] API did not open port 4000 within 90 seconds. Check the API output above.");
  if (!api.killed) api.kill("SIGTERM");
  process.exit(1);
}

console.log("[HIDI dev] API is ready on port 4000. Starting web…");
start("Web", ["--filter", "@hidi/web", "dev"]);
