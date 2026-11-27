# HeadsUp Pulse — Glanceable Telegram & Market Read-and-Write Companion for Even G2

## Problem & Overview

Active crypto operators and builders constantly pull out their phones during meetings or transit to check whether a Telegram ping matters or whether perpetual funding and prediction odds moved. Full phone dashboards crowd `576 x 288` monochrome eyewear, while passive notification mirrors block fast replies.

**HeadsUp Pulse** solves that everyday moment for **Even Realities G2** in one continuous read-and-write workflow across **Track 01 — Messaging & News (`4795`)**, **Track 02 — Crypto & DeFi (`4799`)**, and **`Best Telegram Integration`**:
- **Track 01 — Messaging & News (`4795`) + Best Telegram Integration:** Polls Telegram Bot API `getUpdates` streams (plus deterministic paper feeds), filters strictly to user-picked channels (`@HyperliquidAlphaDesk`, `@DaosHubDubai`, `@EvenBuildersOps`), deduplicates offsets, compresses unread threads into a 4-line brief, and dispatches 1-tap AI or voice replies.
- **Track 02 — Crypto & DeFi (`4799`):** Streams live **Hyperliquid** perpetual mark prices, hourly funding, Testnet mids, and live `l2Book` VWAP slippage previews alongside live **Polymarket** Gamma odds, staging 1-tap non-custodial paper hedges confirmed from the **Even R1 Ring** or temple touch bar.

## Architecture & Solution

HeadsUp Pulse uses a strict vertical-slice architecture (`Invariants -> Schema -> Ledger -> State Engine -> Pipe -> Paint`) built on official **`@evenrealities/even_hub_sdk@0.0.16`**:

1. **Optical & Safety Kernel (`src/kernel/event_bus.mjs`):** Enforces `576 x 288` bounds, `<= 4` visible lines, `<= 44` chars per line, integer `textColor` brightness `0..4`, and `PAPER_TRADING_ONLY = true` over an immutable `EventBus`.
2. **Official Even Hub SDK Bridge (`src/features/sdk_bridge/index.mjs`):** Calls `waitForEvenAppBridge()`, `createStartUpPageContainer()`, `textContainerUpgrade()`, `rebuildPageContainer()`, `audioControl(true, AudioInputSource.Glasses)`, and `onEvenHubEvent()`. Every frame enforces unique `zOrderIndex`, a single `isEventCapture: 1`, `<= 32` UTF-8 byte `menuObject` items, and passes `validateEvenHubPageContainer()`.
3. **Priority Telegram Digest Slice (`src/features/telegram_digest/index.mjs`):** Parses Telegram Bot API `getUpdates` payloads (`normalizeTelegramBotUpdates`, `ingestBotApiUpdates`), links `@HyperliquidAlphaDesk` funding alerts one scroll away from the matching Hyperliquid Testnet paper hedge, and supports 1-tap AI or voice replies.
4. **Live Hyperliquid & Polymarket Slice (`src/features/market_pulse/index.mjs`):** Queries `https://api.hyperliquid.xyz/info`, `https://api.hyperliquid-testnet.xyz/info` (`metaAndAssetCtxs`, `allMids`, `l2Book` VWAP preview), and `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5` with deterministic offline fallback and zero custody.
5. **CORS-Whitelisted Backend Proxy (`src/features/backend_proxy/index.mjs` + `app.json`):** Routes server-side endpoints (`/api/health`, `/api/pulse`, `/api/telegram/poll`, `/api/market/l2-preview`, `/api/telegram/reply-draft`, `/api/stt/transcribe`, `/api/action/confirm`), blocks unauthorized origins with HTTP `403`, and keeps optional `TELEGRAM_BOT_TOKEN` strictly in server memory.

## Demo Walkthrough & Verification

Run the end-to-end verification suite and interactive `576 x 288` Dark Studio waveguide workbench locally in four commands:

1. Install dependencies: `npm install`
2. Fetch live Hyperliquid and Polymarket feeds and validate all four Even G2 SDK containers into `outputs/live_session_bundle.json`: `node src/cli.mjs`
3. Launch the local proxy and interactive Even G2 + R1 Ring workbench at `http://127.0.0.1:8787`: `node src/cli.mjs --serve --port 8787`
4. Run unit, AST boundary, CORS, safety-lock, artistry, and SDK container tests (`7/7` passing): `npm test`

- **Repository:** https://github.com/HindsightWise/headsup-pulse-even-g2
- **Upgraded Demo Video (H.264 MP4):** https://raw.githubusercontent.com/HindsightWise/headsup-pulse-even-g2/main/outputs/demo_walkthrough.mp4

The repository `README.md` documents our **Pre-Nov-23 Open-Source, Scaffold & API Disclosure** (`commits b563869..7d7322e` initial scaffold plus Nov 23+ live Telegram `getUpdates` polling, Hyperliquid `l2Book` VWAP slippage simulation, and `7/7` tests), **AI-Assisted Coding Disclosure** (per organizer `danel`, Q&A `#1562275`), **Money-Safety Notice** (paper/testnet/read-only only, HTTP `403` safety lock, zero custody, zero financial advice, zero committed keys), and **5 Concrete API Feature Requests** for Even Realities, Telegram, Hyperliquid, and Polymarket.

## Business Potential & Roadmap

HeadsUp Pulse targets a freemium `.ehpk` companion model on the Even Hub Catalogue, pairing a free 4-line digest with a pro desk tier for custom alert rules and multi-venue liquidity previews.

- **Milestone 1 (Completed — Hackathon Build):** End-to-end `@evenrealities/even_hub_sdk@0.0.16` integration, live Hyperliquid + Polymarket feeds, priority Telegram digest + 1-tap voice/AI replies, CORS backend proxy, and `576 x 288` workbench.
- **Milestone 2 (Dec 2026 — Even Hub Catalogue Packaging):** Package `.ehpk` release with QR pairing-code onboarding for phone-side Telegram allowlist selection and Whisper.cpp streaming PCM transcription.
- **Milestone 3 (Q1 2027 — Non-Custodial Mobile Signing Handoff):** Add optional push handoff from G2 paper preview tickets to phone-side wallet signing while keeping G2 strictly non-custodial.
