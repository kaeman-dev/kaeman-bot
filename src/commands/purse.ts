import type { Context } from "koishi";
import type { Purse } from "#service/purse/index.js";
import { sendQQMarkdown } from "#service/qq/index.js";
import { compact, formatTime } from "#utils/index.js";

export const registerPurse = (ctx: Context, purse: Purse) =>
  ctx
    .command("purse")
    .userFields(["id"])
    .action(async ({ session }) => {
      const aid = session!.user!.id;

      const [balance, records] = await Promise.all([purse.get(aid), purse.history(aid)]);
      await sendQQMarkdown(
        session!,
        [
          session!.text(".title"),
          "",
          session!.text(".balance", { balance: compact.format(balance) }),
          "",
          ...(records.length
            ? [
                session!.text(".records"),
                "```purse",
                ...records.map(({ deltaCents, source, createdAt }) => {
                  return `- ${deltaCents > 0 ? "[+]" : deltaCents < 0 ? "[-]" : "[=]"} · ${source} · ${formatTime(createdAt.getTime()).slice(5, 16)} · ${compact.format(Math.abs(deltaCents) / 100)}`;
                }),
                "```",
              ]
            : [session!.text(".empty")]),
        ].join("\n"),
      );
    });
