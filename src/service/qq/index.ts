import { h, type Session } from "koishi";
import type { QQKeyboard } from "#service/qq/keyboard.js";

export { createQQButton, createQQKeyboard } from "#service/qq/keyboard.js";
export type { QQButtonOptions, QQButton, QQKeyboard } from "#service/qq/keyboard.js";

export interface QQMessageResult {
  id?: string;
  timestamp?: string;
  audit_id?: string;
  audit_tips?: string;
}

interface QQInternal {
  sendMessage(id: string, data: object): Promise<QQMessageResult>;
  sendPrivateMessage?(id: string, data: object): Promise<QQMessageResult>;
  sendDM?(id: string, data: object): Promise<QQMessageResult>;
  acknowledgeInteraction?(id: string, data: { code: number }): Promise<unknown>;
}

interface QQEvent {
  id?: string;
  d?: { id?: string; chat_type?: number; guild_id?: string };
}

type QQSession = Session & {
  seq?: number;
  qq?: QQEvent;
  qqguild?: QQEvent;
};

export interface QQSendOptions {
  active?: boolean;
  wakeup?: boolean;
  reference?: string;
}

export interface QQMarkdownOptions extends QQSendOptions {
  keyboard?: QQKeyboard;
  promptKeyboard?: QQKeyboard;
  verifyImages?: boolean;
}

export type QQMarkdown =
  | string
  | {
      custom_template_id: string;
      params: { key: string; values: string[] }[];
    };

export const getQQInternal = (session: Session): QQInternal => {
  if (session.platform !== "qq" && session.platform !== "qqguild")
    throw new Error("QQ official bot required");
  const internal = (session.bot as Session["bot"] & { internal?: QQInternal }).internal;
  if (!internal) throw new Error("QQ adapter unavailable");
  return internal;
};

export const requireQQDirect = (session: Session): QQInternal => {
  const internal = getQQInternal(session);
  if (session.platform !== "qq" || !session.isDirect) throw new Error("QQ direct message required");
  return internal;
};

export const sendQQMarkdown = async (
  session: Session,
  markdown: QQMarkdown,
  options: QQMarkdownOptions = {},
): Promise<QQMessageResult> => {
  if (session.platform !== "qq" && session.platform !== "qqguild") {
    if (typeof markdown !== "string") throw new Error("QQ official bot required");
    await session.send(h.text(markdown));
    return {};
  }

  let internal = getQQInternal(session);
  const channelInteraction =
    session.type === "interaction/button" && (session as QQSession).qq?.d?.chat_type === 3;
  const guild = session.platform === "qqguild" || channelInteraction;
  if (channelInteraction) {
    const guildBot = (
      session.bot as Session["bot"] & {
        guildBot?: { internal?: QQInternal };
      }
    ).guildBot;
    if (!guildBot?.internal) throw new Error("QQ guild adapter unavailable");
    internal = guildBot.internal;
  }

  let send: QQInternal["sendMessage" | "sendPrivateMessage" | "sendDM"];
  let id = session.channelId!;
  if (guild && session.isDirect) {
    const guildDirectId =
      (session as QQSession).qqguild?.d?.guild_id ?? session.guildId?.split("_").at(-1);
    if (!guildDirectId) throw new Error("Missing QQ guild direct-message ID");
    send = internal.sendDM;
    id = guildDirectId;
  } else if (session.isDirect) {
    send = internal.sendPrivateMessage;
  } else {
    send = internal.sendMessage;
  }
  if (!send) throw new Error("QQ send API unavailable");
  if (options.promptKeyboard && guild) throw new Error("Prompt keyboard requires QQ");

  let reply: object;
  if (options.wakeup) {
    requireQQDirect(session);
    if (options.reference) throw new Error("Wakeup cannot quote a message");
    reply = { is_wakeup: true };
  } else {
    const reference = options.reference
      ? { message_reference: { message_id: options.reference } }
      : {};
    if (options.active) {
      reply = reference;
    } else {
      const qqSession = session as QQSession;
      const event = session.platform === "qq" ? qqSession.qq : qqSession.qqguild;
      if (session.type === "interaction/button" || !session.messageId) {
        if (!event?.id) throw new Error("Missing reply source");
        reply = { ...reference, event_id: event.id };
      } else {
        if (session.platform === "qq") qqSession.seq = (qqSession.seq ?? 0) + 1;
        reply = {
          ...reference,
          msg_id: session.messageId,
          ...(session.platform === "qq" ? { msg_seq: qqSession.seq } : {}),
        };
      }
    }
  }

  const data = {
    markdown: {
      ...(typeof markdown === "string" ? { content: markdown } : markdown),
      ...(options.verifyImages === undefined
        ? {}
        : {
            force_verify_image_resource: options.verifyImages,
          }),
    },
    ...(options.keyboard ? { keyboard: options.keyboard } : {}),
    ...(options.promptKeyboard ? { prompt_keyboard: { keyboard: options.promptKeyboard } } : {}),
    ...reply,
  };
  return send.call(internal, id, { ...(guild ? {} : { msg_type: 2 }), ...data });
};

export const sendQQInputNotify = async (session: Session, seconds = 5) => {
  const internal = requireQQDirect(session);
  if (!Number.isInteger(seconds) || seconds <= 0) throw new Error("Invalid typing duration");
  if (!internal.sendPrivateMessage) throw new Error("QQ send API unavailable");
  return internal.sendPrivateMessage(session.channelId!, {
    msg_type: 6,
    input_notify: { input_type: 1, input_second: seconds },
  });
};

export const acknowledgeQQInteraction = async (session: Session, code = 0) => {
  const internal = getQQInternal(session);
  const bot = session.bot as Session["bot"] & { config?: { manualAcknowledge?: boolean } };
  if (!bot.config?.manualAcknowledge || session.type !== "interaction/button") return false;
  const qqSession = session as QQSession;
  const id = (session.platform === "qq" ? qqSession.qq : qqSession.qqguild)?.d?.id;
  if (!id || !internal.acknowledgeInteraction) throw new Error("Missing interaction API or ID");
  await internal.acknowledgeInteraction(id, { code });
  return true;
};
