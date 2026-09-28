import type { Context } from "koishi";
import { h } from "koishi";
import { fetchBingo, formatBingo } from "#service/bingo/index.js";
import { sendQQMarkdown } from "#service/qq/index.js";
import { formatTime } from "#utils/index.js";

export const registerBingo = (ctx: Context) =>
  ctx.command("bingo", "Show current SkyBlock Bingo goals").action(async ({ session }) => {
    const bingo = await fetchBingo(ctx);
    const { goals } = bingo;
    if (!goals.length) return session!.text(".empty");
    const intro = h.unescape(
      session!.text(".intro", {
        name: bingo.name ?? "Bingo",
        id: bingo.id ?? "—",
        modifier: bingo.modifier ?? "—",
        start: formatTime(bingo.start),
        end: formatTime(bingo.end),
        lastUpdated: formatTime(bingo.lastUpdated),
      }),
    );
    const table = formatBingo(goals, [
      session!.text(".name"),
      session!.text(".description"),
      session!.text(".requiredAmount"),
      session!.text(".progress"),
    ]);
    const content = `${intro}\n\n${table}`;
    if (session!.platform === "qq" || session!.platform === "qqguild") {
      await sendQQMarkdown(session!, content);
    } else {
      await session!.send(h.text(content));
    }
  });
