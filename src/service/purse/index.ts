import type { Context } from "koishi";
import { compact, withPurseQueue } from "#utils/index.js";

export type Purse = ReturnType<typeof createPurse>;

export const createPurse = (ctx: Context) => {
  const logger = ctx.logger("kaeman");

  return {
    async history(aid: number) {
      return withPurseQueue(ctx, () =>
        ctx.database.get(
          "kaeman.user.purse.history",
          { aid },
          {
            sort: { id: "desc" },
            limit: 10,
          },
        ),
      );
    },

    async get(aid: number): Promise<number> {
      return withPurseQueue(ctx, async () => {
        const [user] = await ctx.database.get("kaeman.user", { aid }, ["purseCents"]);
        const balance = (user?.purseCents ?? 0) / 100;
        logger.debug("purse get aid=%d balance=%s", aid, compact.format(balance));
        return balance;
      });
    },

    async add(aid: number, profit: number, source: "cn" | "ed" | "vg"): Promise<void> {
      const deltaCents = Math.round(profit * 100);
      await withPurseQueue(ctx, () =>
        ctx.database.transact(async (tx) => {
          const [user] = await tx.get("kaeman.user", { aid });
          const before = (user?.purseCents ?? 0) / 100;
          const purseCents = (user?.purseCents ?? 0) + deltaCents;
          await tx.upsert("kaeman.user", [{ aid, purseCents }]);
          await tx.create("kaeman.user.purse.history", {
            aid,
            deltaCents,
            source,
            createdAt: new Date(),
          });
          logger.info(
            "purse update aid=%d %s%s via %s: %s -> %s",
            aid,
            profit < 0 ? "" : "+",
            compact.format(profit),
            source,
            compact.format(before),
            compact.format(purseCents / 100),
          );
        }),
      );
    },
  };
};
