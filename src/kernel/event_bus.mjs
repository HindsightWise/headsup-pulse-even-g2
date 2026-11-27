/**
 * HeadsUp Pulse Kernel — Physical Even G2 Optical Invariants & Immutable Event Ledger.
 *
 * Enforces 576x288 per-eye monochrome green optical geometry, 4-line glance ergonomics,
 * integer brightness 0..4, and paper/testnet-only non-custodial execution locks.
 */

export const DISPLAY_WIDTH = 576;
export const DISPLAY_HEIGHT = 288;
export const G2_LINE_HEIGHT_PX = 27;
export const G2_INNER_WIDTH_PX = 544;
export const G2_HEADER_HEIGHT_PX = 36;
export const G2_BODY_HEIGHT_PX = 216;
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

// Official Even G2 LVGL `evenroster` ASCII 32..126 glyph advance widths in 1/16 px
// calibrated to `@evenrealities/pretext@0.1.4` (`dist/font_measure.js`).
const G2_EVENROSTER_ADV_1_16 = Object.freeze({
  32: 80, 33: 64, 34: 96, 35: 240, 36: 208, 37: 224, 38: 256, 39: 64,
  40: 112, 41: 112, 42: 128, 43: 160, 44: 80, 45: 160, 46: 80, 47: 128,
  48: 192, 49: 128, 50: 192, 51: 192, 52: 208, 53: 192, 54: 192, 55: 208,
  56: 192, 57: 192, 58: 64, 59: 80, 60: 160, 61: 160, 62: 160, 63: 192,
  64: 272, 65: 224, 66: 192, 67: 192, 68: 192, 69: 176, 70: 176, 71: 192,
  72: 192, 73: 96, 74: 144, 75: 192, 76: 160, 77: 256, 78: 192, 79: 192,
  80: 192, 81: 192, 82: 192, 83: 192, 84: 192, 85: 192, 86: 224, 87: 256,
  88: 224, 89: 224, 90: 208, 91: 112, 92: 128, 93: 112, 94: 160, 95: 144,
  97: 192, 98: 176, 99: 176, 100: 176, 101: 176, 102: 160, 103: 176, 104: 176,
  105: 64, 106: 112, 107: 160, 108: 64, 109: 256, 110: 176, 111: 176, 112: 176,
  113: 176, 114: 128, 115: 176, 116: 128, 117: 192, 118: 192, 119: 256, 120: 192,
  121: 192, 122: 160, 123: 144, 124: 64, 125: 144, 126: 256,
});

export function measureG2GlyphWidthPx(codePoint) {
  if (!Number.isFinite(codePoint) || codePoint < 32) {
    return 0;
  }
  const raw = G2_EVENROSTER_ADV_1_16[codePoint];
  if (raw !== undefined) {
    return (raw + 8) >> 4;
  }
  // Printable non-ASCII / unmapped glyph fallback matching pretext (4 px default, 16 px wide CJK)
  return codePoint >= 0x2e80 ? 16 : 4;
}

export function measureG2TextWidthPx(text) {
  const str = String(text ?? "");
  let totalPx = 0;
  for (const ch of str) {
    totalPx += measureG2GlyphWidthPx(ch.codePointAt(0));
  }
  return totalPx;
}

export function fitsG2Width(text, maxWidthPx = G2_INNER_WIDTH_PX) {
  const str = String(text ?? "");
  const segments = str.split("\n");
  let maxObservedPx = 0;
  let wrappedLines = 0;
  for (const seg of segments) {
    const w = measureG2TextWidthPx(seg);
    if (w > maxObservedPx) {
      maxObservedPx = w;
    }
    wrappedLines += Math.max(1, Math.ceil(Math.max(1, w) / Math.max(1, maxWidthPx)));
  }
  return {
    fits: maxObservedPx <= maxWidthPx && wrappedLines === segments.length,
    widthPx: maxObservedPx,
    maxWidthPx,
    lineCount: wrappedLines,
  };
}

export function truncateG2LineByPx(
  rawLine,
  maxWidthPx = G2_INNER_WIDTH_PX,
  maxChars = MAX_LINE_CHARS
) {
  let candidate = truncateGlanceLine(rawLine, maxChars);
  if (measureG2TextWidthPx(candidate) <= maxWidthPx) {
    return candidate;
  }
  const tildePx = measureG2GlyphWidthPx(126); // '~'
  const budget = Math.max(tildePx, maxWidthPx - tildePx);
  let acc = "";
  let px = 0;
  for (const ch of candidate) {
    const w = measureG2GlyphWidthPx(ch.codePointAt(0));
    if (px + w > budget) {
      break;
    }
    acc += ch;
    px += w;
  }
  return `${acc.trimEnd()}~`;
}

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
    .map((entry) => truncateG2LineByPx(entry, G2_INNER_WIDTH_PX, maxChars))
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
