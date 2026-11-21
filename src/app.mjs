/**
 * HeadsUp Pulse Top-Level Orchestrator (`src/app.mjs`).
 *
 * Composes the kernel `EventBus` with the four isolated vertical slices:
 * - `sdk_bridge` (`@evenrealities/even_hub_sdk@0.0.16`)
 * - `market_pulse` (Hyperliquid + Polymarket live feeds & paper/testnet orders)
 * - `telegram_digest` (Priority Telegram channel/group digest & 1-tap voice/AI reply)
 * - `backend_proxy` (CORS-whitelisted HTTP server & zero-secret API gateway)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EventBus,
  TOPICS,
  clampBrightness,
  getG2Invariants,
  validateG2CardSpec,
} from "./kernel/event_bus.mjs";
import {
  EvenG2BridgeController,
  buildEvenG2PageContainer,
} from "./features/sdk_bridge/index.mjs";
import { MarketPulseEngine } from "./features/market_pulse/index.mjs";
import { TelegramDigestEngine } from "./features/telegram_digest/index.mjs";
import {
  createBackendProxyServer,
  dispatchTelegramReply,
  loadAppManifest,
} from "./features/backend_proxy/index.mjs";

const DEFAULT_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export async function createHeadsUpPulseRuntime({
  projectRoot = DEFAULT_PROJECT_ROOT,
  fetchImpl = globalThis.fetch,
  env = process.env,
  brightness = 4,
} = {}) {
  const eventBus = new EventBus();
  const manifest = await loadAppManifest(projectRoot);
  const bridgeController = new EvenG2BridgeController({ eventBus });
  const marketEngine = new MarketPulseEngine({ eventBus, fetchImpl, brightness });
  const telegramEngine = new TelegramDigestEngine({ eventBus, brightness });

  let activeCardIndex = 0;
  let cards = [];

  const rebuildUnifiedDeck = () => {
    const marketCards = marketEngine.buildGlanceCards();
    const telegramCards = telegramEngine.buildDigestCards();
    // Connected Dual-Track Flow:
    // [0] Priority Telegram @HyperliquidAlphaDesk alert -> [1] Hyperliquid Testnet Paper Hedge
    // -> [2] Polymarket Live Odds Paper Sim -> [3] Priority Telegram @DaosHubDubai Reply
    cards = [
      telegramCards[0],
      marketCards[0],
      marketCards[1],
      telegramCards[1],
    ].filter(Boolean);

    if (activeCardIndex >= cards.length) {
      activeCardIndex = 0;
    }
    return cards;
  };

  const syncActiveCardToGlasses = async ({ startup = false } = {}) => {
    if (cards.length === 0) {
      rebuildUnifiedDeck();
    }
    const current = cards[activeCardIndex];
    if (!current) {
      return null;
    }
    if (startup) {
      return bridgeController.renderStartupCard(current, {
        cardIndex: activeCardIndex,
        totalCards: cards.length,
      });
    }
    return bridgeController.upgradeCardText(current, {
      cardIndex: activeCardIndex,
      totalCards: cards.length,
    });
  };

  eventBus.subscribe(TOPICS.GLASSES_INPUT_GESTURE, (envelope) => {
    const { gesture, source } = envelope.payload;
    if (cards.length === 0) {
      rebuildUnifiedDeck();
    }
    const activeCard = cards[activeCardIndex];
    if (!activeCard) {
      return;
    }

    if (gesture === "SCROLL_NEXT") {
      activeCardIndex = (activeCardIndex + 1) % cards.length;
      void syncActiveCardToGlasses();
    } else if (gesture === "SCROLL_PREV") {
      activeCardIndex = (activeCardIndex - 1 + cards.length) % cards.length;
      void syncActiveCardToGlasses();
    } else if (gesture === "TAP_CONFIRM") {
      if (activeCard.track === "crypto_defi") {
        marketEngine.confirmOrDismissOrder({
          cardId: activeCard.id,
          action: "confirm",
          gestureSource: source,
        });
      } else {
        telegramEngine.recordReplyDecision({
          cardId: activeCard.id,
          action: "approve",
          gestureSource: source,
        });
      }
    } else if (gesture === "DOUBLE_TAP_DISMISS") {
      if (activeCard.track === "crypto_defi") {
        marketEngine.confirmOrDismissOrder({
          cardId: activeCard.id,
          action: "dismiss",
          gestureSource: source,
        });
      } else {
        telegramEngine.recordReplyDecision({
          cardId: activeCard.id,
          action: "dismiss",
          gestureSource: source,
        });
      }
    }
  });

  const getPulseState = async ({ refresh = false } = {}) => {
    if (refresh || !marketEngine.getSnapshot()) {
      await marketEngine.refreshFeeds();
    }
    rebuildUnifiedDeck();
    const validatedContainers = cards.map((card, idx) => {
      const container = buildEvenG2PageContainer(card, bridgeController.sdk, {
        cardIndex: idx,
        totalCards: cards.length,
      });
      const sdkValidation = bridgeController.sdk
        ? bridgeController.sdk.validateEvenHubPageContainer(container)
        : { valid: true };
      return {
        cardId: card.id,
        sdkValidation,
        pageContainer: container,
      };
    });

    return {
      invariants: getG2Invariants(),
      sdkVersion: manifest.sdkVersion,
      activeCardIndex,
      cards,
      validatedContainers,
      marketSnapshot: marketEngine.getSnapshot(),
      paperOrders: marketEngine.getPaperOrders(),
      approvedTelegramReplies: telegramEngine.getApprovedReplies(),
      recentLedger: eventBus.getRecentEvents(20),
    };
  };

  const server = createBackendProxyServer({
    projectRoot,
    eventBus,
    manifest,
    fetchImpl,
    env,
    handlers: {
      getPulseState,
      onConfirmMarketAction: async (body) => {
        const receipt = marketEngine.confirmOrDismissOrder({
          cardId: body.cardId,
          action: body.action || "confirm",
          gestureSource: body.gestureSource || "RING",
          liveMainnetExecution: Boolean(body.liveMainnetExecution),
          custodyUserFunds: Boolean(body.custodyUserFunds),
        });
        rebuildUnifiedDeck();
        await syncActiveCardToGlasses();
        return receipt;
      },
      onTelegramReplyDecision: async ({
        cardId,
        action,
        deliveryReceipt,
        gestureSource,
      }) => {
        const decision = telegramEngine.recordReplyDecision({
          cardId,
          action,
          deliveryReceipt,
          gestureSource,
        });
        rebuildUnifiedDeck();
        await syncActiveCardToGlasses();
        return decision;
      },
      onVoiceTranscript: async ({ cardId, transcript, targetTrack }) => {
        if (targetTrack === "crypto_defi") {
          const stagedTicket = marketEngine.stageVoicePaperOrder(transcript);
          rebuildUnifiedDeck();
          await syncActiveCardToGlasses();
          return stagedTicket;
        }
        const stagedReply = telegramEngine.stageVoiceReply({
          cardId: cardId || "card-tg-ops-reply",
          transcript,
        });
        rebuildUnifiedDeck();
        await syncActiveCardToGlasses();
        return stagedReply;
      },
    },
  });

  return {
    projectRoot,
    manifest,
    eventBus,
    bridgeController,
    marketEngine,
    telegramEngine,
    server,
    setBrightness: async (level) => {
      const clamped = clampBrightness(level);
      marketEngine.setBrightness(clamped);
      telegramEngine.setBrightness(clamped);
      rebuildUnifiedDeck();
      return syncActiveCardToGlasses();
    },
    setActiveCardIndex: async (idx) => {
      if (cards.length === 0) {
        rebuildUnifiedDeck();
      }
      activeCardIndex = ((idx % cards.length) + cards.length) % cards.length;
      return syncActiveCardToGlasses();
    },
    getPulseState,
    syncActiveCardToGlasses,
    shutdown: async () => {
      telegramEngine.dispose();
      await bridgeController.shutdown(0);
    },
  };
}

export async function generateLiveSessionBundle({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputFile = path.join(DEFAULT_PROJECT_ROOT, "outputs", "live_session_bundle.json"),
  fetchImpl = globalThis.fetch,
} = {}) {
  const runtime = await createHeadsUpPulseRuntime({ projectRoot, fetchImpl });
  const bridgeMeta = await runtime.bridgeController.init();

  runtime.bridgeController.host?.pushLaunchSource("glassesMenu");
  await runtime.marketEngine.refreshFeeds();

  const initialState = await runtime.getPulseState({ refresh: false });
  const renderedFrames = [];

  // 1. Create startup page container on Card 0 (Telegram @HyperliquidAlphaDesk alert)
  const startupFrame = await runtime.syncActiveCardToGlasses({ startup: true });
  renderedFrames.push(startupFrame);

  // 2. Open Even G2 microphone after startup container exists, push PCM frame, and stage voice reply
  const micOpened = await runtime.bridgeController.setMicrophone(true);
  runtime.bridgeController.host?.pushAudioFrame({
    audioPcm: [18, 52, 108, 140, 95, 44, 16, 4],
    source: "glasses",
    direction: -8,
    speakerRole: "self",
  });
  await runtime.bridgeController.setMicrophone(false);

  runtime.telegramEngine.stageVoiceReply({
    cardId: "card-tg-ops-reply",
    transcript: "Confirmed 15:20 GMT+4 remote slot. Ready.",
  });

  // 3. Scroll through all 4 cards and validate every EvenHubPageContainer frame
  for (let i = 1; i < initialState.cards.length; i += 1) {
    const upgraded = await runtime.setActiveCardIndex(i);
    renderedFrames.push(upgraded);
  }

  // 4. Approve Telegram reply via backend dispatch helper + confirm 1-tap Hyperliquid paper hedge via R1 Ring tap
  const tgDelivery = await dispatchTelegramReply({
    chatHandle: "@DaosHubDubai",
    replyText: "Confirmed 15:20 GMT+4 remote slot. Ready.",
    networkWhitelist: runtime.manifest.networkWhitelist,
    env: {},
  });
  const tgDecision = runtime.telegramEngine.recordReplyDecision({
    cardId: "card-tg-ops-reply",
    action: "approve",
    deliveryReceipt: tgDelivery,
    gestureSource: "GLASSES_R",
  });

  await runtime.setActiveCardIndex(1); // Card 1: Hyperliquid BTC-PERP hedge
  runtime.bridgeController.host?.pushGesture({ eventType: 0, eventSource: 2 }); // CLICK_EVENT from RING

  const finalState = await runtime.getPulseState({ refresh: false });
  const cardValidations = finalState.cards.map((c) => ({
    cardId: c.id,
    ...validateG2CardSpec(c),
  }));

  const bundle = {
    generatedAt: new Date().toISOString(),
    hackathon: {
      id: 2477,
      title: "Heads Up: Even Realities Hackathon by TVM Ventures & Daos Hub",
      tracksEntered: runtime.manifest.tracks,
    },
    bridgeMeta,
    launchSource: runtime.bridgeController.launchSource,
    micOpened,
    invariants: finalState.invariants,
    marketSnapshot: finalState.marketSnapshot,
    cards: finalState.cards,
    cardValidations,
    validatedContainers: finalState.validatedContainers,
    renderedFrames,
    paperOrders: finalState.paperOrders,
    approvedTelegramReplies: [tgDecision],
    hostCallCount: runtime.bridgeController.host?.getCallLog().length ?? 0,
    ledgerEventCount: runtime.eventBus.getLedger().length,
    recentLedger: runtime.eventBus.getRecentEvents(16),
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await runtime.shutdown();
  return bundle;
}
