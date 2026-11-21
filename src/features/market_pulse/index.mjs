/**
 * Vertical Slice: Track 02 — Crypto & DeFi Market Pulse (`4799`).
 *
 * Imports ONLY `../../kernel/event_bus.mjs` (zero sibling imports).
 * Fetches live Hyperliquid (mainnet info + testnet mids) and Polymarket Gamma markets,
 * falls back deterministically when offline, formats 576x288 4-line glance cards,
 * and executes non-custodial paper/testnet 1-tap order confirmations.
 */

import {
  TOPICS,
  assertPaperTradingSafety,
  clampBrightness,
  formatGlanceLines,
  truncateGlanceLine,
} from "../../kernel/event_bus.mjs";

export const HYPERLIQUID_MAINNET_INFO_URL = "https://api.hyperliquid.xyz/info";
export const HYPERLIQUID_TESTNET_INFO_URL = "https://api.hyperliquid-testnet.xyz/info";
export const POLYMARKET_GAMMA_MARKETS_URL =
  "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5";

const DETERMINISTIC_FALLBACK_MARKET = Object.freeze({
  hyperliquid: Object.freeze([
    Object.freeze({
      coin: "BTC",
      markPx: 60312.0,
      testnetMidPx: 60518.5,
      prevDayPx: 61739.0,
      change24hPct: -2.31,
      fundingHourlyPct: 0.00115,
      openInterestCoins: 37939.95,
    }),
    Object.freeze({
      coin: "ETH",
      markPx: 1689.85,
      testnetMidPx: 1693.05,
      prevDayPx: 1742.5,
      change24hPct: -3.02,
      fundingHourlyPct: -0.00085,
      openInterestCoins: 592007.68,
    }),
    Object.freeze({
      coin: "SOL",
      markPx: 69.84,
      testnetMidPx: 70.02,
      prevDayPx: 71.4,
      change24hPct: -2.18,
      fundingHourlyPct: 0.00092,
      openInterestCoins: 1845200.0,
    }),
  ]),
  polymarket: Object.freeze([
    Object.freeze({
      id: "559651",
      question: "Macro rate cut before Q1 close?",
      yesPct: 64.2,
      noPct: 35.8,
      yesPrice: 0.642,
      volume24hrUsd: 184250,
      slug: "macro-rate-cut-q1-close",
    }),
    Object.freeze({
      id: "559652",
      question: "ETH ETF weekly net inflow positive?",
      yesPct: 58.0,
      noPct: 42.0,
      yesPrice: 0.58,
      volume24hrUsd: 92400,
      slug: "eth-etf-weekly-inflow-positive",
    }),
  ]),
});

function formatCompactUsd(num) {
  const val = Number(num) || 0;
  if (val >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `$${(val / 1_000).toFixed(1)}K`;
  }
  return `$${val.toFixed(0)}`;
}

function formatPrice(num) {
  const val = Number(num) || 0;
  if (val >= 1000) {
    return `$${Math.round(val).toLocaleString("en-US")}`;
  }
  if (val >= 10) {
    return `$${val.toFixed(2)}`;
  }
  return `$${val.toFixed(3)}`;
}

function parseJsonArrayField(raw, fallback) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function fetchJsonWithTimeout(fetchImpl, url, init = {}, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export class MarketPulseEngine {
  #eventBus;
  #fetchImpl;
  #snapshot = null;
  #stagedTickets = new Map();
  #paperOrders = [];
  #brightness = 4;

  constructor({ eventBus, fetchImpl = globalThis.fetch, brightness = 4 }) {
    if (!eventBus) {
      throw new Error("MarketPulseEngine requires an EventBus instance.");
    }
    this.#eventBus = eventBus;
    this.#fetchImpl = fetchImpl;
    this.#brightness = clampBrightness(brightness);
  }

  setBrightness(level) {
    this.#brightness = clampBrightness(level);
  }

  getPaperOrders() {
    return [...this.#paperOrders];
  }

  getSnapshot() {
    return this.#snapshot;
  }

  async refreshFeeds(options = {}) {
    let hlAssets = null;
    let pmMarkets = null;
    let hlSource = "live";
    let pmSource = "live";

    if (options.forceOffline === true || typeof this.#fetchImpl !== "function") {
      hlAssets = DETERMINISTIC_FALLBACK_MARKET.hyperliquid;
      pmMarkets = DETERMINISTIC_FALLBACK_MARKET.polymarket;
      hlSource = "deterministic_fallback";
      pmSource = "deterministic_fallback";
    } else {
      try {
        const [mainnetPayload, testnetMids] = await Promise.all([
          fetchJsonWithTimeout(
            this.#fetchImpl,
            HYPERLIQUID_MAINNET_INFO_URL,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "metaAndAssetCtxs" }),
            },
            options.timeoutMs ?? 6500
          ),
          fetchJsonWithTimeout(
            this.#fetchImpl,
            HYPERLIQUID_TESTNET_INFO_URL,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "allMids" }),
            },
            options.timeoutMs ?? 6500
          ),
        ]);

        const universe = mainnetPayload?.[0]?.universe || [];
        const ctxs = mainnetPayload?.[1] || [];
        const targetCoins = ["BTC", "ETH", "SOL"];
        const extracted = [];

        for (const target of targetCoins) {
          const idx = universe.findIndex((u) => u?.name === target);
          if (idx >= 0 && ctxs[idx]) {
            const ctx = ctxs[idx];
            const markPx = Number(ctx.markPx || ctx.midPx || 0);
            const prevDayPx = Number(ctx.prevDayPx || markPx || 1);
            const change24hPct =
              prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
            const fundingHourlyPct = Number(ctx.funding || 0) * 100;
            const testnetMidPx = Number(testnetMids?.[target] || markPx);
            extracted.push({
              coin: target,
              markPx: Number(markPx.toFixed(2)),
              testnetMidPx: Number(testnetMidPx.toFixed(2)),
              prevDayPx: Number(prevDayPx.toFixed(2)),
              change24hPct: Number(change24hPct.toFixed(2)),
              fundingHourlyPct: Number(fundingHourlyPct.toFixed(5)),
              openInterestCoins: Number(Number(ctx.openInterest || 0).toFixed(2)),
            });
          }
        }
        if (extracted.length === 0) {
          throw new Error("Hyperliquid universe returned zero target perp contexts.");
        }
        hlAssets = extracted;
      } catch {
        hlAssets = DETERMINISTIC_FALLBACK_MARKET.hyperliquid;
        hlSource = "deterministic_fallback";
      }

      try {
        const rawPm = await fetchJsonWithTimeout(
          this.#fetchImpl,
          POLYMARKET_GAMMA_MARKETS_URL,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          },
          options.timeoutMs ?? 6500
        );
        if (!Array.isArray(rawPm) || rawPm.length === 0) {
          throw new Error("Polymarket Gamma returned empty markets list.");
        }
        const normalizedPm = rawPm
          .map((item) => {
            const prices = parseJsonArrayField(item?.outcomePrices, ["0.5", "0.5"]).map((v) =>
              Number(v)
            );
            const yesPrice = Number.isFinite(prices[0]) ? prices[0] : 0.5;
            const noPrice = Number.isFinite(prices[1]) ? prices[1] : Math.max(0, 1 - yesPrice);
            return {
              id: String(item?.id || "pm-live"),
              question: String(item?.question || "Active Polymarket contract"),
              yesPct: Number((yesPrice * 100).toFixed(1)),
              noPct: Number((noPrice * 100).toFixed(1)),
              yesPrice: Number(yesPrice.toFixed(4)),
              volume24hrUsd: Number(item?.volume24hr || item?.volumeNum || 0),
              slug: String(item?.slug || "polymarket-live"),
            };
          })
          .sort((a, b) => b.volume24hrUsd - a.volume24hrUsd);
        pmMarkets = normalizedPm;
      } catch {
        pmMarkets = DETERMINISTIC_FALLBACK_MARKET.polymarket;
        pmSource = "deterministic_fallback";
      }
    }

    this.#snapshot = {
      fetchedAt: new Date().toISOString(),
      hyperliquidSource: hlSource,
      polymarketSource: pmSource,
      endpoints: {
        hyperliquidMainnet: HYPERLIQUID_MAINNET_INFO_URL,
        hyperliquidTestnet: HYPERLIQUID_TESTNET_INFO_URL,
        polymarketGamma: POLYMARKET_GAMMA_MARKETS_URL,
      },
      hyperliquid: hlAssets,
      polymarket: pmMarkets,
    };

    const cards = this.buildGlanceCards();
    this.#eventBus.publish(TOPICS.MARKET_PULSE_UPDATED, {
      hyperliquidSource: hlSource,
      polymarketSource: pmSource,
      cardCount: cards.length,
      btcMarkPx: hlAssets[0]?.markPx,
      btcTestnetMidPx: hlAssets[0]?.testnetMidPx,
      topPolymarketQuestion: pmMarkets[0]?.question,
    });

    return { snapshot: this.#snapshot, cards };
  }

  buildGlanceCards() {
    const snap = this.#snapshot || {
      hyperliquid: DETERMINISTIC_FALLBACK_MARKET.hyperliquid,
      polymarket: DETERMINISTIC_FALLBACK_MARKET.polymarket,
      hyperliquidSource: "deterministic_fallback",
      polymarketSource: "deterministic_fallback",
    };

    const btc = snap.hyperliquid[0] || DETERMINISTIC_FALLBACK_MARKET.hyperliquid[0];
    const pmTop = snap.polymarket[0] || DETERMINISTIC_FALLBACK_MARKET.polymarket[0];

    const sign24 = btc.change24hPct >= 0 ? "+" : "";
    const fundSign = btc.fundingHourlyPct >= 0 ? "+" : "";
    const hedgeSide = btc.fundingHourlyPct >= 0 ? "SHORT" : "LONG";

    const hlTicket = {
      cardId: "card-hl-btc-hedge",
      venue: "Hyperliquid Testnet",
      symbol: `${btc.coin}-PERP`,
      side: hedgeSide,
      sizeCoins: 0.01,
      referencePriceUsd: btc.testnetMidPx,
      notionalUsd: Number((0.01 * btc.testnetMidPx).toFixed(2)),
      executionMode: "PAPER_TESTNET_ONLY",
      custodyOfUserFunds: false,
      financialAdvice: false,
    };
    this.#stagedTickets.set(hlTicket.cardId, hlTicket);

    const pmSide = pmTop.yesPct <= 50 ? "YES" : "NO";
    const pmTicket = {
      cardId: "card-pm-live-odds",
      venue: "Polymarket Paper Sim",
      marketId: pmTop.id,
      question: pmTop.question,
      side: pmSide,
      notionalUsd: 25.0,
      referenceProbabilityPct: pmSide === "YES" ? pmTop.yesPct : pmTop.noPct,
      executionMode: "PAPER_TESTNET_ONLY",
      custodyOfUserFunds: false,
      financialAdvice: false,
    };
    this.#stagedTickets.set(pmTicket.cardId, pmTicket);

    const hlCard = {
      id: hlTicket.cardId,
      track: "crypto_defi",
      trackId: 4799,
      provider: "Hyperliquid",
      headerTag: `HL ${btc.coin}-PERP`,
      title: `Hyperliquid ${btc.coin} Perp & Testnet Hedge`,
      brightness: this.#brightness,
      safetyMode: "PAPER_TESTNET_ONLY",
      sourceMode: snap.hyperliquidSource,
      lines: formatGlanceLines([
        `HL ${btc.coin} ${formatPrice(btc.markPx)} (${sign24}${btc.change24hPct.toFixed(1)}%) TEST ${formatPrice(btc.testnetMidPx)}`,
        `FUND ${fundSign}${btc.fundingHourlyPct.toFixed(4)}%/h | OI ${(btc.openInterestCoins / 1000).toFixed(1)}K`,
        `PAPER ${hedgeSide} 0.01 ${btc.coin} @ ${formatPrice(btc.testnetMidPx)}`,
        `TAP Confirm Paper | 2xTAP Skip | SCRL Next`,
      ]),
      primaryActionLabel: `Tap: Confirm Paper ${hedgeSide} 0.01 ${btc.coin}`,
      secondaryActionLabel: "Double-Tap: Dismiss Ticket",
      stagedTicket: hlTicket,
    };

    const shortQuestion = truncateGlanceLine(pmTop.question, 33);
    const pmCard = {
      id: pmTicket.cardId,
      track: "crypto_defi",
      trackId: 4799,
      provider: "Polymarket",
      headerTag: "POLYMARKET ODDS",
      title: "Polymarket Live Odds & Paper Ticket",
      brightness: this.#brightness,
      safetyMode: "PAPER_TESTNET_ONLY",
      sourceMode: snap.polymarketSource,
      lines: formatGlanceLines([
        `PM: ${shortQuestion}`,
        `YES ${pmTop.yesPct.toFixed(1)}% | NO ${pmTop.noPct.toFixed(1)}% | 24H ${formatCompactUsd(pmTop.volume24hrUsd)}`,
        `PAPER ${pmSide} $25.00 SIM (ZERO CUSTODY)`,
        `TAP Confirm Paper | 2xTAP Skip | SCRL Next`,
      ]),
      primaryActionLabel: `Tap: Confirm Paper ${pmSide} $25`,
      secondaryActionLabel: "Double-Tap: Dismiss Ticket",
      stagedTicket: pmTicket,
    };

    return [hlCard, pmCard];
  }

  stageVoicePaperOrder(transcript = "") {
    const safety = assertPaperTradingSafety({ liveMainnetExecution: false });
    const cleaned = String(transcript || "").trim();
    const upper = cleaned.toUpperCase();
    const snap = this.#snapshot || { hyperliquid: DETERMINISTIC_FALLBACK_MARKET.hyperliquid };
    const chosenCoin = upper.includes("SOL")
      ? "SOL"
      : upper.includes("ETH")
      ? "ETH"
      : "BTC";
    const asset =
      snap.hyperliquid.find((a) => a.coin === chosenCoin) ||
      DETERMINISTIC_FALLBACK_MARKET.hyperliquid[0];
    const side = upper.includes("LONG") || upper.includes("BUY") ? "LONG" : "SHORT";
    const amountMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
    const notionalUsd = Math.min(250, Math.max(10, Number(amountMatch?.[1] || 50)));
    const sizeCoins = Number((notionalUsd / Math.max(1, asset.testnetMidPx)).toFixed(5));

    const ticket = {
      cardId: "card-hl-btc-hedge",
      venue: "Hyperliquid Testnet",
      symbol: `${asset.coin}-PERP`,
      side,
      sizeCoins,
      referencePriceUsd: asset.testnetMidPx,
      notionalUsd,
      voiceTranscript: cleaned,
      ...safety,
    };
    this.#stagedTickets.set(ticket.cardId, ticket);
    this.#eventBus.publish(TOPICS.MARKET_ORDER_STAGED, ticket);
    return ticket;
  }

  confirmOrDismissOrder({
    cardId = "card-hl-btc-hedge",
    action = "confirm",
    gestureSource = "RING",
    liveMainnetExecution = false,
    custodyUserFunds = false,
  } = {}) {
    const safety = assertPaperTradingSafety({
      liveMainnetExecution,
      custodyUserFunds,
    });

    const staged =
      this.#stagedTickets.get(cardId) ||
      this.buildGlanceCards().find((c) => c.id === cardId)?.stagedTicket ||
      this.buildGlanceCards()[0].stagedTicket;

    if (action === "dismiss") {
      const dismissed = {
        receiptId: `paper-dismiss-${this.#paperOrders.length + 1}`,
        status: "DISMISSED",
        cardId: staged.cardId,
        venue: staged.venue,
        gestureSource,
        timestamp: new Date().toISOString(),
        ...safety,
      };
      this.#eventBus.publish(TOPICS.MARKET_ORDER_DISMISSED, dismissed);
      return dismissed;
    }

    const receipt = {
      receiptId: `paper-exec-${this.#paperOrders.length + 1}-${staged.venue.startsWith("Hyperliquid") ? "hl" : "pm"}`,
      status: "CONFIRMED_PAPER_TESTNET",
      cardId: staged.cardId,
      venue: staged.venue,
      symbolOrMarket: staged.symbol || staged.question,
      side: staged.side,
      notionalUsd: staged.notionalUsd,
      referencePriceUsd: staged.referencePriceUsd ?? null,
      gestureSource,
      timestamp: new Date().toISOString(),
      ...safety,
    };
    this.#paperOrders.push(receipt);
    this.#eventBus.publish(TOPICS.MARKET_ORDER_CONFIRMED, receipt);
    return receipt;
  }
}
