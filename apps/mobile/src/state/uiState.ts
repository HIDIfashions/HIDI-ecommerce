export type Freshness = "fresh" | "stale" | "offline-cache";

export type UiState<T> =
  | { kind: "loading" }
  | { kind: "content"; data: T; freshness: Freshness; refreshing: boolean }
  | { kind: "empty"; reason: string; action?: string }
  | { kind: "error"; errorKind: string; retryable: boolean; cachedData?: T };

export type MutationState<T> =
  | { kind: "idle" }
  | { kind: "submitting"; operationId: string }
  | { kind: "succeeded"; result: T }
  | { kind: "failed"; reason: string }
  | { kind: "unknown"; operationId: string };
