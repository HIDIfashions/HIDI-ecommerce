import { spawn, spawnSync } from "node:child_process";

const cwd = new URL("..", import.meta.url).pathname;
const children = new Set();

function runOnce(command, args) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function start(command, args) {
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code && code !== 0) {
      shutdown(code);
    }
  });
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 50).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

runOnce("pnpm", ["exec", "tsc", "-p", "tsconfig.json"]);

start("pnpm", [
  "exec",
  "tsc",
  "-p",
  "tsconfig.json",
  "--watch",
  "--preserveWatchOutput",
]);

start(process.execPath, ["--watch", "dist/main.js"]);
