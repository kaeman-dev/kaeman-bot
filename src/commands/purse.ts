import type { Context } from "koishi";
import { h } from "koishi";
import type { Purse } from "#service/purse/index.js";
import type { FF1Encoder } from "#utils/ff1/index.js";
import { renderMinecraft } from "#service/skia/minecrafttext.js";
import { compact } from "#utils/index.js";

export const registerPurse = (
  ctx: Context,
  purse: Purse,
  userIds: FF1Encoder,
  historyIds: FF1Encoder,
) => {
  const command = ctx
    .command("purse")
    .userFields(["id"])
    .action(async ({ session }) => {
      const balance = await purse.get(session!.user!.id);
      await session!.send(session!.text(".balance", { balance: compact.format(balance) }));
    });

  command
    .subcommand(".history [page:posint]")
    .userFields(["id"])
    .example("purse history 2")
    .action(async ({ session }, page = 1) => {
      const result = await purse.history(session!.user!.id, page);
      if (!result.records.length) return session!.text(".empty");
      const text = [
        `&6&lPurse History &7${result.page}/${result.pages}`,
        `&7User ID: ${userIds(session!.user!.id)} | UTC+8`,
        "",
        ...result.records.map(({ id, deltaCents, source, createdAt }) => {
          const sign = deltaCents > 0 ? "&a[+]" : deltaCents < 0 ? "&c[-]" : "&7[=]";
          const time = new Date(createdAt.getTime() + 8 * 60 * 60 * 1000)
            .toISOString()
            .slice(5, 16)
            .replace("T", " ");
          return `&7${time}\t&b| ${source}\t&8| #${historyIds(id)}\t&7| ${sign} ${compact.format(Math.abs(deltaCents) / 100)}`;
        }),
        "",
        ...(page > 1 ? [`&7Prev: purse history ${page - 1}`] : []),
        ...(page < result.pages ? [`&7Next: purse history ${page + 1}`] : []),
      ].join("\n");
      const image = await renderMinecraft({ type: "ch.png", text });
      await session!.send(h.image(image, "image/png"));
    });
  return command;
};
