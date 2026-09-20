import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(cwd, "dist/main.js");
const children = new Set();

function runOnce(command, args) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function start(command, args) {
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  children.add(child);
  child.on("exit", (code) => {
    children.delete(child);
    if (!shuttingDown && code && code !== 0) shutdown(code);
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

// A stale incremental cache can tell TypeScript that the project is up to date
// even after dist/ has been removed. Development must always start from a real
// emitted entrypoint, otherwise Node watches a file that does not exist.
rmSync(resolve(cwd, "dist"), { recursive: true, force: true });
rmSync(resolve(cwd, "tsconfig.tsbuildinfo"), { force: true });

runOnce("pnpm", [
  "exec",
  "tsc",
  "-p",
  "tsconfig.json",
  "--incremental",
  "false",
]);

if (!existsSync(entry)) {
  throw new Error(`TypeScript completed without creating ${entry}`);
}

start("pnpm", [
  "exec",
  "tsc",
  "-p",
  "tsconfig.json",
  "--watch",
  "--incremental",
  "false",
  "--preserveWatchOutput",
]);

start(process.execPath, ["--watch", entry]);
