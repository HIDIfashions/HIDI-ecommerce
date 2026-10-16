import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { WalletWorkerService } from "../apps/api/src/wallet/wallet-worker.service.js";

function workerEnvironment(t: TestContext, value: string | undefined) {
  const prior = process.env.HIDI_WALLET_WORKER_ENABLED;
  if (value === undefined) delete process.env.HIDI_WALLET_WORKER_ENABLED;
  else process.env.HIDI_WALLET_WORKER_ENABLED = value;
  t.after(() => {
    if (prior === undefined) delete process.env.HIDI_WALLET_WORKER_ENABLED;
    else process.env.HIDI_WALLET_WORKER_ENABLED = prior;
  });
}

type BatchResult = { nextCursor: string | null; failed: { orderId: string; reason: string }[] };
const complete = (): BatchResult => ({ nextCursor: null, failed: [] });

function workerFixture(run: (after?: string, limit?: number) => Promise<BatchResult> = async () => complete(), walletEnabled = true) {
  const calls: [string | undefined, number | undefined][] = [];
  const logs: { kind: string; text: string }[] = [];
  let enabledChecks = 0;
  const worker = new WalletWorkerService({
    enabled: () => { enabledChecks += 1; return walletEnabled; },
    runMaturationBatch: async (after?: string, limit?: number) => { calls.push([after, limit]); return run(after, limit); },
  } as never);
  // Capture only application log messages; never open DB/network connections.
  (worker as any).logger = {
    warn: (text: string) => logs.push({ kind: "warn", text }),
    error: (text: string) => logs.push({ kind: "error", text }),
  };
  return { worker, calls, logs, enabledChecks: () => enabledChecks };
}

test("wallet worker is disabled by default and non-exact opt-in values create no timer or batch", async (t) => {
  workerEnvironment(t, undefined);
  const timers = t.mock.method(globalThis, "setInterval", (() => { throw new Error("must not schedule"); }) as any);
  for (const flag of [undefined, "", "false", "1", "TRUE", " true "]) {
    if (flag === undefined) delete process.env.HIDI_WALLET_WORKER_ENABLED;
    else process.env.HIDI_WALLET_WORKER_ENABLED = flag;
    const fixture = workerFixture();
    fixture.worker.onModuleInit();
    await fixture.worker.tick();
    fixture.worker.onModuleDestroy();
    assert.deepEqual(fixture.calls, []);
    assert.equal(fixture.enabledChecks(), 0);
    assert.deepEqual(fixture.logs, []);
  }
  assert.equal(timers.mock.callCount(), 0);
});

test("enabled worker still refuses to run when wallet spending/earning is disabled", async (t) => {
  workerEnvironment(t, "true");
  const fixture = workerFixture(undefined, false);
  await fixture.worker.tick();
  assert.equal(fixture.enabledChecks(), 1);
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.logs, []);
});

test("enabled worker schedules a bounded minute poll, unrefs its timer, and clears it on destroy", async (t) => {
  workerEnvironment(t, "true");
  let callback: (() => void) | undefined;
  let interval: number | undefined;
  let unrefs = 0;
  const token = { unref: () => { unrefs += 1; } };
  const schedule = t.mock.method(globalThis, "setInterval", ((fn: () => void, milliseconds: number) => {
    callback = fn; interval = milliseconds; return token;
  }) as any);
  const clear = t.mock.method(globalThis, "clearInterval", (() => undefined) as any);
  const fixture = workerFixture();
  fixture.worker.onModuleInit();
  assert.equal(schedule.mock.callCount(), 1);
  assert.equal(interval, 60_000);
  assert.equal(unrefs, 1);
  assert.deepEqual(fixture.calls, []);
  callback!();
  // The scheduled callback intentionally returns void; drain its Promise work.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(fixture.calls, [[undefined, 50]]);
  fixture.worker.onModuleDestroy();
  assert.equal(clear.mock.callCount(), 1);
  assert.equal(clear.mock.calls[0].arguments[0], token);
});

test("overlapping ticks never run simultaneous maturation batches", async (t) => {
  workerEnvironment(t, "true");
  let finish!: (result: BatchResult) => void;
  let first = true;
  const fixture = workerFixture(async () => {
    if (!first) return complete();
    first = false;
    return new Promise<BatchResult>((resolve) => { finish = resolve; });
  });
  const active = fixture.worker.tick();
  await fixture.worker.tick();
  await fixture.worker.tick();
  assert.deepEqual(fixture.calls, [[undefined, 50]]);
  finish({ nextCursor: "accrual_page_1", failed: [] });
  await active;
  await fixture.worker.tick();
  assert.deepEqual(fixture.calls, [[undefined, 50], ["accrual_page_1", 50]]);
});

test("cursor advances on successful pages, preserves position on a thrown failure, and restarts after exhaustion", async (t) => {
  workerEnvironment(t, "true");
  let attempt = 0;
  const fixture = workerFixture(async () => {
    attempt += 1;
    if (attempt === 1) return { nextCursor: "page_1", failed: [] };
    if (attempt === 2) return { nextCursor: "page_2", failed: [{ orderId: "private-order", reason: "PRIVATE_FAILURE_DETAIL" }] };
    if (attempt === 3) throw new Error("postgres://secret:password@private-db/customer@example.test");
    return complete();
  });
  for (let index = 0; index < 5; index += 1) await fixture.worker.tick();
  assert.deepEqual(fixture.calls, [[undefined, 50], ["page_1", 50], ["page_2", 50], ["page_2", 50], [undefined, 50]]);
  assert.deepEqual(fixture.logs, [
    { kind: "warn", text: "Wallet reconciliation needs attention for 1 record(s)" },
    { kind: "error", text: "Wallet reconciliation failed; retrying at the next scheduled pass" },
  ]);
  const logText = JSON.stringify(fixture.logs);
  for (const secret of ["private-order", "PRIVATE_FAILURE_DETAIL", "postgres://", "password", "customer@example.test"]) {
    assert.equal(logText.includes(secret), false);
  }
});

test("failed rows on a completed page are revisited on the next cursor cycle without logging their identities", async (t) => {
  workerEnvironment(t, "true");
  let attempt = 0;
  const fixture = workerFixture(async () => {
    attempt += 1;
    return attempt === 1 ? { nextCursor: null, failed: [{ orderId: "customer-order-123", reason: "database-secret" }] } : complete();
  });
  await fixture.worker.tick();
  await fixture.worker.tick();
  assert.deepEqual(fixture.calls, [[undefined, 50], [undefined, 50]]);
  assert.deepEqual(fixture.logs, [{ kind: "warn", text: "Wallet reconciliation needs attention for 1 record(s)" }]);
});

test("a rejected batch releases the busy guard so the next scheduled attempt can retry", async (t) => {
  workerEnvironment(t, "true");
  let reject!: (reason: unknown) => void;
  let attempt = 0;
  const fixture = workerFixture(async () => {
    attempt += 1;
    if (attempt === 1) return new Promise<BatchResult>((_resolve, fail) => { reject = fail; });
    return complete();
  });
  const pending = fixture.worker.tick();
  await fixture.worker.tick();
  assert.equal(fixture.calls.length, 1);
  reject(new Error("PRIVATE_DB_CONNECTION_DETAILS"));
  await assert.doesNotReject(pending);
  await fixture.worker.tick();
  assert.deepEqual(fixture.calls, [[undefined, 50], [undefined, 50]]);
  assert.equal(fixture.logs.length, 1);
  assert.equal(JSON.stringify(fixture.logs).includes("PRIVATE_DB_CONNECTION_DETAILS"), false);
});

test("turning worker flag off between ticks pauses processing without discarding its cursor", async (t) => {
  workerEnvironment(t, "true");
  const fixture = workerFixture(async () => ({ nextCursor: "resume_here", failed: [] }));
  await fixture.worker.tick();
  process.env.HIDI_WALLET_WORKER_ENABLED = "false";
  await fixture.worker.tick();
  assert.deepEqual(fixture.calls, [[undefined, 50]]);
  process.env.HIDI_WALLET_WORKER_ENABLED = "true";
  await fixture.worker.tick();
  assert.deepEqual(fixture.calls, [[undefined, 50], ["resume_here", 50]]);
});
