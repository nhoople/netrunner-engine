#!/usr/bin/env node
/**
 * Development host for the headless library API.
 *
 * Exercises createGame / queryLegality / applyIntent / getPublicView.
 * Not a networked game client.
 *
 *   npm run cli -- --help
 *   npm run demo
 *   npm run demo:library
 *   npm run cli
 */
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { describeState } from "./actions/apply.js";
import {
  createGame,
  applyIntent,
  queryLegality,
  getPublicView,
} from "./api/library.js";
import {
  runVerticalSlice,
  runIceBreakSlice,
  runIceEtrSlice,
  runPumpBreakSlice,
  runMultiSubEtrSlice,
  runFortifyPumpSlice,
  runPulseNeedleSlice,
  runScrapCodeSlice,
  runLibraryApiSlice,
} from "./demo/verticalSlice.js";
import type { GameState } from "./state/types.js";
import { assertPinnedTag, crDataPresent, loadPin } from "./cr/load.js";
import {
  assertCardsPinnedTag,
  cardsDataPresent,
  loadCardsPin,
} from "./cards/load.js";

const DEMO_FLAGS = [
  "--demo",
  "--library",
  "--ice-break",
  "--ice-etr",
  "--pump-break",
  "--multi-sub-etr",
  "--fortify-pump",
  "--tithe",
  "--rototurret",
  "--pulse-needle",
  "--scrap-code",
] as const;

type DemoKind =
  | "vertical"
  | "library"
  | "ice-break"
  | "ice-etr"
  | "pump-break"
  | "multi-sub-etr"
  | "fortify-pump"
  | "tithe"
  | "rototurret";

function printHelp(): void {
  console.log(`netrunner-engine — development host (library API)

Usage:
  npm run cli                 Interactive stepper (createGame / queryLegality / applyIntent)
  npm run demo                Decline-rez empty remote (stopAfterFirstCycle)
  npm run demo:library        Host loop: createGame → legality → applyIntent → getPublicView
  npm run demo:ice-break      Rez Ice Wall + Marjanah break → success
  npm run demo:ice-etr        Rez + unbroken ETR → unsuccessful
  npm run demo:pump-break     Palisade (remote) + pump Marjanah → break
  npm run demo:multi-sub-etr  Hortum unbroken: gain ¢ then ETR
  npm run demo:fortify-pump   Palisade remote strength + pump past it
  npm run demo:tithe          Tithe: net damage + Corp gains ¢
  npm run demo:rototurret     Rototurret: trash program + ETR

Setup (required before demos/tests):
  npm install
  npm run prepare-data        # fetch-cr + fetch-cards into vendor/
  npm test

Pins: data/cr-pin.json + data/cards-pin.json (not master).
Public API: createGame, queryLegality, applyIntent, getPublicView.
`);
}

function printPins(): void {
  const cr = loadPin();
  const cards = loadCardsPin();
  console.log(`CR pin:    ${cr.tag} (${cr.repo})`);
  if (crDataPresent()) {
    assertPinnedTag(cr.tag);
    console.log("            vendor/cr-data present.");
  } else {
    console.log("            vendor/cr-data missing — run npm run fetch-cr");
  }
  console.log(`Cards pin: ${cards.tag} (${cards.repo})`);
  if (cardsDataPresent()) {
    assertCardsPinnedTag(cards.tag);
    console.log("            vendor/cards-data present.");
  } else {
    console.log("            vendor/cards-data missing — run npm run fetch-cards");
  }
}

function printState(state: GameState): void {
  console.log("\n" + describeState(state));
  if (state.log.length) {
    console.log("Last log:", state.log[state.log.length - 1]);
  }
}

function printLegality(state: GameState): void {
  const legality = queryLegality(state);
  console.log(
    `\nWindow: ${legality.window.key} (${legality.window.stepNumber}) · priority=${legality.priority} · active=${legality.activeSide}`,
  );
  console.log("Legal intents:");
  legality.legal.forEach((entry, i) => {
    const cites = entry.cites.map((c) => c.number).join(", ");
    console.log(
      `  [${i}] ${JSON.stringify(entry.action)}${cites ? `  cites: ${cites}` : ""}`,
    );
  });
}

async function interactive(): Promise<void> {
  let state = createGame({ stopAfterFirstCycle: false });
  const rl = readline.createInterface({ input, output });
  console.log(
    "Interactive library host. Commands: number | state | view | demo | quit",
  );
  printState(state);

  while (!state.done) {
    printLegality(state);
    const answer = (await rl.question("> ")).trim();
    if (answer === "quit" || answer === "q") break;
    if (answer === "state") {
      printState(state);
      continue;
    }
    if (answer === "view") {
      for (const side of ["corp", "runner"] as const) {
        const view = getPublicView(state, side);
        console.log(
          `${side} view: credits=${view.self.credits} hand=${view.self.handCount} oppHand=${view.opponent.handCount} timing=${view.timingKey}`,
        );
      }
      continue;
    }
    if (answer === "demo") {
      state = runVerticalSlice();
      printState(state);
      console.log("\n--- full log ---");
      for (const line of state.log) console.log(line);
      break;
    }
    const idx = Number(answer);
    const legal = queryLegality(state).legal;
    if (!Number.isInteger(idx) || idx < 0 || idx >= legal.length) {
      console.log("Pick a listed index, or state/view/demo/quit.");
      continue;
    }
    const result = applyIntent(state, legal[idx]!.action);
    if (!result.ok) {
      console.log("Illegal:", result.error, result.cites);
      continue;
    }
    state = result.state;
    printState(state);
  }
  rl.close();
}

function pickDemo(): DemoKind {
  if (process.argv.includes("--library")) return "library";
  if (process.argv.includes("--ice-break")) return "ice-break";
  if (process.argv.includes("--ice-etr")) return "ice-etr";
  if (process.argv.includes("--pump-break")) return "pump-break";
  if (process.argv.includes("--multi-sub-etr")) return "multi-sub-etr";
  if (process.argv.includes("--fortify-pump")) return "fortify-pump";
  if (
    process.argv.includes("--tithe") ||
    process.argv.includes("--pulse-needle")
  ) {
    return "tithe";
  }
  if (
    process.argv.includes("--rototurret") ||
    process.argv.includes("--scrap-code")
  ) {
    return "rototurret";
  }
  return "vertical";
}

function demo(): void {
  const which = pickDemo();
  if (which === "library") {
    const snap = runLibraryApiSlice();
    console.log("Demo: library API host loop");
    console.log(
      `  window=${snap.windowKey} legalIntents=${snap.legalityCount}`,
    );
    console.log(
      `  applied basic_gain_credit cites=[${snap.sampleCites.join(", ")}]`,
    );
    console.log(
      `  getPublicView(runner).opponent.credits=${snap.runnerSeesCorpCredits}`,
    );
    console.log(
      `  getPublicView(corp).opponent.handCount=${snap.corpSeesRunnerHandCount}`,
    );
    console.log(describeState(snap.state));
    return;
  }

  const runners: Record<Exclude<DemoKind, "library">, () => GameState> = {
    vertical: runVerticalSlice,
    "ice-break": runIceBreakSlice,
    "ice-etr": runIceEtrSlice,
    "pump-break": runPumpBreakSlice,
    "multi-sub-etr": runMultiSubEtrSlice,
    "fortify-pump": runFortifyPumpSlice,
    tithe: runPulseNeedleSlice,
    rototurret: runScrapCodeSlice,
  };

  const state = runners[which]();
  console.log(`Demo: ${which}`);
  console.log(describeState(state));
  console.log("\n--- log ---");
  for (const line of state.log) console.log(line);
  if (which === "vertical" && !state.done) {
    process.exitCode = 1;
    console.error("Demo did not reach done=true");
  }
}

function main(): void {
  if (
    process.argv.includes("--help") ||
    process.argv.includes("-h")
  ) {
    printHelp();
    return;
  }

  printPins();

  if (DEMO_FLAGS.some((f) => process.argv.includes(f))) {
    demo();
  } else {
    void interactive();
  }
}

main();
