import type { Context } from "koishi";
import type { Config } from "#index.js";
import { h } from "koishi";
import { renderMinecraft } from "#service/skia/minecrafttext.js";
import type { Purse } from "#service/purse/index.js";
import { simulateEd } from "#service/simulator/ed/index.js";
import example from "#assets/ender-dragon-example.json";

const helpExample = JSON.stringify(example, null, 2);

export const registerEd = (ctx: Context, config: Config, purse: Purse) =>
  ctx
    .command("ed [args:text]")
    .alias("edragsim", "eg")
    .userFields(["id"])
    .action(async ({ session }, args) => {
      if (args?.trim().toLowerCase() === "help")
        return await session!.send(`${session!.text(".helpIntro")}\n${helpExample}`);
      const result = await simulateEd(ctx, config, args ?? "");
      await purse.add(session!.user!.id, result.profit, "ed");
      await session!.send(h.image(await renderMinecraft(result), "image/png"));
    });
