import type { Context, Session } from "koishi";
import messages from "#assets/debug-messages.json";
import { logError, withTrace } from "#error/handle.js";
import {
  acknowledgeQQInteraction,
  createQQButton,
  createQQKeyboard,
  sendQQInputNotify,
  sendQQMarkdown,
} from "#service/qq/index.js";
import type { QQMarkdownOptions } from "#service/qq/index.js";

const sendCard = (session: Session, options: QQMarkdownOptions = {}) =>
  sendQQMarkdown(
    session,
    [
      ...messages.card[options.active || options.wakeup ? "active" : "passive"],
      messages.card.body,
      ...(options.active || options.wakeup ? [] : [`<@${session.userId}>`]),
    ].join("\n"),
    {
      keyboard: createQQKeyboard([
        messages.card.buttons.map(({ id, label, href }) =>
          createQQButton({ id, label, type: "link", data: href }),
        ),
      ]),
      ...options,
    },
  );

export const registerDebug = (ctx: Context) => {
  const debug = ctx.command("debug").action(async ({ session }) => {
    await sendCard(session!);
  });
  debug.subcommand(".active").action(async ({ session }) => {
    await sendCard(session!, { active: true });
  });
  debug.subcommand(".reference").action(async ({ session }) => {
    await sendCard(session!, { reference: session!.messageId });
  });
  debug.subcommand(".wakeup").action(async ({ session }) => {
    await sendCard(session!, { wakeup: true });
  });
  debug.subcommand(".keyboard").action(async ({ session }) => {
    const permission = { type: 0 as const, specify_user_ids: [session!.userId!] };
    await sendCard(session!, {
      keyboard: createQQKeyboard([
        [
          createQQButton({
            id: "kaeman_debug_whoami",
            label: session!.text("commands.debug.messages.commandButton"),
            type: "command",
            data: "/debug whoami",
            enter: true,
            reply: true,
            permission,
          }),
          createQQButton({
            id: "kaeman_debug_callback",
            label: session!.text("commands.debug.messages.callbackButton"),
            type: "callback",
            data: "kaeman:debug",
            permission,
            modal: { content: session!.text("commands.debug.messages.confirm") },
          }),
        ],
      ]),
    });
  });
  debug.subcommand(".prompt").action(async ({ session }) => {
    await sendCard(session!, {
      keyboard: undefined,
      promptKeyboard: createQQKeyboard([
        [
          createQQButton({
            id: "kaeman_debug_prompt",
            label: session!.text("commands.debug.messages.commandButton"),
            type: "command",
            data: "/debug whoami",
            enter: true,
          }),
        ],
      ]),
    });
  });
  debug.subcommand(".typing [seconds:posint]").action(async ({ session }, seconds = 5) => {
    await sendQQInputNotify(session!, seconds);
  });
  debug
    .subcommand(".whoami")
    .action(({ session }) =>
      session!.send(
        [
          `openid: ${session!.userId}`,
          `Name: ${session!.event.user?.name ?? "(unknown)"}`,
          `Avatar: ${session!.event.user?.avatar ?? "(unknown)"}`,
          `Session: ${session!.isDirect ? "DM" : "Group/Channel"}`,
          `Roles: ${session!.event.member?.roles?.map((role) => role.id).join(", ") || "(unknown)"}`,
        ].join("\n"),
      ),
    );

  ctx.on("interaction/button", (session) => {
    if (session.platform !== "qq" || session.event.button?.id !== "kaeman_debug_callback") return;
    return withTrace(async () => {
      try {
        await acknowledgeQQInteraction(session);
        await sendQQMarkdown(session, session.text("commands.debug.messages.callbackReceived"));
      } catch (error) {
        logError(ctx, error, "QQ debug callback failed");
      }
    });
  });
  return debug;
};
