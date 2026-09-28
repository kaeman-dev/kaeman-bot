import type { Context } from "koishi";
import type { Config } from "#index.js";
import { h } from "koishi";
import { renderMinecraft } from "#service/skia/minecrafttext.js";
import type { Purse } from "#service/purse/index.js";
import { simulateVg } from "#service/simulator/vg/index.js";

export const registerVg = (ctx: Context, config: Config, purse: Purse) =>
  ctx
    .command("vg")
    .userFields(["id"])
    .action(async ({ session }) => {
      const result = await simulateVg(ctx, config);
      await purse.add(session!.user!.id, result.profit, "vg");
      await session!.send(h.image(await renderMinecraft(result), "image/png"));
    });
