import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 3000;

function clearPort(portNumber) {
  // Codespaces can leave a Next dev process alive in another terminal. Make
  // `pnpm dev:web` deterministic by gracefully replacing the old listener.
  const result = spawnSync(
    "bash",
    [
      "-lc",
      `pids="$(lsof -ti :${portNumber} 2>/dev/null || true)"; if [ -n "$pids" ]; then kill $pids 2>/dev/null || true; sleep 1; pids="$(lsof -ti :${portNumber} 2>/dev/null || true)"; if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi; fi`,
    ],
    { cwd, stdio: "inherit" },
  );
  if (result.error) throw result.error;
}

clearPort(port);

const child = spawn(
  "pnpm",
  ["exec", "next", "dev", "--webpack", "-H", "0.0.0.0", "-p", String(port)],
  { cwd, stdio: "inherit" },
);

function stop(signal) {
  if (!child.killed) child.kill(signal);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
