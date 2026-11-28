# HeadsUp Pulse: Glanceable Telegram & Market Read-and-Write Companion for Even G2

## Problem & Overview

Active crypto operators and builders constantly pull out their phones during meetings or transit to check whether a Telegram ping matters or whether perpetual funding and prediction odds moved. Full phone dashboards crowd `576 x 288` monochrome eyewear, while passive notification mirrors block fast replies.

**HeadsUp Pulse** solves that everyday moment for **Even Realities G2** in one continuous read-and-write workflow across **Track 01: Messaging & News (`4795`)**, **Track 02: Crypto & DeFi (`4799`)**, and **`Best Telegram Integration`**:
- **Track 01: Messaging & News (`4795`) + Best Telegram Integration:** Polls Telegram Bot API `getUpdates` streams and filters strictly to picked channels (`@HyperliquidAlphaDesk`, `@DaosHubDubai`, `@EvenBuildersOps`). Deduplicates offsets, compresses threads into 4 lines, and sends 1-tap AI or voice replies.
- **Track 02: Crypto & DeFi (`4799`):** Streams live **Hyperliquid** mark prices, funding, Testnet mids, and `l2Book` VWAP slippage previews alongside **Polymarket** Gamma odds. Stages 1-tap paper hedges confirmed from the **Even R1 Ring** or temple touch bar.

## Hackathon #2477 Judging Criteria Alignment

- **Usefulness on G2 (30%):** Replaces phone-checking during meetings or transit with a 30-second eyes-up loop linking Telegram alerts, Hyperliquid perps, and Polymarket odds.
- **Read and write (25%):** Combines 4-line glanceable reads with 1-tap R1 Ring confirmations, push-to-talk voice replies (`audioControl` + `/api/stt/transcribe`), and `l2Book` VWAP paper hedges.
- **Technical execution (20%):** Enforces zero-sibling vertical slices (`src/app.mjs`), official `@evenrealities/even_hub_sdk@0.0.16` validation, real `web/index.html` Even Hub bridge, official `@evenrealities/evenhub-simulator@0.9.5` checks, `.ehpk` packaging, and `8/8` passing tests.
- **UX for display and voice (15%):** Fits `576 x 288` monochrome optics (`<= 4` lines, `<= 44` chars/line, `textColor` `0..4`, `menuObject` `<= 32` UTF-8 bytes) with beamforming glasses mic capture.
- **Business potential and safety (10%):** Targets a freemium `.ehpk` Even Hub Catalogue model backed by `PAPER_TRADING_ONLY = true`, HTTP `403` safety locks, zero custody, and zero client secrets.

## Architecture & Solution

HeadsUp Pulse uses a strict vertical-slice architecture (`Invariants -> Schema -> Ledger -> State Engine -> Pipe -> Paint`) built on official **`@evenrealities/even_hub_sdk@0.0.16`**:

1. **Optical & Safety Kernel (`src/kernel/event_bus.mjs`):** Enforces `576 x 288` bounds, pixel-exact LVGL width checks (`measureG2TextWidthPx`, `fitsG2Width`, `paddingLength: 0`, `borderWidth: 0`), `<= 4` lines, `textColor` `0..4`, and `PAPER_TRADING_ONLY = true` over `EventBus`.
2. **Official Even Hub SDK Bridge (`src/features/sdk_bridge/index.mjs`):** Calls `waitForEvenAppBridge()`, `createStartUpPageContainer()`, `textContainerUpgrade()`, `rebuildPageContainer()`, `audioControl(true, AudioInputSource.Glasses)`, and `onEvenHubEvent()`. Every frame enforces unique `zOrderIndex`, a single `isEventCapture: 1`, `<= 32` UTF-8 byte `menuObject` items, and passes `validateEvenHubPageContainer()`.
3. **Priority Telegram Digest Slice (`src/features/telegram_digest/index.mjs`):** Parses Telegram `getUpdates` payloads (`normalizeTelegramBotUpdates`, `ingestBotApiUpdates`) and supports 1-tap AI or voice replies. Links `@HyperliquidAlphaDesk` funding alerts one scroll away from the Hyperliquid Testnet hedge.
4. **Live Hyperliquid & Polymarket Slice (`src/features/market_pulse/index.mjs`):** Queries `https://api.hyperliquid.xyz/info`, `https://api.hyperliquid-testnet.xyz/info` (`metaAndAssetCtxs`, `allMids`, `l2Book` VWAP preview), and `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5` with deterministic offline fallback and zero custody.
5. **CORS-Whitelisted Backend Proxy (`src/features/backend_proxy/index.mjs` + `app.json`):** Enforces `app.json` CORS/network whitelists (5 core manifest routes) while serving all 7 HTTP routes (`/api/health`, `/api/pulse`, `/api/telegram/poll`, `/api/market/l2-preview`, `/api/telegram/reply-draft`, `/api/stt/transcribe`, `/api/action/confirm`). Keeps optional `TELEGRAM_BOT_TOKEN` strictly in server memory.

## Demo Walkthrough & Verification

Run the end-to-end verification suite and interactive `576 x 288` Midnight Exhibition Plinth waveguide workbench locally in four commands:

1. Install dependencies: `npm install`
2. Fetch live Hyperliquid and Polymarket feeds and validate all four Even G2 SDK containers into `outputs/live_session_bundle.json`: `node src/cli.mjs`
3. Launch the local proxy and interactive Even G2 + R1 Ring workbench at `http://127.0.0.1:8787`: `npm run serve`
4. Run unit, AST boundary, CORS, safety-lock, artistry, pixel-exact LVGL, and real WebView bridge tests (`8/8` passing): `npm test`

- **Repository:** https://github.com/HindsightWise/headsup-pulse-even-g2
- **Demo Video (H.264 MP4 with Official Simulator Proof):** https://raw.githubusercontent.com/HindsightWise/headsup-pulse-even-g2/main/outputs/demo_walkthrough.mp4
- **Verified Even Hub Package (`.ehpk`):** https://raw.githubusercontent.com/HindsightWise/headsup-pulse-even-g2/main/outputs/headsup-pulse.ehpk (built with `@evenrealities/evenhub-cli@0.2.0`, `package_id: com.hindsightwise.headsuppulse`, `edition: 202601`)
- **Zero-Error Static Preview:** Open `docs/index.html` directly in any browser or launch locally with `npm run serve`.

Both `README.md` and `outputs/demo_walkthrough.mp4` include verified `576 x 288` lens proof from official `@evenrealities/evenhub-simulator@0.9.5`. The repository `README.md` also documents our **Pre-Nov-23 Open-Source, Scaffold & API Disclosure** and **AI-Assisted Coding Disclosure** (organizer `danel`, Q&A `#1562275`). It includes our **Money-Safety Notice** (paper/testnet only, HTTP `403` lock, zero custody, zero committed keys) and **5 Concrete API Feature Requests**.

## Business Potential & Roadmap

HeadsUp Pulse targets a freemium `.ehpk` model on the Even Hub Catalogue. The core 4-line digest stays free, while a pro desk tier adds custom alert routing and L2 liquidity previews.

- **Milestone 1 (Completed: Hackathon Build):** End-to-end `@evenrealities/even_hub_sdk@0.0.16` integration, live Hyperliquid + Polymarket feeds, priority Telegram digest + 1-tap voice/AI replies, official `@evenrealities/evenhub-simulator@0.9.5` verification, and `.ehpk` packaging.
- **Milestone 2 (Dec 2026: Even Hub Catalogue Release):** Publish `com.hindsightwise.headsuppulse` with QR pairing-code onboarding for phone-side Telegram allowlist selection and Whisper.cpp streaming PCM transcription.
- **Milestone 3 (Q1 2027: Non-Custodial Mobile Signing Handoff):** Add optional push handoff from G2 paper preview tickets to phone-side wallet signing while keeping G2 strictly non-custodial.

## Team Description

Robert Zerby is an independent systems builder focused on real-time wearable UX, defensive security, and low-latency market tooling. He builds end-to-end prototypes from protocol invariants through verified hardware simulator runs and production-grade test suites.
