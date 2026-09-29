import { Context, Schema } from "koishi";
import type { Command } from "koishi";
import { registerBingo } from "#commands/bingo.js";
import { registerCn } from "#commands/cn.js";
import { registerDebug } from "#commands/debug.js";
import { registerEd } from "#commands/ed.js";
import { registerPurse } from "#commands/purse.js";
import { registerVg } from "#commands/vg.js";
import * as database from "#database/index.js";
import { InputError, logError, withTrace } from "#error/handle.js";
import { fetchPrices } from "#service/prices/index.js";
import { createPurse } from "#service/purse/index.js";
import enUS from "#locales/en-US.json";
import zhCN from "#locales/zh-CN.json";

export const name = "kaeman";

export const inject = ["database"];

export interface Config {
  priceApiUrl: string;
  priceInterval: number;
}

export const Config: Schema<Config> = Schema.object({
  priceApiUrl: Schema.string()
    .default("https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json")
    .description("SkyHelperBot price API JSON"),
  priceInterval: Schema.number().min(1).default(5).description("Price refresh interval (minutes)"),
});

export const apply = (ctx: Context, config: Config) => {
  const logger = ctx.logger("kaeman");
  ctx.i18n.define("en-US", enUS);
  ctx.i18n.define("zh-CN", zhCN);
  logger.info(
    "kaeman starting (priceApiUrl=%s, refresh=%d min)",
    config.priceApiUrl,
    config.priceInterval,
  );

  const commands = new Set<Command>();
  const isKaeman = (command?: Command | null): boolean => {
    for (let cmd = command; cmd; cmd = cmd.parent) if (commands.has(cmd)) return true;
    return false;
  };

  ctx.middleware(
    (session, next) =>
      withTrace(async () => {
        const start = Date.now();
        try {
          return await next();
        } finally {
          const { argv } = session;
          if (argv?.command && isKaeman(argv.command))
            logger.debug("cmd /%s finished in %dms", argv.command.name, Date.now() - start);
        }
      }),
    true,
  );

  ctx.on("command-error", async (argv, error) => {
    if (error instanceof InputError) {
      ctx.logger("kaeman").info("input error in [%s]: %s", argv.command?.name, error.message);
      return argv
        .session!.send(error.path ? argv.session!.text(error.path, error.params) : error.message)
        .catch(() => {});
    }
    const traceId = logError(ctx, error, `[${argv.command?.name}] Command failed`);
    await argv.session!.send(traceId).catch((sendError) => {
      logError(ctx, sendError, "Failed to send trace ID", "error", traceId);
    });
  });
  ctx.plugin(database);
  const purse = createPurse(ctx);

  ctx.on("ready", () => {
    logger.info(
      "kaeman ready: commands %s registered",
      process.env.NODE_ENV === "development"
        ? "vg/cn/ed/purse/debug/bingo"
        : "vg/cn/ed/purse/bingo",
    );
  });

  ctx.on("dispose", () => {
    logger.info("kaeman disposed");
  });

  ctx.on("command/before-execute", (argv) => {
    if (!argv.command || !argv.session || !isKaeman(argv.command)) return;
    logger.info(
      "cmd /%s by %s (%s) in %s",
      argv.command.name,
      argv.session.username,
      argv.session.uid,
      argv.session.cid,
    );
  });

  ctx.setInterval(() => withTrace(() => fetchPrices(ctx, config)), config.priceInterval * 60_000);

  commands.add(registerVg(ctx, config, purse));
  commands.add(registerCn(ctx, config, purse));
  commands.add(registerEd(ctx, config, purse));
  if (process.env.NODE_ENV === "development")
    commands.add(registerDebug(ctx.platform("qq", "qqguild")));
  commands.add(registerBingo(ctx));
  commands.add(registerPurse(ctx, purse));
};
