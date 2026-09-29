import type { Context } from "koishi";
import { inspect } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const trace = new AsyncLocalStorage<string>();

export const withTrace = <T>(task: () => T): T => trace.run(randomUUID(), task);

export class InputError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
    public readonly params: object = {},
  ) {
    super(message);
  }
}

export const logError = (
  ctx: Context,
  err: unknown,
  operation: string,
  level: "warn" | "error" = "error",
  traceId = trace.getStore() ?? randomUUID(),
): string => {
  const error = err instanceof Error ? err : new Error(inspect(err));
  ctx
    .logger("kaeman")
    [level]("[trace-id=%s] %s\n%s", traceId, operation, error.stack ?? error.message);
  return traceId;
};
