import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 3000;

function clearPort(portNumber) {
  // Killing only the current listener is not enough in Codespaces: an orphaned
  // Next dev parent can survive and immediately bind the port again. Stop the
  // stale Next process first, then clear any remaining listener and wait until
  // the OS confirms the port is actually free before starting a new server.
  const result = spawnSync(
    "bash",
    [
      "-lc",
      [
        `pkill -TERM -f '[n]ext dev -H 0.0.0.0 -p ${portNumber}' 2>/dev/null || true`,
        "sleep 0.4",
        `pids="$(lsof -tiTCP:${portNumber} -sTCP:LISTEN 2>/dev/null || true)"`,
        `if [ -n "$pids" ]; then kill -TERM $pids 2>/dev/null || true; fi`,
        "for i in 1 2 3 4 5 6 7 8 9 10; do",
        `  pids="$(lsof -tiTCP:${portNumber} -sTCP:LISTEN 2>/dev/null || true)"`,
        `  if [ -z "$pids" ]; then exit 0; fi`,
        "  sleep 0.25",
        "done",
        `pids="$(lsof -tiTCP:${portNumber} -sTCP:LISTEN 2>/dev/null || true)"`,
        `if [ -n "$pids" ]; then kill -KILL $pids 2>/dev/null || true; sleep 0.25; fi`,
        `pids="$(lsof -tiTCP:${portNumber} -sTCP:LISTEN 2>/dev/null || true)"`,
        `if [ -n "$pids" ]; then echo "Unable to free port ${portNumber}; remaining PID(s): $pids" >&2; exit 1; fi`,
      ].join("\n"),
    ],
    { cwd, stdio: "inherit" },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

clearPort(port);

const child = spawn(
  "pnpm",
  ["exec", "next", "dev", "-H", "0.0.0.0", "-p", String(port)],
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
