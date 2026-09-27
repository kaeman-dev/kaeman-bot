import { Context, Schema } from "koishi";
import type { Command } from "koishi";
import { registerBingo } from "#commands/bingo.js";
import { registerCn } from "#commands/cn.js";
import { registerDebug } from "#commands/debug.js";
import { registerEd } from "#commands/ed.js";
import { registerPurse } from "#commands/purse.js";
import { registerVg } from "#commands/vg.js";
import * as database from "#database/index.js";
import { withTrace } from "#error/trace.js";
import { registerErrorHandling } from "#error/handle.js";
import { fetchPrices } from "#service/prices/index.js";
import { createPurse } from "#service/purse/index.js";
import { createFF1 } from "#utils/ff1/index.js";
import enUS from "#locales/en-US.json";
import zhCN from "#locales/zh-CN.json";

export const name = "kaeman";

export const inject = ["database"];

export interface Config {
  priceApiUrl: string;
  priceInterval: number;
  ff1Key: string;
}

export const Config: Schema<Config> = Schema.object({
  priceApiUrl: Schema.string()
    .default("https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json")
    .description("SkyHelperBot price API JSON"),
  priceInterval: Schema.number().min(1).default(5).description("Price refresh interval (minutes)"),
  ff1Key: Schema.string()
    .role("secret")
    .required()
    .description(
      "FF1 public UID encryption key, 64 hex characters (generate with openssl rand -hex 32)",
    ),
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

  registerErrorHandling(ctx);
  ctx.plugin(database);
  const purse = createPurse(ctx);
  const userIds = createFF1(config.ff1Key, "kaeman:user:v1");

  ctx.on("ready", () => {
    logger.info("kaeman ready: commands vg/cn/ed/purse/debug/bingo registered");
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
  commands.add(registerDebug(ctx.platform("qq", "qqguild")));
  commands.add(registerBingo(ctx));
  commands.add(registerPurse(ctx, purse, userIds, createFF1(config.ff1Key, "kaeman:purse:v1")));
};
