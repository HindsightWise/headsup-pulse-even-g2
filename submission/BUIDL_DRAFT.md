# HeadsUp Pulse — Glanceable Telegram & Market Read-and-Write Companion for Even G2

## Problem & Overview

Active crypto operators and builders constantly pull out their phones during meetings or transit just to check whether a Telegram ping matters or whether perpetual funding and prediction odds moved. Full multi-panel mobile dashboards fail on `576 x 288` monochrome eyewear, while passive notification mirrors offer no fast way to act.

**HeadsUp Pulse** solves that everyday moment for **Even Realities G2** across two connected tracks in one continuous flow:
- **Track 01 — Messaging & News (`4795`) + Best Telegram Integration:** Filters incoming updates strictly to user-picked Telegram channels and work groups (`@HyperliquidAlphaDesk`, `@DaosHubDubai`), compresses unread threads into a 4-line 30-second brief, and dispatches 1-tap AI-drafted or push-to-talk voice replies.
- **Track 02 — Crypto & DeFi (`4799`):** Streams live **Hyperliquid** perpetual mark prices, hourly funding rates, and Testnet mid prices alongside live **Polymarket** Gamma contract probabilities, staging 1-tap non-custodial paper/testnet hedges confirmed directly from the **Even R1 Ring** or temple touch bar.

## Architecture & Solution

HeadsUp Pulse uses a strict vertical-slice architecture (`Invariants -> Schema -> Ledger -> State Engine -> Pipe -> Paint`) built on official **`@evenrealities/even_hub_sdk@0.0.16`**:

1. **Even G2 Optical & Safety Kernel (`src/kernel/event_bus.mjs`):** Enforces `576 x 288` bounds, `<= 4` visible lines, `<= 44` characters per line, integer `textColor` brightness `0..4`, and `PAPER_TRADING_ONLY = true` over an immutable append-only `EventBus`.
2. **Official Even Hub SDK Bridge (`src/features/sdk_bridge/index.mjs`):** Calls `waitForEvenAppBridge()`, `createStartUpPageContainer()`, incremental `textContainerUpgrade()`, `rebuildPageContainer()`, `audioControl(true, AudioInputSource.Glasses)`, and `onEvenHubEvent()`. Every frame enforces unique `zOrderIndex` across containers, a single `isEventCapture: 1` target, `<= 32` UTF-8 byte `menuObject` items, and passes official `validateEvenHubPageContainer()`.
3. **Live Hyperliquid & Polymarket Slice (`src/features/market_pulse/index.mjs`):** Queries `https://api.hyperliquid.xyz/info`, `https://api.hyperliquid-testnet.xyz/info`, and `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5` with deterministic offline fallback and zero custody of user funds.
4. **Priority Telegram Digest Slice (`src/features/telegram_digest/index.mjs`):** Links `@HyperliquidAlphaDesk` funding alerts one scroll away from the matching Hyperliquid Testnet paper hedge and supports 1-tap AI draft or voice-transcribed replies.
5. **CORS-Whitelisted Backend Proxy (`src/features/backend_proxy/index.mjs` + `app.json`):** Routes API traffic server-side, blocks unauthorized cross-origin requests, exposes BYO speech-to-text (`/api/stt/transcribe`), and keeps optional `TELEGRAM_BOT_TOKEN` credentials strictly in server memory.

## Demo Walkthrough & Verification

Run the end-to-end verification suite and interactive `576 x 288` Dark Studio waveguide simulator locally in three commands:

1. Install dependencies: `npm install`
2. Fetch live Hyperliquid + Polymarket data and validate all Even G2 SDK containers into `outputs/live_session_bundle.json`: `node src/cli.mjs`
3. Launch the local proxy and interactive Even G2 + R1 Ring simulator at `http://127.0.0.1:8787`: `node src/cli.mjs --serve --port 8787`
4. Run unit, AST boundary, CORS, safety-lock, and SDK container validation tests: `npm test`

The repository `README.md` includes our full **Pre-Nov-23 Open-Source Disclosure**, **Money-Safety Notice** (paper/testnet/read-only only, zero custody, zero financial advice, zero committed keys), and **5 Concrete API Feature Requests** for Even Realities, Telegram, Hyperliquid, and Polymarket.

## Roadmap & Milestones

- **Milestone 1 (Completed — Hackathon Build):** End-to-end `@evenrealities/even_hub_sdk@0.0.16` integration, live Hyperliquid + Polymarket feeds, priority Telegram digest + 1-tap voice/AI replies, CORS backend proxy, and `576 x 288` optical workbench.
- **Milestone 2 (Dec 2026 — Even Hub Catalogue Packaging):** Package `.ehpk` release with QR pairing-code onboarding for phone-side Telegram channel selection and Whisper.cpp streaming PCM transcription.
- **Milestone 3 (Q1 2027 — Non-Custodial Mobile Signing Handoff):** Add optional push handoff from G2 paper preview tickets to phone-side Gram Wallet or Hyperliquid Vault approval while keeping G2 strictly non-custodial.
