import type { Context } from "koishi";

export interface BingoGoal {
  name: string;
  lore: string;
  requiredAmount?: number;
  progress?: number;
}

export interface BingoResponse {
  success: boolean;
  id: number;
  name: string;
  start: number;
  end: number;
  modifier: string;
  lastUpdated: number;
  goals: BingoGoal[];
}

export const fetchBingo = async (ctx: Context): Promise<BingoResponse> => {
  const result = await ctx.http.get<BingoResponse>(
    "https://api.hypixel.net/v2/resources/skyblock/bingo",
    { responseType: "json" },
  );
  if (!result?.success || !Array.isArray(result.goals))
    throw new Error("Invalid Hypixel Bingo response");
  return result;
};

const cleanText = (text: string) =>
  text
    .replace(/§./gu, "")
    .replace(/[\uE000-\uF8FF]/gu, "")
    .replace(/[ \t]+/g, " ")
    .trim();

const wrapDescription = (text: string) =>
  cleanText(text)
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

const formatCell = (text: string) =>
  cleanText(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\|*_`])/g, "\\$1")
    .replace(/\r\n|\r|\n/g, "<br>");

export const formatBingo = (
  goals: readonly BingoGoal[],
  headers: readonly [string, string, string, string],
): string => {
  const sorted = goals.toSorted((a, b) => Number(b.progress != null) - Number(a.progress != null));
  return [
    `| ${headers.map(formatCell).join(" | ")} |`,
    "|---|---|---|---|",
    ...sorted.map((goal) => {
      const name = formatCell(goal.name);
      return `| ${goal.progress != null ? `**${name}**` : name} | ${formatCell(wrapDescription(goal.lore))} | ${goal.requiredAmount ?? "—"} | ${goal.progress ?? "—"} |`;
    }),
  ].join("\n");
};
