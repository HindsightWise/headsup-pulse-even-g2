# DoraHacks #2477 Submission Runbook — HeadsUp Pulse

## 1. Event Window & Eligibility Gates
- **Hackathon:** Heads Up: Even Realities Hackathon by TVM Ventures & Daos Hub (`https://dorahacks.io/hackathon/even-realities/detail`, ID `2477`)
- **Submission Window:** Opens `2026-11-23T08:00:00Z` (`12:00` Dubai GMT+4) and closes `2026-11-29T19:59:00Z` (`23:59` Dubai GMT+4).
- **Demo Day:** `2026-12-03` (`14:00–18:00` Dubai GMT+4 at Daos Hub, remote demo supported for finalists).
- **Anti-Farming Standing:** `prior_submissions = 0` (`< 5` DoraHacks limit satisfied).

## 2. Pre-Submission Local Verification Checklist
Run all three deterministic gates from the project root before publishing the repository or submitting the DoraHacks Build form:

```bash
# 1. Regenerate live Hyperliquid + Polymarket + Even Hub SDK session bundle
/opt/homebrew/bin/node src/cli.mjs

# 2. Run unit, AST boundary, negative-control, artistry, and preflight test suite
/opt/homebrew/bin/node --test tests/headsup_pulse.test.mjs

# 3. Validate DoraHacks Build markdown draft (must report 0 errors and 0 warnings)
python3 /Users/zerbytheboss/.gemini/config/skills/dorahacks-builder/scripts/dorahacks_preflight.py validate-build \
  --body-file submission/BUIDL_DRAFT.md \
  --prior-submissions 0 \
  --github-url "https://github.com/HindsightWise/headsup-pulse-even-g2" \
  --video-url "https://github.com/HindsightWise/headsup-pulse-even-g2/raw/main/outputs/demo_walkthrough.mp4" \
  --require-github \
  --require-video \
  --json
```

## 3. Recording the <= 3 Minute Demo Video
1. Start the local server: `node src/cli.mjs --serve --port 8787`.
2. Open `http://127.0.0.1:8787` (or load inside `@evenrealities/evenhub-simulator`).
3. Show the 4-step connected read-and-write loop in under 150 seconds:
   - **0:00–0:30:** Show Card 01 (`@HyperliquidAlphaDesk` priority Telegram digest) inside the `576 x 288` monochrome green waveguide while noisy unselected chats stay filtered out.
   - **0:30–1:10:** Scroll (`SCRL`) to Card 02 (`Hyperliquid BTC-PERP` live price + Testnet mid) and Card 03 (`Polymarket` live odds), then press `TAP` (`R1 Ring`) to confirm a non-custodial paper/testnet hedge and inspect the SDK `evenAppMessage` audit log.
   - **1:10–1:55:** Scroll to Card 04 (`@DaosHubDubai`), trigger `Push-to-Talk Voice` (`audioControl` + `/api/stt/transcribe`), and tap once to approve and dispatch the reply receipt.
   - **1:55–2:20:** Adjust brightness (`textColor` `0..4`) and open the contextual `menuObject` overlay.

## 4. Final Portal Submission Fields (`dorahacks.io`)
- **BUIDL Title:** `HeadsUp Pulse`
- **Tracks Selected (2 connected tracks):** `Crypto & DeFi` (`4799`) + `Messaging & News` (`4795`) + `Best Telegram Integration`
- **Description Markdown:** Paste `submission/BUIDL_DRAFT.md`
- **GitHub Repository:** Public HTTPS repository URL containing `README.md` setup + Pre-Nov-23 disclosure + 5 API feature requests
- **Demo Video Link:** Public HTTPS video link (`<= 3` minutes)
- **Confidentiality Reminder:** Never paste `TELEGRAM_BOT_TOKEN`, wallet private keys, or `.env` values into DoraHacks Build fields, Q&A, or Hackathon AI chat.
