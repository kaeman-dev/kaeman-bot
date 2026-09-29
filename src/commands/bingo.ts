import type { Context } from "koishi";
import { h } from "koishi";
import { Client } from "hypixel-api-reborn";
import type { Bingo, BingoData } from "hypixel-api-reborn";
import { sendQQMarkdown } from "#service/qq/index.js";
import { formatTime } from "#utils/index.js";

type BingoGoal = Bingo & { progress?: number };

type BingoResponse = Omit<BingoData, "goals"> & {
  name: string;
  start: number;
  end: number;
  modifier: string;
  lastUpdated: number;
  goals: BingoGoal[];
};

let hypixel: Client;

export const registerBingo = (ctx: Context) =>
  ctx.command("bingo").action(async ({ session }) => {
    hypixel ??= new Client("unused", { silent: true, checkForUpdates: false, rateLimit: "NONE" });
    const bingo = (await hypixel.getSkyblockBingo({ raw: true })) as unknown as BingoResponse;
    const { goals } = bingo;
    if (!goals.length) return session!.text(".empty");
    const clean = (text: string) =>
      text
        .replace(/§./gu, "")
        .replace(/[\uE000-\uF8FF]/gu, "")
        .replace(/[ \t]+/g, " ")
        .trim();
    const cell = (text: string) =>
      clean(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replace(/([\\|*_`])/g, String.raw`\$1`)
        .replace(/\r\n|\r|\n/g, "<br>");
    const wrap = (text: string) =>
      clean(text)
        .split(/\r\n|\r|\n/)
        .map((paragraph) => {
          const lines: string[] = [];
          let line = "";
          for (const word of paragraph.split(" ")) {
            if (line && line.length + word.length + 1 > 48) {
              lines.push(line);
              line = word;
            } else {
              line += `${line ? " " : ""}${word}`;
            }
          }
          lines.push(line);
          return lines.join("\n");
        })
        .join("\n");
    const sorted = goals.toSorted(
      (a, b) => Number(b.progress != null) - Number(a.progress != null),
    );
    const table = [
      `| ${[
        session!.text(".name"),
        session!.text(".description"),
        session!.text(".requiredAmount"),
        session!.text(".progress"),
      ]
        .map(cell)
        .join(" | ")} |`,
      "|---|---|---|---|",
      ...sorted.map((goal) => {
        const name = cell(goal.name);
        const displayName = goal.progress != null ? `**${name}**` : name;
        return `| ${displayName} | ${cell(wrap(goal.lore))} | ${goal.requiredAmount ?? "—"} | ${goal.progress ?? "—"} |`;
      }),
    ].join("\n");
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
    await sendQQMarkdown(session!, `${intro}\n\n${table}`);
  });
