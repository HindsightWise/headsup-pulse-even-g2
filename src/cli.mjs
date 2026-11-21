/**
 * HeadsUp Pulse CLI Entrypoint (`src/cli.mjs`).
 *
 * Modes:
 * - Default (`node src/cli.mjs`): fetches live Hyperliquid + Polymarket feeds, validates
 *   Even G2 576x288 containers through `@evenrealities/even_hub_sdk@0.0.16`, and writes
 *   `outputs/live_session_bundle.json`.
 * - Server (`node src/cli.mjs --serve [--port 8787]`): starts the local CORS-whitelisted
 *   HTTP proxy + Even G2 simulator workbench at `http://127.0.0.1:<port>`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHeadsUpPulseRuntime,
  generateLiveSessionBundle,
} from "./app.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function parseArgs(argv) {
  const args = {
    serve: false,
    port: Number(process.env.PORT || 8787),
    host: "127.0.0.1",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--serve") {
      args.serve = true;
    } else if (token === "--port" && argv[i + 1]) {
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--host" && argv[i + 1]) {
      args.host = String(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.serve) {
    const runtime = await createHeadsUpPulseRuntime({ projectRoot: PROJECT_ROOT });
    await runtime.bridgeController.init();
    await runtime.marketEngine.refreshFeeds();
    await runtime.syncActiveCardToGlasses({ startup: true });

    await new Promise((resolve, reject) => {
      runtime.server.once("error", reject);
      runtime.server.listen(opts.port, opts.host, resolve);
    });

    const addr = runtime.server.address();
    const port = typeof addr === "object" && addr ? addr.port : opts.port;
    console.log(
      JSON.stringify({
        status: "listening",
        url: `http://${opts.host}:${port}`,
        sdkVersion: runtime.manifest.sdkVersion,
        paperTradingOnly: true,
      })
    );

    const gracefulExit = async () => {
      runtime.server.close();
      await runtime.shutdown();
      process.exit(0);
    };
    process.once("SIGINT", gracefulExit);
    process.once("SIGTERM", gracefulExit);
    return;
  }

  const outputFile = path.join(PROJECT_ROOT, "outputs", "live_session_bundle.json");
  const bundle = await generateLiveSessionBundle({
    projectRoot: PROJECT_ROOT,
    outputFile,
  });

  console.log(
    JSON.stringify(
      {
        status: "bundle_generated",
        outputFile,
        sdkVersion: bundle.bridgeMeta.sdkVersion,
        hyperliquidSource: bundle.marketSnapshot.hyperliquidSource,
        polymarketSource: bundle.marketSnapshot.polymarketSource,
        cardCount: bundle.cards.length,
        allContainersValid: bundle.validatedContainers.every(
          (c) => c.sdkValidation?.valid === true
        ),
        paperOrdersConfirmed: bundle.paperOrders.length,
        telegramRepliesApproved: bundle.approvedTelegramReplies.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
