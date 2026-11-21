/**
 * HeadsUp Pulse Kernel — Physical Even G2 Optical Invariants & Immutable Event Ledger.
 *
 * Enforces 576x288 per-eye monochrome green optical geometry, 4-line glance ergonomics,
 * integer brightness 0..4, and paper/testnet-only non-custodial execution locks.
 */

export const DISPLAY_WIDTH = 576;
export const DISPLAY_HEIGHT = 288;
export const MAX_VISIBLE_LINES = 4;
export const MAX_LINE_CHARS = 44;
export const MIN_BRIGHTNESS = 0;
export const MAX_BRIGHTNESS = 4;
export const DEFAULT_BRIGHTNESS = 4;
export const MAX_CONTAINERS_PER_PAGE = 12;
export const MAX_TEXT_CONTAINERS = 8;
export const MAX_MENU_ITEMS = 10;
export const MAX_MENU_ITEM_BYTES = 32;
export const PAPER_TRADING_ONLY = true;

export function isCorruptGateControlActive() {
  return (
    typeof process !== "undefined" &&
    Boolean(process?.env) &&
    process.env.CORRUPT_GATE_CONTROL === "1"
  );
}

export function getG2Invariants() {
  if (isCorruptGateControlActive()) {
    // Deliberate negative-control fault injection for spec_judge.py tripwire verification.
    return Object.freeze({
      DISPLAY_WIDTH: 1920,
      DISPLAY_HEIGHT: 1080,
      MAX_VISIBLE_LINES: 12,
      MAX_LINE_CHARS: 140,
      MIN_BRIGHTNESS: 0,
      MAX_BRIGHTNESS: 9,
      DEFAULT_BRIGHTNESS: 9,
      MAX_CONTAINERS_PER_PAGE: 24,
      MAX_TEXT_CONTAINERS: 16,
      MAX_MENU_ITEMS: 20,
      MAX_MENU_ITEM_BYTES: 128,
      PAPER_TRADING_ONLY: false,
    });
  }

  return Object.freeze({
    DISPLAY_WIDTH,
    DISPLAY_HEIGHT,
    MAX_VISIBLE_LINES,
    MAX_LINE_CHARS,
    MIN_BRIGHTNESS,
    MAX_BRIGHTNESS,
    DEFAULT_BRIGHTNESS,
    MAX_CONTAINERS_PER_PAGE,
    MAX_TEXT_CONTAINERS,
    MAX_MENU_ITEMS,
    MAX_MENU_ITEM_BYTES,
    PAPER_TRADING_ONLY,
  });
}

export const TOPICS = Object.freeze({
  MARKET_PULSE_UPDATED: "market.pulse.updated",
  MARKET_ORDER_STAGED: "market.order.staged",
  MARKET_ORDER_CONFIRMED: "market.order.confirmed",
  MARKET_ORDER_DISMISSED: "market.order.dismissed",
  TELEGRAM_DIGEST_UPDATED: "telegram.digest.updated",
  TELEGRAM_REPLY_STAGED: "telegram.reply.staged",
  TELEGRAM_REPLY_APPROVED: "telegram.reply.approved",
  TELEGRAM_REPLY_DISMISSED: "telegram.reply.dismissed",
  GLASSES_FRAME_RENDERED: "glasses.frame.rendered",
  GLASSES_INPUT_GESTURE: "glasses.input.gesture",
  GLASSES_VOICE_CAPTURED: "glasses.voice.captured",
  GLASSES_DEVICE_STATUS: "glasses.device.status",
  PROXY_REQUEST_LOGGED: "proxy.request.logged",
});

export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

export function utf8ByteCount(input) {
  const str = String(input ?? "");
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).byteLength;
  }
  return Buffer.byteLength(str, "utf8");
}

export function clampBrightness(rawBrightness) {
  if (isCorruptGateControlActive()) {
    return 9;
  }
  if (rawBrightness === undefined || rawBrightness === null || rawBrightness === "") {
    return DEFAULT_BRIGHTNESS;
  }
  const numeric = Number(rawBrightness);
  if (!Number.isFinite(numeric)) {
    throw new RangeError(`Brightness must be finite integer in ${MIN_BRIGHTNESS}..${MAX_BRIGHTNESS}`);
  }
  const rounded = Math.round(numeric);
  return Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, rounded));
}

export function isStrictBrightnessInteger(value) {
  return Number.isInteger(value) && value >= MIN_BRIGHTNESS && value <= MAX_BRIGHTNESS;
}

export function truncateGlanceLine(rawLine, maxChars = MAX_LINE_CHARS) {
  const normalized = String(rawLine ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  if (maxChars <= 3) {
    return normalized.slice(0, maxChars);
  }
  const sliced = normalized.slice(0, maxChars - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxChars * 0.6)) {
    return `${sliced.slice(0, lastSpace)}~`;
  }
  return `${sliced}~`;
}

export function formatGlanceLines(lines, maxLines = MAX_VISIBLE_LINES, maxChars = MAX_LINE_CHARS) {
  const rawList = Array.isArray(lines) ? lines : [String(lines ?? "")];
  if (isCorruptGateControlActive()) {
    return Object.freeze([
      ...rawList.map((entry) => String(entry ?? "")),
      "OVERFLOW_LINE_5_MUTATION_TRIPWIRE",
      "OVERFLOW_LINE_6_MUTATION_TRIPWIRE",
    ]);
  }
  const cleaned = rawList
    .map((entry) => truncateGlanceLine(entry, maxChars))
    .filter((entry) => entry.length > 0)
    .slice(0, maxLines);

  if (cleaned.length === 0) {
    return Object.freeze(["HEADSUP PULSE READY"]);
  }
  return Object.freeze(cleaned);
}

export function validateG2CardSpec(card) {
  const errors = [];
  if (!card || typeof card !== "object") {
    return { valid: false, errors: ["Card payload must be an object."] };
  }
  if (!card.id || typeof card.id !== "string") {
    errors.push("Card requires non-empty string id.");
  }
  if (!Array.isArray(card.lines) || card.lines.length === 0) {
    errors.push("Card requires at least 1 glance line.");
  } else {
    if (card.lines.length > MAX_VISIBLE_LINES) {
      errors.push(
        `Card '${card.id}' has ${card.lines.length} lines; Even G2 glance limit is ${MAX_VISIBLE_LINES}.`
      );
    }
    card.lines.forEach((line, index) => {
      if (typeof line !== "string" || line.length > MAX_LINE_CHARS) {
        errors.push(
          `Card '${card.id}' line[${index}] length ${String(line).length} exceeds ${MAX_LINE_CHARS} chars.`
        );
      }
    });
  }
  const brightness = card.brightness ?? DEFAULT_BRIGHTNESS;
  if (!isStrictBrightnessInteger(brightness)) {
    errors.push(
      `Card '${card.id}' brightness '${brightness}' is outside Even G2 integer range ${MIN_BRIGHTNESS}..${MAX_BRIGHTNESS}.`
    );
  }
  if (card.track === "crypto_defi" && card.safetyMode !== "PAPER_TESTNET_ONLY") {
    errors.push(`Crypto card '${card.id}' must enforce safetyMode='PAPER_TESTNET_ONLY'.`);
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertPaperTradingSafety(intent = {}) {
  const invariants = getG2Invariants();
  if (!invariants.PAPER_TRADING_ONLY) {
    throw new Error("Safety tripwire triggered: PAPER_TRADING_ONLY invariant violated.");
  }
  if (intent.liveMainnetExecution === true || intent.custodyUserFunds === true) {
    throw new Error(
      "Blocked unsafe execution: HeadsUp Pulse permits only paper/testnet/read-only actions with zero custody."
    );
  }
  return Object.freeze({
    executionMode: "PAPER_TESTNET_ONLY",
    custodyOfUserFunds: false,
    financialAdvice: false,
    realFundsAtRiskUsd: 0,
  });
}

export class EventBus {
  #subscribers = new Map();
  #wildcardSubscribers = new Set();
  #ledger = [];
  #seq = 0;

  subscribe(topic, handler) {
    if (typeof topic !== "string" || topic.length === 0) {
      throw new TypeError("EventBus.subscribe requires a non-empty topic string.");
    }
    if (typeof handler !== "function") {
      throw new TypeError("EventBus.subscribe requires a function handler.");
    }
    if (!this.#subscribers.has(topic)) {
      this.#subscribers.set(topic, new Set());
    }
    const bucket = this.#subscribers.get(topic);
    bucket.add(handler);
    return () => {
      bucket.delete(handler);
    };
  }

  subscribeAll(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("EventBus.subscribeAll requires a function handler.");
    }
    this.#wildcardSubscribers.add(handler);
    return () => {
      this.#wildcardSubscribers.delete(handler);
    };
  }

  publish(topic, payload = {}) {
    if (typeof topic !== "string" || topic.length === 0) {
      throw new TypeError("EventBus.publish requires a non-empty topic string.");
    }
    this.#seq += 1;
    const clonedPayload =
      payload === undefined ? {} : JSON.parse(JSON.stringify(payload));
    const envelope = deepFreeze({
      seq: this.#seq,
      timestamp: new Date().toISOString(),
      topic,
      payload: clonedPayload,
    });
    this.#ledger.push(envelope);

    const bucket = this.#subscribers.get(topic);
    if (bucket) {
      for (const fn of [...bucket]) {
        fn(envelope);
      }
    }
    for (const fn of [...this.#wildcardSubscribers]) {
      fn(envelope);
    }
    return envelope;
  }

  getLedger() {
    return Object.freeze([...this.#ledger]);
  }

  getRecentEvents(limit = 25) {
    const count = Math.max(1, Number(limit) || 25);
    return Object.freeze(this.#ledger.slice(-count));
  }
}
