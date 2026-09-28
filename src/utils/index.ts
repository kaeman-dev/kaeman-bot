import type { Context } from "koishi";
import type { Config } from "#index.js";
import type { Item } from "#service/simulator/index.js";
import { getPrices } from "#service/prices/index.js";

export type Prices = Record<string, number>;

export const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatTime = (timestamp: unknown) => {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "—";
  const date = new Date(timestamp + 8 * 60 * 60_000);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toISOString().slice(0, 19).replace("T", " ");
};

export const rollWeighted = <T>(items: readonly T[], weight: (item: T) => number): T => {
  let roll = Math.random() * items.reduce((sum, item) => sum + weight(item), 0);
  for (const item of items) {
    roll -= weight(item);
    if (roll < 0) return item;
  }
  return items.at(-1)!;
};

export const mergeItems = (items: Item[]): Item[] =>
  [...Map.groupBy(items, ({ id }) => id).values()].map((group) =>
    group.reduce((sum, item) => ({
      ...sum,
      quantity: sum.quantity + item.quantity,
    })),
  );

export const formatProfit = async (
  ctx: Context,
  config: Config,
  items: Item[],
  costIds: string[],
) => {
  const prices = await getPrices(ctx, config);

  if (!prices) return { text: "&4unknown", profit: 0 };
  const profit = items.reduce(
    (sum, { id, quantity }) => sum + (prices[id] ?? 0) * quantity,
    -costIds.reduce((sum, id) => sum + (prices[id] ?? 0), 0),
  );
  return { text: (profit <= 0 ? "&c" : "&6") + compact.format(profit), profit };
};

export const center = (text: string, width: number) =>
  text.length >= width ? text : " ".repeat(Math.floor((width - text.length) / 2)) + text;

const purseQueues = new WeakMap<Context, Promise<void>>();

export const withPurseQueue = <T>(ctx: Context, task: () => Promise<T>): Promise<T> => {
  const next = (purseQueues.get(ctx.root) ?? Promise.resolve()).then(task);
  purseQueues.set(
    ctx.root,
    next.then(
      () => {},
      () => {},
    ),
  );
  return next;
};
