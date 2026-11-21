/**
 * Vertical Slice: CORS-Whitelisted Backend Proxy & Static WebView Host.
 *
 * Imports ONLY Node.js standard library modules and `../../kernel/event_bus.mjs`
 * (zero sibling feature imports).
 *
 * Responsibilities:
 * - Enforces `app.json` CORS origin allowlist and upstream domain whitelist.
 * - Keeps `TELEGRAM_BOT_TOKEN` strictly in server memory (zero client secrets).
 * - Serves `web/` static assets + `app.json` + `/api/health`, `/api/pulse`,
 *   `/api/action/confirm`, `/api/telegram/reply-draft`, and `/api/stt/transcribe`.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { TOPICS, assertPaperTradingSafety, truncateGlanceLine } from "../../kernel/event_bus.mjs";

const MIME_BY_EXT = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webm": "video/webm",
});

const VOICE_PRESET_CORPUS = Object.freeze({
  approve_dubai_slot: "Confirmed 15:20 GMT+4 remote slot. Ready.",
  hedge_btc_50: "Paper short BTC 50 dollars on testnet",
  hedge_eth_40: "Paper long ETH 40 dollars on testnet",
  ack_alpha_desk: "Ack BTC funding shift, watching G2 feed.",
});

export async function loadAppManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, "app.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

export function isOriginAllowed(originHeader, allowedOrigins = []) {
  if (!originHeader || originHeader === "null") {
    // Same-origin requests, Node test clients, and local Even Hub simulator WebViews omit Origin or send 'null'.
    return true;
  }
  try {
    const parsed = new URL(originHeader);
    const baseOrigin = `${parsed.protocol}//${parsed.hostname}`;
    return allowedOrigins.some(
      (allowed) => originHeader === allowed || baseOrigin === allowed
    );
  } catch {
    return false;
  }
}

export function isUpstreamWhitelisted(targetUrl, networkWhitelist = []) {
  try {
    const parsed = new URL(targetUrl);
    const origin = `${parsed.protocol}//${parsed.hostname}`;
    return networkWhitelist.includes(origin);
  } catch {
    return false;
  }
}

async function readJsonBody(req, maxBytes = 65_536) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("Request body exceeds 64 KB limit.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function sendJson(res, statusCode, payload, corsHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...corsHeaders,
  });
  res.end(body);
}

export async function dispatchTelegramReply({
  chatId,
  chatHandle,
  replyText,
  networkWhitelist,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  const cleanedReply = truncateGlanceLine(replyText, 120);
  if (!cleanedReply) {
    throw new Error("replyText must be a non-empty string.");
  }

  const botToken = String(env?.TELEGRAM_BOT_TOKEN || "").trim();
  const targetChatId = String(chatId || env?.TELEGRAM_DEFAULT_CHAT_ID || "").trim();

  if (botToken && targetChatId && typeof fetchImpl === "function") {
    const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
    if (!isUpstreamWhitelisted(endpoint, networkWhitelist)) {
      throw new Error("Telegram API origin is not whitelisted in app.json.");
    }
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: cleanedReply,
      }),
    });
    if (!response.ok) {
      throw new Error(`Telegram Bot API returned HTTP ${response.status}`);
    }
    const resultJson = await response.json();
    return {
      delivered: true,
      deliveryMode: "telegram_bot_api",
      chatHandle: chatHandle || targetChatId,
      messageId: resultJson?.result?.message_id ?? null,
      receiptHash: crypto
        .createHash("sha256")
        .update(`tg-live:${targetChatId}:${cleanedReply}`)
        .digest("hex")
        .slice(0, 16),
      timestamp: new Date().toISOString(),
    };
  }

  const receiptHash = crypto
    .createHash("sha256")
    .update(`tg-paper:${chatHandle || targetChatId || "priority"}:${cleanedReply}`)
    .digest("hex")
    .slice(0, 16);

  return {
    delivered: true,
    deliveryMode: "local_paper_receipt",
    chatHandle: chatHandle || "@DaosHubDubai",
    replyPreview: cleanedReply,
    receiptHash,
    timestamp: new Date().toISOString(),
  };
}

export function createBackendProxyServer({
  projectRoot,
  eventBus,
  manifest,
  handlers = {},
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  if (!projectRoot) {
    throw new Error("createBackendProxyServer requires projectRoot.");
  }
  if (!eventBus) {
    throw new Error("createBackendProxyServer requires an EventBus instance.");
  }

  const webRoot = path.resolve(projectRoot, "web");
  const appJsonPath = path.resolve(projectRoot, "app.json");
  const allowedOrigins = manifest?.corsAllowedOrigins || [
    "http://127.0.0.1",
    "http://localhost",
    "https://hub.evenrealities.com",
  ];
  const networkWhitelist = manifest?.networkWhitelist || [
    "https://api.hyperliquid-testnet.xyz",
    "https://api.hyperliquid.xyz",
    "https://gamma-api.polymarket.com",
    "https://api.telegram.org",
  ];

  const server = http.createServer(async (req, res) => {
    const originHeader = req.headers.origin;
    if (!isOriginAllowed(originHeader, allowedOrigins)) {
      sendJson(res, 403, {
        error: "CORS_ORIGIN_DENIED",
        message: "Origin is not permitted by app.json corsAllowedOrigins.",
      });
      return;
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": originHeader || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = reqUrl.pathname;

    eventBus.publish(TOPICS.PROXY_REQUEST_LOGGED, {
      method: req.method,
      pathname,
    });

    try {
      if (req.method === "GET" && pathname === "/api/health") {
        sendJson(
          res,
          200,
          {
            status: "ok",
            service: "headsup-pulse-even-g2-proxy",
            sdkVersion: manifest?.sdkVersion || "0.0.16",
            display: manifest?.display || { width: 576, height: 288 },
            paperTradingOnly: true,
            zeroClientSecrets: true,
            telegramMode: env?.TELEGRAM_BOT_TOKEN
              ? "telegram_bot_api"
              : "local_paper_receipt",
            networkWhitelist,
          },
          corsHeaders
        );
        return;
      }

      if (req.method === "GET" && pathname === "/api/pulse") {
        const refresh = reqUrl.searchParams.get("refresh") === "1";
        const payload = handlers.getPulseState
          ? await handlers.getPulseState({ refresh })
          : { cards: [], ledger: eventBus.getRecentEvents(15) };
        sendJson(res, 200, payload, corsHeaders);
        return;
      }

      if (req.method === "POST" && pathname === "/api/action/confirm") {
        const body = await readJsonBody(req);
        try {
          assertPaperTradingSafety({
            liveMainnetExecution: Boolean(body.liveMainnetExecution),
            custodyUserFunds: Boolean(body.custodyUserFunds),
          });
        } catch (safetyErr) {
          sendJson(
            res,
            403,
            { error: "SAFETY_LOCK_REJECTED", message: safetyErr.message },
            corsHeaders
          );
          return;
        }

        const receipt = handlers.onConfirmMarketAction
          ? await handlers.onConfirmMarketAction(body)
          : {
              status: "CONFIRMED_PAPER_TESTNET",
              cardId: body.cardId || "card-hl-btc-hedge",
              executionMode: "PAPER_TESTNET_ONLY",
            };
        sendJson(res, 200, { ok: true, receipt }, corsHeaders);
        return;
      }

      if (req.method === "POST" && pathname === "/api/telegram/reply-draft") {
        const body = await readJsonBody(req);
        const action = body.action || "approve";

        if (action === "dismiss") {
          const decision = handlers.onTelegramReplyDecision
            ? await handlers.onTelegramReplyDecision({
                cardId: body.cardId,
                action: "dismiss",
                gestureSource: body.gestureSource || "GLASSES_R",
              })
            : { status: "THREAD_MUTED_1H", cardId: body.cardId };
          sendJson(res, 200, { ok: true, decision }, corsHeaders);
          return;
        }

        const deliveryReceipt = await dispatchTelegramReply({
          chatId: body.chatId,
          chatHandle: body.chatHandle,
          replyText: body.replyText || "Confirmed from Even G2.",
          networkWhitelist,
          fetchImpl,
          env,
        });

        const decision = handlers.onTelegramReplyDecision
          ? await handlers.onTelegramReplyDecision({
              cardId: body.cardId || "card-tg-ops-reply",
              action: "approve",
              deliveryReceipt,
              gestureSource: body.gestureSource || "GLASSES_R",
            })
          : { status: "APPROVED_AND_DISPATCHED", deliveryReceipt };

        sendJson(res, 200, { ok: true, deliveryReceipt, decision }, corsHeaders);
        return;
      }

      if (req.method === "POST" && pathname === "/api/stt/transcribe") {
        const body = await readJsonBody(req);
        const presetKey = String(body.preset || "");
        const rawText = String(body.transcriptHint || "").trim();
        const transcript =
          rawText ||
          VOICE_PRESET_CORPUS[presetKey] ||
          "Confirmed 15:20 GMT+4 remote slot. Ready.";
        const pcmByteLength = Array.isArray(body.audioPcm)
          ? body.audioPcm.length
          : Number(body.byteLength || 640);
        const source = body.source === "phone" ? "phone" : "glasses";
        const targetTrack =
          transcript.toLowerCase().includes("paper") ||
          transcript.toLowerCase().includes("testnet")
            ? "crypto_defi"
            : "messaging_news";

        let stagedResult = null;
        if (handlers.onVoiceTranscript) {
          stagedResult = await handlers.onVoiceTranscript({
            cardId: body.cardId,
            transcript,
            targetTrack,
            source,
          });
        }

        sendJson(
          res,
          200,
          {
            ok: true,
            sttEngine: "headsup-byo-stt-v1",
            source,
            pcmByteLength,
            direction: body.direction ?? -6,
            speakerRole: body.speakerRole ?? "self",
            transcript,
            targetTrack,
            stagedResult,
          },
          corsHeaders
        );
        return;
      }

      if (req.method === "GET" && pathname === "/app.json") {
        const appJsonRaw = await fs.readFile(appJsonPath, "utf8");
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        });
        res.end(appJsonRaw);
        return;
      }

      if (req.method === "GET") {
        const relTarget = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        const resolved = path.resolve(webRoot, relTarget);
        if (!resolved.startsWith(webRoot + path.sep) && resolved !== path.join(webRoot, "index.html")) {
          sendJson(res, 403, { error: "PATH_TRAVERSAL_BLOCKED" }, corsHeaders);
          return;
        }
        const content = await fs.readFile(resolved);
        const ext = path.extname(resolved).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
          "Cache-Control": "no-cache",
          ...corsHeaders,
        });
        res.end(content);
        return;
      }

      sendJson(res, 404, { error: "NOT_FOUND", pathname }, corsHeaders);
    } catch (err) {
      sendJson(
        res,
        400,
        { error: "BAD_REQUEST", message: err?.message || String(err) },
        corsHeaders
      );
    }
  });

  return server;
}
