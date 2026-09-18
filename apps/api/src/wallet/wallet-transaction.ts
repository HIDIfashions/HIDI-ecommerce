import type { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";

/** Retry only transaction serialization/deadlock failures. No network work in fn. */
export async function withSerializableRetry<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  const attempts = Math.min(5, Math.max(1, Math.trunc(maxAttempts)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable", timeout: 15_000 });
    } catch (error) {
      const candidate = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
      const code = candidate.meta?.code ?? candidate.meta?.driverAdapterError?.cause?.originalCode;
      const retryable = candidate.code === "P2034" || code === "40001" || code === "40P01";
      if (!retryable || attempt === attempts - 1) throw error;
    }
  }
  throw new Error("Wallet transaction retry exhausted");
}
