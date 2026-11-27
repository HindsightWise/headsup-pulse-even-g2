# DoraHacks #2477 Submission Runbook — HeadsUp Pulse

## 1. Event Window, Schedule & Eligibility Gates
- **Hackathon:** Heads Up: Even Realities Hackathon by TVM Ventures & Daos Hub (`https://dorahacks.io/hackathon/even-realities/detail`, ID `2477`).
- **Submission Deadline:** Sunday, `2026-11-29T19:59:00Z` (`11:59 AM PT` / `23:59` Dubai GMT+4).
- **Top 20 Finalist Pitches:** Online in Discord on the evening of **December 1, 2026** (Dubai GMT+4).
- **Awards Event:** **December 3, 2026** (`14:00–18:00` Dubai GMT+4) — awards announcement only, no project pitching.
- **Payout Rail:** USDT paid on TON with no KYC required.
- **Anti-Farming Standing:** `prior_submissions = 0` (`< 5` DoraHacks limit satisfied).

## 2. Pre-Submission Local Verification Checklist
Run all three deterministic gates from the repository root before pushing or updating the DoraHacks Build form:

```bash
# 1. Regenerate live Hyperliquid + Polymarket + Even Hub SDK session bundle
/opt/homebrew/bin/node src/cli.mjs

# 2. Run unit, AST boundary, negative-control, artistry, and preflight test suite (7/7)
/opt/homebrew/bin/node --test tests/headsup_pulse.test.mjs

# 3. Validate DoraHacks Build markdown draft (must report 0 errors and 0 warnings)
python3 /Users/zerbytheboss/.gemini/config/skills/dorahacks-builder/scripts/dorahacks_preflight.py validate-build \
  --body-file submission/BUIDL_DRAFT.md \
  --prior-submissions 0 \
  --github-url "https://github.com/HindsightWise/headsup-pulse-even-g2" \
  --video-url "https://raw.githubusercontent.com/HindsightWise/headsup-pulse-even-g2/main/outputs/demo_walkthrough.mp4" \
  --require-github \
  --require-video \
  --json
```

## 3. Recording the <= 3 Minute Demo Video
1. Start the local server: `node src/cli.mjs --serve --port 8787`.
2. Open `http://127.0.0.1:8787` (or load inside `@evenrealities/evenhub-simulator`).
3. Demonstrate the 4-card read-and-write loop in under 150 seconds:
   - **0:00–0:30:** Show Card 01 (`@HyperliquidAlphaDesk` priority Telegram digest) inside the `576 x 288` monochrome green waveguide while unselected chats stay filtered out.
   - **0:30–1:10:** Scroll (`SCRL`) to Card 02 (`Hyperliquid BTC-PERP` live price, Testnet mid, and `l2Book` VWAP preview) and Card 03 (`Polymarket` live odds), then press `TAP` (`R1 Ring`) to confirm a paper hedge and inspect the SDK `evenAppMessage` audit log.
   - **1:10–1:55:** Scroll to Card 04 (`@DaosHubDubai`), trigger `Push-to-Talk Voice` (`audioControl` + `/api/stt/transcribe`), and tap once to approve and dispatch the reply receipt.
   - **1:55–2:20:** Adjust brightness (`textColor` `0..4`), open the contextual `menuObject` overlay, and show `7/7` passing automated tests.

## 4. Final Portal Submission Fields (`dorahacks.io`)
- **BUIDL Title:** `HeadsUp Pulse`
- **Tracks Selected:** `Messaging & News` (`4795`) + `Crypto & DeFi` (`4799`) + `Best Telegram Integration`
- **Description Markdown:** Paste `submission/BUIDL_DRAFT.md`
- **GitHub Repository:** `https://github.com/HindsightWise/headsup-pulse-even-g2` (includes setup, Pre-Nov-23 disclosure, AI-assisted coding disclosure, Money-Safety Notice, and 5 API feature requests)
- **Demo Video Link:** `https://raw.githubusercontent.com/HindsightWise/headsup-pulse-even-g2/main/outputs/demo_walkthrough.mp4` (`<= 3` minutes)
- **Confidentiality Reminder:** Never paste `TELEGRAM_BOT_TOKEN`, wallet private keys, or `.env` values into DoraHacks Build fields, Q&A, or Hackathon AI chat.
