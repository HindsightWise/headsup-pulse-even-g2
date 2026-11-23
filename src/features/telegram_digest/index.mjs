/**
 * Vertical Slice: Track 01 — Messaging & News (`4795`) + Special Prize (`Best Telegram Integration`).
 *
 * Imports ONLY `../../kernel/event_bus.mjs` (zero sibling imports).
 * Filters incoming Telegram updates strictly to user-picked priority chats/channels,
 * compresses multi-message streams into <=4 short <=44-char glance lines for Even G2,
 * and stages 1-tap AI-drafted or voice-dictated replies for backend proxy delivery.
 */

import {
  TOPICS,
  clampBrightness,
  formatGlanceLines,
  truncateGlanceLine,
} from "../../kernel/event_bus.mjs";

const DEFAULT_PRIORITY_HANDLES = Object.freeze([
  "@HyperliquidAlphaDesk",
  "@DaosHubDubai",
  "@EvenBuildersOps",
]);

const DEFAULT_RAW_TELEGRAM_FEED = Object.freeze([
  Object.freeze({
    updateId: 9101,
    chatId: "-100247701",
    chatHandle: "@HyperliquidAlphaDesk",
    chatKind: "channel",
    sender: "DeskBot",
    text: "BTC perp funding shifted on Hyperliquid; check testnet hedge spread before US session.",
    unreadCount: 2,
    aiDraftReply: "Ack: staging 0.01 BTC paper hedge.",
    linkedCardId: "card-hl-btc-hedge",
  }),
  Object.freeze({
    updateId: 9102,
    chatId: "-100247702",
    chatHandle: "@DaosHubDubai",
    chatKind: "supergroup",
    sender: "Nadia",
    text: "Confirming your Dec 3 Demo Day remote demo check-in at 15:20 GMT+4.",
    unreadCount: 3,
    aiDraftReply: "Confirmed 15:20 GMT+4 remote slot. Ready.",
    linkedCardId: null,
  }),
  Object.freeze({
    updateId: 9103,
    chatId: "-100999999",
    chatHandle: "@RandomMemeSpam",
    chatKind: "group",
    sender: "SpamBot",
    text: "Unselected noisy group message that must be filtered out before reaching G2.",
    unreadCount: 47,
    aiDraftReply: "",
    linkedCardId: null,
  }),
]);

export function normalizeTelegramBotUpdates(
  botApiResults = [],
  { chatHandleOverrides = {} } = {}
) {
  if (!Array.isArray(botApiResults) || botApiResults.length === 0) {
    return { updates: [], nextUpdateOffset: 0 };
  }

  const groupedByHandle = new Map();
  let maxUpdateId = 0;

  for (const update of botApiResults) {
    const rawUpdateId = Number(update?.update_id);
    const hasUpdateId = Number.isFinite(rawUpdateId);
    if (hasUpdateId && rawUpdateId > maxUpdateId) {
      maxUpdateId = rawUpdateId;
    }

    const post =
      update?.channel_post ||
      update?.message ||
      update?.edited_message ||
      update?.edited_channel_post;
    const chat = post?.chat;
    if (!post || !chat || chat.id === undefined || chat.id === null) {
      continue;
    }

    const chatId = String(chat.id);
    const chatKind = String(chat.type || "channel");
    const overrideHandle = chatHandleOverrides?.[chatId];
    const usernameHandle = chat.username ? `@${chat.username}` : null;
    const sanitizedTitle = String(chat.title || "PriorityChat").replace(/[^A-Za-z0-9_]/g, "");
    const rawHandle = String(overrideHandle || usernameHandle || `@${sanitizedTitle || "PriorityChat"}`);
    const chatHandle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;

    const sender = String(
      post.from?.username
        ? `@${post.from.username}`
        : post.from?.first_name || post.author_signature || chat.title || "Channel"
    );
    const text = String(post.text || post.caption || "").trim();
    if (!text) {
      continue;
    }

    const existing = groupedByHandle.get(chatHandle);
    const updateId = hasUpdateId ? rawUpdateId : existing?.updateId ?? 0;
    if (existing) {
      groupedByHandle.set(chatHandle, {
        ...existing,
        updateId: Math.max(existing.updateId, updateId),
        sender,
        text,
        unreadCount: existing.unreadCount + 1,
      });
    } else {
      groupedByHandle.set(chatHandle, {
        updateId,
        chatId,
        chatHandle,
        chatKind,
        sender,
        text,
        unreadCount: 1,
      });
    }
  }

  const updates = [...groupedByHandle.values()].map((entry) => {
    const isMarketAlert = /(btc|eth|sol|hyperliquid|funding|perp|hedge)/i.test(entry.text);
    const aiDraftReply = isMarketAlert
      ? "Ack: staging 0.01 BTC paper hedge."
      : truncateGlanceLine(`Ack ${entry.sender}: reviewing on G2.`, 36);

    return {
      updateId: entry.updateId,
      chatId: entry.chatId,
      chatHandle: entry.chatHandle,
      chatKind: entry.chatKind,
      sender: entry.sender,
      text: entry.text,
      unreadCount: entry.unreadCount,
      aiDraftReply,
      linkedCardId: isMarketAlert ? "card-hl-btc-hedge" : null,
    };
  });

  return {
    updates,
    nextUpdateOffset: maxUpdateId > 0 ? maxUpdateId + 1 : 0,
  };
}

export class TelegramDigestEngine {
  #eventBus;
  #allowedHandles;
  #brightness;
  #marketHint = null;
  #customDrafts = new Map();
  #approvedReplies = [];
  #rawUpdates = [...DEFAULT_RAW_TELEGRAM_FEED];
  #nextUpdateOffset = 0;
  #unsubMarket = null;

  constructor({
    eventBus,
    allowedHandles = DEFAULT_PRIORITY_HANDLES,
    brightness = 4,
  }) {
    if (!eventBus) {
      throw new Error("TelegramDigestEngine requires an EventBus instance.");
    }
    this.#eventBus = eventBus;
    this.#allowedHandles = new Set(allowedHandles);
    this.#brightness = clampBrightness(brightness);

    // Coordinate cross-track market context exclusively through immutable kernel events.
    this.#unsubMarket = this.#eventBus.subscribe(TOPICS.MARKET_PULSE_UPDATED, (envelope) => {
      this.#marketHint = envelope.payload;
    });
  }

  dispose() {
    if (typeof this.#unsubMarket === "function") {
      this.#unsubMarket();
      this.#unsubMarket = null;
    }
  }

  setBrightness(level) {
    this.#brightness = clampBrightness(level);
  }

  setAllowedHandles(handles = []) {
    this.#allowedHandles = new Set(handles);
  }

  getAllowedHandles() {
    return [...this.#allowedHandles];
  }

  getApprovedReplies() {
    return [...this.#approvedReplies];
  }

  getNextUpdateOffset() {
    return this.#nextUpdateOffset;
  }

  ingestUpdates(updates = []) {
    if (Array.isArray(updates) && updates.length > 0) {
      this.#rawUpdates = updates.map((u, idx) => ({
        updateId: Number(u.updateId ?? 9500 + idx),
        chatId: String(u.chatId ?? `-1002477${idx}`),
        chatHandle: String(u.chatHandle ?? "@EvenBuildersOps"),
        chatKind: String(u.chatKind ?? "group"),
        sender: String(u.sender ?? "Member"),
        text: String(u.text ?? ""),
        unreadCount: Number(u.unreadCount ?? 1),
        aiDraftReply: String(u.aiDraftReply ?? "Received, following up shortly."),
        linkedCardId: u.linkedCardId ?? null,
      }));
    }
    return this.buildDigestCards();
  }

  ingestBotApiUpdates(
    botApiPayload = {},
    { chatHandleOverrides = {}, resetOffset = false } = {}
  ) {
    if (resetOffset) {
      this.#nextUpdateOffset = 0;
    }
    const rawArray = Array.isArray(botApiPayload)
      ? botApiPayload
      : Array.isArray(botApiPayload?.result)
      ? botApiPayload.result
      : [];

    const freshItems = rawArray.filter((item) => {
      const id = Number(item?.update_id);
      return Number.isFinite(id) ? id >= this.#nextUpdateOffset : true;
    });

    const normalized = normalizeTelegramBotUpdates(freshItems, {
      chatHandleOverrides,
    });
    if (normalized.nextUpdateOffset > this.#nextUpdateOffset) {
      this.#nextUpdateOffset = normalized.nextUpdateOffset;
    }

    const cards =
      normalized.updates.length > 0
        ? this.ingestUpdates(normalized.updates)
        : this.buildDigestCards();

    const priorityCount = this.#rawUpdates.filter((item) =>
      this.#allowedHandles.has(item.chatHandle)
    ).length;
    const droppedNoiseCount = this.#rawUpdates.length - priorityCount;

    return {
      cards,
      ingestedCount: normalized.updates.length,
      droppedNoiseCount,
      nextUpdateOffset: this.#nextUpdateOffset,
    };
  }

  buildDigestCards() {
    const priorityUpdates = this.#rawUpdates.filter((item) =>
      this.#allowedHandles.has(item.chatHandle)
    );
    const droppedCount = this.#rawUpdates.length - priorityUpdates.length;

    const cards = priorityUpdates.slice(0, 2).map((item, idx) => {
      const cardId =
        idx === 0 ? "card-tg-alpha-bridge" : "card-tg-ops-reply";
      const stagedOverride = this.#customDrafts.get(cardId);
      const draftText = stagedOverride?.replyText || item.aiDraftReply;
      const draftPrefix = stagedOverride?.inputMode === "voice_stt" ? "VOICE" : "AI";

      const marketLine =
        idx === 0 && this.#marketHint?.btcTestnetMidPx
          ? `${item.sender}: HL BTC test $${Math.round(this.#marketHint.btcTestnetMidPx).toLocaleString("en-US")} hedge?`
          : `${item.sender}: ${item.text}`;

      const actionLine = item.linkedCardId
        ? "TAP Approve | SCRL HL Hedge | 2xTAP Mute"
        : "TAP Send Reply | HOLD Voice | 2xTAP Mute";

      return {
        id: cardId,
        track: "messaging_news",
        trackId: 4795,
        specialPrize: "Best Telegram Integration",
        provider: "Telegram",
        chatId: item.chatId,
        chatHandle: item.chatHandle,
        headerTag: `TG ${item.chatHandle}`,
        title: `Telegram ${item.chatHandle} Priority Digest`,
        brightness: this.#brightness,
        safetyMode: "EXPLICIT_USER_APPROVAL",
        filteredNoiseChats: droppedCount,
        linkedCardId: item.linkedCardId,
        lines: formatGlanceLines([
          `${item.chatHandle} [${item.unreadCount} NEW | 30S BRIEF]`,
          truncateGlanceLine(marketLine, 44),
          truncateGlanceLine(`${draftPrefix}: "${draftText}"`, 44),
          actionLine,
        ]),
        primaryActionLabel: `Tap: Approve & Send (${draftPrefix})`,
        secondaryActionLabel: "Double-Tap: Mute Thread 1h",
        stagedReply: {
          cardId,
          chatId: item.chatId,
          chatHandle: item.chatHandle,
          replyText: draftText,
          inputMode: stagedOverride?.inputMode || "ai_draft",
        },
      };
    });

    this.#eventBus.publish(TOPICS.TELEGRAM_DIGEST_UPDATED, {
      priorityCardCount: cards.length,
      droppedNoiseCount: droppedCount,
      allowedHandles: [...this.#allowedHandles],
    });

    return cards;
  }

  stageVoiceReply({ cardId = "card-tg-ops-reply", transcript = "" } = {}) {
    const cleaned = truncateGlanceLine(String(transcript || "").trim(), 36);
    if (!cleaned) {
      throw new Error("Voice reply transcript must not be empty.");
    }
    const staged = {
      cardId,
      replyText: cleaned,
      inputMode: "voice_stt",
      stagedAt: new Date().toISOString(),
    };
    this.#customDrafts.set(cardId, staged);
    this.#eventBus.publish(TOPICS.TELEGRAM_REPLY_STAGED, staged);
    return staged;
  }

  recordReplyDecision({
    cardId = "card-tg-ops-reply",
    action = "approve",
    deliveryReceipt = null,
    gestureSource = "GLASSES_R",
  } = {}) {
    const cards = this.buildDigestCards();
    const targetCard = cards.find((c) => c.id === cardId) || cards[0];

    if (action === "dismiss") {
      const muted = {
        status: "THREAD_MUTED_1H",
        cardId: targetCard.id,
        chatHandle: targetCard.chatHandle,
        gestureSource,
        timestamp: new Date().toISOString(),
      };
      this.#eventBus.publish(TOPICS.TELEGRAM_REPLY_DISMISSED, muted);
      return muted;
    }

    const record = {
      status: "APPROVED_AND_DISPATCHED",
      cardId: targetCard.id,
      chatId: targetCard.chatId,
      chatHandle: targetCard.chatHandle,
      replyText: targetCard.stagedReply.replyText,
      inputMode: targetCard.stagedReply.inputMode,
      gestureSource,
      deliveryReceipt: deliveryReceipt || {
        deliveryMode: "local_paper_receipt",
        delivered: true,
      },
      timestamp: new Date().toISOString(),
    };
    this.#approvedReplies.push(record);
    this.#eventBus.publish(TOPICS.TELEGRAM_REPLY_APPROVED, record);
    return record;
  }
}
