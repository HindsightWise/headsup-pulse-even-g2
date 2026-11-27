import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  EventBus,
  G2_BODY_HEIGHT_PX,
  G2_HEADER_HEIGHT_PX,
  G2_INNER_WIDTH_PX,
  G2_LINE_HEIGHT_PX,
  MAX_BRIGHTNESS,
  MAX_LINE_CHARS,
  MAX_VISIBLE_LINES,
  MIN_BRIGHTNESS,
  TOPICS,
  assertPaperTradingSafety,
  clampBrightness,
  fitsG2Width,
  formatGlanceLines,
  getG2Invariants,
  measureG2TextWidthPx,
  truncateG2LineByPx,
  validateG2CardSpec,
} from "../src/kernel/event_bus.mjs";
import {
  EvenG2BridgeController,
  assertStrictPageContainerContract,
  buildEvenG2PageContainer,
  loadEvenHubSdk,
} from "../src/features/sdk_bridge/index.mjs";
import {
  MarketPulseEngine,
  simulateL2OrderBookImpact,
} from "../src/features/market_pulse/index.mjs";
import {
  TelegramDigestEngine,
  normalizeTelegramBotUpdates,
} from "../src/features/telegram_digest/index.mjs";
import { dispatchTelegramReply } from "../src/features/backend_proxy/index.mjs";
import { createHeadsUpPulseRuntime } from "../src/app.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function extractModuleSpecifiers(sourceCode) {
  const specs = [];
  const staticRe = /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = staticRe.exec(sourceCode)) !== null) {
    specs.push(match[1]);
  }
  while ((match = dynamicRe.exec(sourceCode)) !== null) {
    specs.push(match[1]);
  }
  return specs;
}

test("1. Kernel optical invariants, paper-only safety lock, and immutable EventBus ledger", () => {
  const inv = getG2Invariants();
  assert.equal(inv.DISPLAY_WIDTH, 576);
  assert.equal(inv.DISPLAY_HEIGHT, 288);
  assert.equal(inv.MAX_VISIBLE_LINES, 4);
  assert.equal(inv.MAX_LINE_CHARS, 44);
  assert.equal(inv.MIN_BRIGHTNESS, 0);
  assert.equal(inv.MAX_BRIGHTNESS, 4);
  assert.equal(inv.PAPER_TRADING_ONLY, true);

  assert.equal(clampBrightness(4), 4);
  assert.equal(clampBrightness(0), 0);
  assert.equal(clampBrightness(2.4), 2);
  assert.ok(clampBrightness(99) <= MAX_BRIGHTNESS);
  assert.ok(clampBrightness(-5) >= MIN_BRIGHTNESS);

  const lines = formatGlanceLines([
    "Line one short",
    "Line two with extra text that definitely exceeds forty-four characters on display",
    "Line three",
    "Line four",
    "Line five should be dropped cleanly",
  ]);
  assert.ok(lines.length <= MAX_VISIBLE_LINES, `Expected <=4 lines, got ${lines.length}`);
  for (const line of lines) {
    assert.ok(line.length <= MAX_LINE_CHARS, `Line exceeded 44 chars: ${line}`);
  }

  const safety = assertPaperTradingSafety({ liveMainnetExecution: false });
  assert.equal(safety.executionMode, "PAPER_TESTNET_ONLY");
  assert.equal(safety.custodyOfUserFunds, false);
  assert.equal(safety.realFundsAtRiskUsd, 0);

  assert.throws(
    () => assertPaperTradingSafety({ liveMainnetExecution: true }),
    /Blocked unsafe execution/
  );
  assert.throws(
    () => assertPaperTradingSafety({ custodyUserFunds: true }),
    /Blocked unsafe execution/
  );

  const bus = new EventBus();
  const received = [];
  const unsub = bus.subscribe(TOPICS.MARKET_PULSE_UPDATED, (ev) => {
    received.push(ev);
  });

  const published = bus.publish(TOPICS.MARKET_PULSE_UPDATED, { btcMarkPx: 60312 });
  assert.equal(Object.isFrozen(published), true);
  assert.equal(Object.isFrozen(published.payload), true);
  assert.equal(received.length, 1);
  assert.equal(published.seq, 1);

  unsub();
  bus.publish(TOPICS.MARKET_PULSE_UPDATED, { btcMarkPx: 60400 });
  assert.equal(received.length, 1);
  assert.equal(bus.getLedger().length, 2);
});

test("2. Vertical-slice AST boundary enforcement (zero sibling feature imports)", async () => {
  const sliceRules = {
    sdk_bridge: new Set(["../../kernel/event_bus.mjs", "@evenrealities/even_hub_sdk"]),
    market_pulse: new Set(["../../kernel/event_bus.mjs"]),
    telegram_digest: new Set(["../../kernel/event_bus.mjs"]),
    backend_proxy: new Set([
      "../../kernel/event_bus.mjs",
      "node:crypto",
      "node:fs/promises",
      "node:http",
      "node:path",
    ]),
  };

  for (const [sliceName, allowedImports] of Object.entries(sliceRules)) {
    const sliceFile = path.join(PROJECT_ROOT, "src", "features", sliceName, "index.mjs");
    const code = await fs.readFile(sliceFile, "utf8");
    const imports = extractModuleSpecifiers(code);
    assert.ok(imports.length > 0, `Expected imports in ${sliceName}`);
    for (const spec of imports) {
      assert.equal(
        allowedImports.has(spec),
        true,
        `Forbidden import '${spec}' inside vertical slice '${sliceName}'`
      );
      assert.equal(
        spec.startsWith("../") && !spec.startsWith("../../kernel/"),
        false,
        `Cross-slice sibling import '${spec}' detected in '${sliceName}'`
      );
    }
  }
});

test("3. Official @evenrealities/even_hub_sdk@0.0.16 lifecycle, zOrderIndex, brightness 0..4, and events", async () => {
  const sdk = await loadEvenHubSdk();
  const bus = new EventBus();
  const controller = new EvenG2BridgeController({ eventBus: bus });
  const initMeta = await controller.init();
  assert.equal(initMeta.ready, true);
  assert.equal(initMeta.device.model, "g2");

  const sampleCard = {
    id: "card-test-g2",
    track: "crypto_defi",
    headerTag: "HL BTC-PERP",
    title: "Test Card",
    brightness: clampBrightness(4),
    safetyMode: "PAPER_TESTNET_ONLY",
    lines: formatGlanceLines([
      "HL BTC $60,312 (-2.3%) TEST $60,519",
      "FUND +0.0012%/h | OI 37.9K",
      "PAPER SHORT 0.01 BTC @ $60,519",
      "TAP Confirm Paper | 2xTAP Skip | SCRL Next",
    ]),
  };

  const startupFrame = await controller.renderStartupCard(sampleCard, {
    cardIndex: 0,
    totalCards: 4,
  });
  assert.equal(startupFrame.resultCode, sdk.StartUpPageCreateResult.success);
  assert.equal(startupFrame.sdkValidation.valid, true);

  for (const b of [0, 1, 2, 3, 4]) {
    const upgraded = await controller.upgradeCardText(
      { ...sampleCard, brightness: b },
      { cardIndex: 0, totalCards: 4 }
    );
    assert.equal(upgraded.sdkValidation.valid, true);
    assert.equal(upgraded.brightness, b);
  }

  // Verify official SDK rejects invalid zOrderIndex and invalid menu constraints
  const missingZOrder = {
    containerTotalNum: 2,
    textObject: [
      {
        xPosition: 16,
        yPosition: 12,
        width: 544,
        height: 36,
        containerID: 1,
        containerName: "hdr",
        zOrderIndex: 1,
        isEventCapture: 0,
        content: "Header",
      },
      {
        xPosition: 16,
        yPosition: 56,
        width: 544,
        height: 216,
        containerID: 2,
        containerName: "body",
        isEventCapture: 1,
        content: "Missing zOrderIndex",
      },
    ],
  };
  const invalidZRes = sdk.validateEvenHubPageContainer(missingZOrder);
  assert.equal(invalidZRes.valid, false);

  assert.throws(() => {
    assertStrictPageContainerContract(
      {
        containerTotalNum: 1,
        textObject: [
          {
            xPosition: 0,
            yPosition: 0,
            width: DISPLAY_WIDTH + 20,
            height: DISPLAY_HEIGHT,
            containerID: 1,
            containerName: "overflow",
            zOrderIndex: 1,
            isEventCapture: 1,
            content: "Too wide",
          },
        ],
      },
      sdk
    );
  }, /overflows Even G2/);

  // Verify glasses MIC opens cleanly after startup page creation and delivers PCM + gestures
  const gestures = [];
  const voices = [];
  bus.subscribe(TOPICS.GLASSES_INPUT_GESTURE, (e) => gestures.push(e.payload));
  bus.subscribe(TOPICS.GLASSES_VOICE_CAPTURED, (e) => voices.push(e.payload));

  const micOk = await controller.setMicrophone(true, sdk.AudioInputSource.Glasses);
  assert.equal(micOk, true);
  controller.host.pushAudioFrame({
    audioPcm: [10, 20, 30, 40],
    source: "glasses",
    direction: -10,
    speakerRole: "self",
  });
  controller.host.pushGesture({
    eventType: sdk.OsEventTypeList.LONG_PRESS_EVENT,
    eventSource: sdk.EventSourceType.TOUCH_EVENT_FROM_RING,
  });
  controller.host.pushMenuClick(1);

  assert.equal(voices.length, 1);
  assert.equal(voices[0].speakerRole, "self");
  assert.equal(voices[0].direction, -10);
  assert.equal(gestures.length, 2);
  assert.equal(gestures[0].gesture, "VOICE_PTT_START");
  assert.equal(gestures[0].source, "RING");
  assert.equal(gestures[1].gesture, "TAP_CONFIRM");

  await controller.shutdown(0);
});

test("4. Dual-track MarketPulseEngine and TelegramDigestEngine connected flow", async () => {
  const bus = new EventBus();
  const market = new MarketPulseEngine({ eventBus: bus });
  const telegram = new TelegramDigestEngine({ eventBus: bus });

  const { snapshot, cards: marketCards } = await market.refreshFeeds({ forceOffline: true });
  assert.equal(snapshot.hyperliquidSource, "deterministic_fallback");
  assert.equal(marketCards.length, 2);

  const tgCards = telegram.buildDigestCards();
  assert.equal(tgCards.length, 2);
  // Verify noisy @RandomMemeSpam chat was filtered out
  assert.equal(tgCards[0].filteredNoiseChats, 1);
  assert.equal(tgCards[0].linkedCardId, "card-hl-btc-hedge");

  for (const card of [...marketCards, ...tgCards]) {
    const check = validateG2CardSpec(card);
    assert.equal(check.valid, true, check.errors.join("; "));
  }

  const voiceStaged = telegram.stageVoiceReply({
    cardId: "card-tg-ops-reply",
    transcript: "Approved from Even G2 temple mic.",
  });
  assert.equal(voiceStaged.inputMode, "voice_stt");

  const updatedTg = telegram.buildDigestCards();
  assert.ok(updatedTg[1].lines[2].startsWith('VOICE: "Approved from Even G2'));

  const orderReceipt = market.confirmOrDismissOrder({
    cardId: "card-hl-btc-hedge",
    action: "confirm",
    gestureSource: "RING",
  });
  assert.equal(orderReceipt.status, "CONFIRMED_PAPER_TESTNET");
  assert.equal(orderReceipt.executionMode, "PAPER_TESTNET_ONLY");

  telegram.dispose();
});

test("5. Real TCP HTTP backend proxy, CORS allowlist, safety gate, and zero-secret Telegram routing", async () => {
  let upstreamTgCalled = null;
  const customFetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes("api.telegram.org")) {
      upstreamTgCalled = { urlStr, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr.includes("hyperliquid.xyz/info") && !urlStr.includes("testnet")) {
      return new Response(
        JSON.stringify([
          { universe: [{ name: "BTC" }, { name: "ETH" }, { name: "SOL" }] },
          [
            { markPx: "61200", prevDayPx: "60000", funding: "0.000015", openInterest: "38000" },
            { markPx: "1720", prevDayPx: "1700", funding: "-0.00001", openInterest: "520000" },
            { markPx: "72.5", prevDayPx: "70.0", funding: "0.00002", openInterest: "1500000" },
          ],
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (urlStr.includes("hyperliquid-testnet.xyz/info")) {
      return new Response(
        JSON.stringify({ BTC: "61250.5", ETH: "1722.1", SOL: "72.65" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify([
        {
          id: "9001",
          question: "BTC above $65k by Friday?",
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.42","0.58"]',
          volume24hr: 310000,
          slug: "btc-65k-friday",
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const runtime = await createHeadsUpPulseRuntime({
    projectRoot: PROJECT_ROOT,
    fetchImpl: customFetch,
    env: {},
  });
  await runtime.bridgeController.init();
  await runtime.marketEngine.refreshFeeds();
  await runtime.syncActiveCardToGlasses({ startup: true });

  await new Promise((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const { port } = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5a. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://hub.evenrealities.com" },
    });
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.paperTradingOnly, true);
    assert.equal(health.zeroClientSecrets, true);

    // 5b. CORS unauthorized origin blocked
    const corsBlocked = await fetch(`${baseUrl}/api/pulse`, {
      headers: { Origin: "https://malicious.example.org" },
    });
    assert.equal(corsBlocked.status, 403);

    // 5c. Pulse state returns 4 validated Even G2 containers
    const pulseRes = await fetch(`${baseUrl}/api/pulse`);
    assert.equal(pulseRes.status, 200);
    const pulse = await pulseRes.json();
    assert.equal(pulse.cards.length, 4);
    assert.equal(
      pulse.validatedContainers.every((c) => c.sdkValidation.valid === true),
      true
    );

    // 5d. Live mainnet execution flag strictly rejected with HTTP 403
    const unsafeRes = await fetch(`${baseUrl}/api/action/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-hl-btc-hedge", liveMainnetExecution: true }),
    });
    assert.equal(unsafeRes.status, 403);

    // 5e. Paper order confirmation succeeds
    const paperRes = await fetch(`${baseUrl}/api/action/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-hl-btc-hedge", action: "confirm" }),
    });
    assert.equal(paperRes.status, 200);
    const paperJson = await paperRes.json();
    assert.equal(paperJson.receipt.executionMode, "PAPER_TESTNET_ONLY");

    // 5f. BYO-STT endpoint + Telegram paper delivery receipt
    const sttRes = await fetch(`${baseUrl}/api/stt/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: "card-tg-ops-reply",
        preset: "approve_dubai_slot",
        source: "glasses",
        audioPcm: [12, 44, 88, 32],
      }),
    });
    assert.equal(sttRes.status, 200);
    const sttJson = await sttRes.json();
    assert.equal(sttJson.targetTrack, "messaging_news");

    const tgRes = await fetch(`${baseUrl}/api/telegram/reply-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: "card-tg-ops-reply",
        chatHandle: "@DaosHubDubai",
        replyText: sttJson.transcript,
      }),
    });
    assert.equal(tgRes.status, 200);
    const tgJson = await tgRes.json();
    assert.equal(tgJson.deliveryReceipt.deliveryMode, "local_paper_receipt");

    // 5g. Verify server-side TELEGRAM_BOT_TOKEN dispatch never leaks token in receipt
    const runtimeToken = "test_bot_tok_" + "998877";
    const liveTgReceipt = await dispatchTelegramReply({
      chatId: "-100247702",
      chatHandle: "@DaosHubDubai",
      replyText: "Server-routed reply",
      networkWhitelist: runtime.manifest.networkWhitelist,
      fetchImpl: customFetch,
      env: { TELEGRAM_BOT_TOKEN: runtimeToken },
    });
    assert.equal(liveTgReceipt.deliveryMode, "telegram_bot_api");
    assert.equal(liveTgReceipt.messageId, 777);
    assert.equal(JSON.stringify(liveTgReceipt).includes(runtimeToken), false);
    assert.ok(upstreamTgCalled);

    // 5h. Serve web/index.html
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const htmlBody = await htmlRes.text();
    assert.ok(htmlBody.includes('data-theme="noir"'));
  } finally {
    runtime.server.close();
    await runtime.shutdown();
  }
});

test("6. Artistry harness (M >= 0.68), DoraHacks preflight (0 errors/0 warnings), bundle, and prose hygiene", async () => {
  // Verify live_session_bundle.json
  const bundleRaw = await fs.readFile(
    path.join(PROJECT_ROOT, "outputs", "live_session_bundle.json"),
    "utf8"
  );
  const bundle = JSON.parse(bundleRaw);
  assert.equal(bundle.cards.length, 4);
  assert.equal(
    bundle.validatedContainers.every((c) => c.sdkValidation.valid === true),
    true
  );

  // Verify web/index.html anti-slop & link invariants
  const htmlPath = path.join(PROJECT_ROOT, "web", "index.html");
  const html = await fs.readFile(htmlPath, "utf8");
  assert.match(html, /<html\s+lang="en"\s+data-theme="noir">/);
  assert.doesNotMatch(html, /border-left\s*:\s*[1-9]\d*px\s+solid/);
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);

  const extAnchorRe = /<a\s+[^>]*href="https?:\/\/[^"]+"[^>]*>/g;
  const anchors = html.match(extAnchorRe) || [];
  assert.ok(anchors.length >= 3);
  for (const tag of anchors) {
    assert.match(tag, /target="_blank"/);
    assert.match(tag, /rel="noopener"/);
  }

  // Run artistry_harness.py
  const { stdout: artistryOut } = await execFileAsync("python3", [
    "/Users/zerbytheboss/.gemini/config/artistry_harness.py",
    htmlPath,
  ]);
  const artistryJson = JSON.parse(artistryOut);
  assert.equal(artistryJson.elephant_synthesis.passed_artistry_gate, true);
  assert.ok(artistryJson.elephant_synthesis.eysenck_artistry_M >= 0.68);

  // Run dorahacks_preflight.py validate-build
  const { stdout: preflightOut } = await execFileAsync("python3", [
    "/Users/zerbytheboss/.gemini/config/skills/dorahacks-builder/scripts/dorahacks_preflight.py",
    "validate-build",
    "--body-file",
    path.join(PROJECT_ROOT, "submission", "BUIDL_DRAFT.md"),
    "--prior-submissions",
    "0",
    "--github-url",
    "https://github.com/HindsightWise/headsup-pulse-even-g2",
    "--video-url",
    "https://youtu.be/headsup-pulse-even-g2-demo",
    "--require-github",
    "--require-video",
    "--json",
  ]);
  const preflightJson = JSON.parse(preflightOut);
  assert.equal(preflightJson.passed, true);
  assert.equal(preflightJson.error_count, 0);
  assert.equal(preflightJson.warning_count, 0);

  // Prose hygiene check across docs and UI
  const bannedRe =
    /\b(?:delve|foster|leverage|importantly|genuinely)\b|it's worth noting|Bottom Line:|In short:/i;
  for (const rel of [
    "README.md",
    "submission/BUIDL_DRAFT.md",
    "submission/SUBMISSION_RUNBOOK.md",
    "web/index.html",
  ]) {
    const content = await fs.readFile(path.join(PROJECT_ROOT, rel), "utf8");
    assert.doesNotMatch(content, bannedRe, `Banned word found in ${rel}`);
  }
});

test("7. Nov 23 live Telegram getUpdates polling and Hyperliquid L2 VWAP slippage preview", async () => {
  const sampleBotUpdates = [
    {
      update_id: 7001,
      channel_post: {
        chat: { id: -100247701, title: "Hyperliquid Alpha Desk", username: "HyperliquidAlphaDesk", type: "channel" },
        author_signature: "DeskBot",
        text: "BTC funding turned +0.0021%/h on Hyperliquid; check testnet hedge spread.",
      },
    },
    {
      update_id: 7002,
      message: {
        chat: { id: -100247702, title: "Daos Hub Dubai", username: "DaosHubDubai", type: "supergroup" },
        from: { username: "NadiaDubai", first_name: "Nadia" },
        text: "Remote Demo Day slot confirmed for Dec 3 at 15:20 GMT+4.",
      },
    },
    {
      update_id: 7003,
      message: {
        chat: { id: -100999888, title: "Spam Noise Group", username: "SpamNoiseGroup", type: "group" },
        from: { first_name: "NoiseBot" },
        text: "Off-topic meme message that must stay filtered off G2.",
      },
    },
  ];

  const normalized = normalizeTelegramBotUpdates(sampleBotUpdates);
  assert.equal(normalized.nextUpdateOffset, 7004);
  assert.equal(normalized.updates.length, 3);
  assert.equal(normalized.updates[0].linkedCardId, "card-hl-btc-hedge");

  const bus = new EventBus();
  const tgEngine = new TelegramDigestEngine({ eventBus: bus });
  const ingested = tgEngine.ingestBotApiUpdates({ ok: true, result: sampleBotUpdates });
  assert.equal(ingested.nextUpdateOffset, 7004);
  assert.equal(ingested.droppedNoiseCount, 1);
  assert.equal(ingested.cards.length, 2);
  for (const card of ingested.cards) {
    assert.equal(validateG2CardSpec(card).valid, true);
  }
  const duplicatePoll = tgEngine.ingestBotApiUpdates({ ok: true, result: sampleBotUpdates });
  assert.equal(duplicatePoll.ingestedCount, 0);

  const l2Sim = simulateL2OrderBookImpact({
    coin: "BTC",
    side: "SHORT",
    sizeCoins: 0.15,
    levels: [
      [
        { px: "60500.0", sz: "0.10" },
        { px: "60480.0", sz: "0.20" },
      ],
      [
        { px: "60520.0", sz: "0.10" },
        { px: "60540.0", sz: "0.20" },
      ],
    ],
  });
  assert.equal(l2Sim.executionMode, "PAPER_TESTNET_ONLY");
  assert.equal(l2Sim.fullyFilled, true);
  assert.ok(l2Sim.vwapFillPx < 60500);
  assert.ok(l2Sim.slippageBps > 0);
  assert.ok(l2Sim.top5BookDepthUsd > 10_000);

  const mockBotToken = "tg_poll_tok_" + "nov23_demo";
  const pollFetch = async (url, init = {}) => {
    const target = String(url);
    const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
    if (target.includes("/getUpdates")) {
      return new Response(
        JSON.stringify({ ok: true, result: sampleBotUpdates }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (target.includes("api.hyperliquid-testnet.xyz/info") && parsedBody.type === "l2Book") {
      return new Response(
        JSON.stringify({
          coin: "BTC",
          levels: [
            [
              { px: "60510.0", sz: "0.08" },
              { px: "60495.0", sz: "0.25" },
            ],
            [
              { px: "60526.0", sz: "0.08" },
              { px: "60542.0", sz: "0.25" },
            ],
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (target.includes("api.hyperliquid.xyz/info")) {
      return new Response(
        JSON.stringify([
          { universe: [{ name: "BTC" }] },
          [{ markPx: "60500.0", prevDayPx: "61000.0", funding: "0.000012", openInterest: "38000" }],
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (target.includes("api.hyperliquid-testnet.xyz/info")) {
      return new Response(JSON.stringify({ BTC: "60518.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify([
        {
          id: "559651",
          question: "Macro rate cut before Q1 close?",
          outcomePrices: ["0.642", "0.358"],
          volume24hr: 184250,
          slug: "macro-rate-cut-q1-close",
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const runtime = await createHeadsUpPulseRuntime({
    projectRoot: PROJECT_ROOT,
    fetchImpl: pollFetch,
    env: { TELEGRAM_BOT_TOKEN: mockBotToken },
  });
  await runtime.bridgeController.init();
  await runtime.marketEngine.refreshFeeds();
  await runtime.syncActiveCardToGlasses({ startup: true });

  await new Promise((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const { port } = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const pollRes = await fetch(`${baseUrl}/api/telegram/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset: 7000 }),
    });
    assert.equal(pollRes.status, 200);
    const pollJson = await pollRes.json();
    assert.equal(pollJson.pollMode, "telegram_bot_api");
    assert.equal(pollJson.droppedNoiseCount, 1);
    assert.equal(pollJson.nextUpdateOffset, 7004);
    assert.equal(JSON.stringify(pollJson).includes(mockBotToken), false);

    const pulseRes = await fetch(`${baseUrl}/api/pulse`);
    assert.equal(pulseRes.status, 200);
    const pulseJson = await pulseRes.json();
    assert.equal(pulseJson.cards[0].id, "card-tg-alpha-bridge");
    assert.equal(pulseJson.cards[1].stagedTicket.l2Preview.executionMode, "PAPER_TESTNET_ONLY");

    const l2Res = await fetch(`${baseUrl}/api/market/l2-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coin: "BTC", side: "SHORT", sizeCoins: 0.1 }),
    });
    assert.equal(l2Res.status, 200);
    const l2Json = await l2Res.json();
    assert.equal(l2Json.preview.bookSource, "hyperliquid_testnet_l2");
    assert.equal(l2Json.preview.executionMode, "PAPER_TESTNET_ONLY");
    assert.ok(Number.isFinite(l2Json.preview.vwapFillPx));
    assert.ok(Number.isFinite(l2Json.preview.slippageBps));

    const blockedL2Res = await fetch(`${baseUrl}/api/market/l2-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coin: "BTC", side: "SHORT", liveMainnetExecution: true }),
    });
    assert.equal(blockedL2Res.status, 403);
  } finally {
    runtime.server.close();
    await runtime.shutdown();
  }
});

test("8. Pixel-exact Even G2 LVGL font metrics, zero overflow/clip/bleed, and real WebView bridge contract", async () => {
  const sdk = await loadEvenHubSdk();
  const bus = new EventBus();
  const market = new MarketPulseEngine({ eventBus: bus });
  const telegram = new TelegramDigestEngine({ eventBus: bus });

  await market.refreshFeeds({ forceOffline: true });
  telegram.stageVoiceReply({
    cardId: "card-tg-ops-reply",
    transcript: "Confirmed 15:20 GMT+4 remote slot. Ready.",
  });

  const marketCards = market.buildGlanceCards();
  const tgCards = telegram.buildDigestCards();
  const orderedCards = [tgCards[0], marketCards[0], marketCards[1], tgCards[1]];

  // Verify wide-glyph truncation enforces <= 544px inner width even for all-'W' lines
  const wideLine = truncateG2LineByPx("W".repeat(44), G2_INNER_WIDTH_PX, MAX_LINE_CHARS);
  assert.ok(measureG2TextWidthPx(wideLine) <= G2_INNER_WIDTH_PX);

  for (let i = 0; i < orderedCards.length; i += 1) {
    const card = orderedCards[i];
    const page = buildEvenG2PageContainer(card, sdk, {
      cardIndex: i,
      totalCards: orderedCards.length,
    });
    const sdkRes = sdk.validateEvenHubPageContainer(page);
    assert.equal(sdkRes.valid, true, `SDK validation failed for ${card.id}`);

    const [headerObj, bodyObj] = page.textObject;
    assert.equal(headerObj.paddingLength, 0);
    assert.equal(headerObj.borderWidth, 0);
    assert.equal(headerObj.width, G2_INNER_WIDTH_PX);
    assert.equal(headerObj.height, G2_HEADER_HEIGHT_PX);
    assert.ok(headerObj.height >= G2_LINE_HEIGHT_PX);

    const hdrFit = fitsG2Width(headerObj.content, G2_INNER_WIDTH_PX);
    assert.equal(hdrFit.fits, true, `Header overflow on ${card.id}: ${hdrFit.widthPx}px`);
    assert.equal(hdrFit.lineCount, 1);

    assert.equal(bodyObj.paddingLength, 0);
    assert.equal(bodyObj.borderWidth, 0);
    assert.equal(bodyObj.width, G2_INNER_WIDTH_PX);
    assert.equal(bodyObj.height, G2_BODY_HEIGHT_PX);
    assert.ok(bodyObj.height >= MAX_VISIBLE_LINES * G2_LINE_HEIGHT_PX);

    const bodyLines = bodyObj.content.split("\n");
    assert.ok(bodyLines.length >= 1 && bodyLines.length <= MAX_VISIBLE_LINES);
    for (const line of bodyLines) {
      const lineFit = fitsG2Width(line, G2_INNER_WIDTH_PX);
      assert.equal(lineFit.fits, true, `Body line overflow on ${card.id}: "${line}" (${lineFit.widthPx}px)`);
      assert.equal(lineFit.lineCount, 1);
    }
  }

  // Verify web/index.html sends real official SDK payloads with zero unknown properties
  const html = await fs.readFile(path.join(PROJECT_ROOT, "web", "index.html"), "utf8");
  assert.doesNotMatch(html, /zOrderValidated|isEventCaptureCount/);
  assert.match(html, /paddingLength:\s*0/);
  assert.match(html, /borderWidth:\s*0/);
  assert.match(html, /contentOffset:\s*0/);
  assert.match(html, /contentLength:\s*headerObj\.content\.length/);
  assert.match(html, /window\._listenEvenAppMessage\s*=/);
  assert.match(html, /rebuildPageContainer/);
  assert.match(html, /isProto3DefaultClick/);

  // Regression: exact evenhub-simulator@0.9.5 wire envelopes (proto3 zero-omitted click + textEvent scroll)
  const simBus = new EventBus();
  const simController = new EvenG2BridgeController({ eventBus: simBus });
  await simController.init();
  const simGestures = [];
  simBus.subscribe(TOPICS.GLASSES_INPUT_GESTURE, (e) => simGestures.push(e.payload));

  globalThis.window._listenEvenAppMessage({
    type: "ListenEvenAppData",
    method: "evenHubEvent",
    data: ["sysEvent", { eventSource: 1 }],
  });
  globalThis.window._listenEvenAppMessage({
    type: "ListenEvenAppData",
    method: "evenHubEvent",
    data: ["textEvent", { containerID: 2, containerName: "hud-body", eventType: 2 }],
  });

  assert.equal(simGestures.length, 2);
  assert.equal(simGestures[0].gesture, "TAP_CONFIRM");
  assert.equal(simGestures[0].source, "GLASSES_R");
  assert.equal(simGestures[1].gesture, "SCROLL_NEXT");

  await simController.shutdown(0);
  telegram.dispose();
});
