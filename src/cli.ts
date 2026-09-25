#!/usr/bin/env node
/**
 * Interactive / demo CLI stepper for the v0 engine.
 *
 *   npx tsx src/cli.ts --demo
 *   npx tsx src/cli.ts --pump-break
 *   npx tsx src/cli.ts
 */
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { applyAction, describeState, legalActions } from "./actions/apply.js";
import { createInitialState } from "./state/createGame.js";
import {
  runVerticalSlice,
  runIceBreakSlice,
  runIceEtrSlice,
  runPumpBreakSlice,
  runMultiSubEtrSlice,
  runFortifyPumpSlice,
} from "./demo/verticalSlice.js";
import type { Action, GameState } from "./state/types.js";
import { assertPinnedTag, crDataPresent, loadPin } from "./cr/load.js";

function printState(state: GameState): void {
  console.log("\n" + describeState(state));
  if (state.log.length) {
    console.log("Last log:", state.log[state.log.length - 1]);
  }
}

function printLegal(actions: Action[]): void {
  console.log("\nLegal actions:");
  actions.forEach((a, i) => {
    console.log(`  [${i}] ${JSON.stringify(a)}`);
  });
}

async function interactive(): Promise<void> {
  let state = createInitialState();
  const rl = readline.createInterface({ input, output });
  console.log(
    "Netrunner engine CLI stepper (v0). Commands: number | demo | state | quit",
  );
  printState(state);

  while (!state.done) {
    const legal = legalActions(state);
    printLegal(legal);
    const answer = (await rl.question("> ")).trim();
    if (answer === "quit" || answer === "q") break;
    if (answer === "state") {
      printState(state);
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
    if (!Number.isInteger(idx) || idx < 0 || idx >= legal.length) {
      console.log("Pick a listed index, or demo/state/quit.");
      continue;
    }
    const result = applyAction(state, legal[idx]);
    if (!result.ok) {
      console.log("Illegal:", result.error, result.cites);
      continue;
    }
    state = result.state;
    printState(state);
  }
  rl.close();
}

type DemoKind =
  | "vertical"
  | "ice-break"
  | "ice-etr"
  | "pump-break"
  | "multi-sub-etr"
  | "fortify-pump";

function pickDemo(): DemoKind {
  if (process.argv.includes("--ice-break")) return "ice-break";
  if (process.argv.includes("--ice-etr")) return "ice-etr";
  if (process.argv.includes("--pump-break")) return "pump-break";
  if (process.argv.includes("--multi-sub-etr")) return "multi-sub-etr";
  if (process.argv.includes("--fortify-pump")) return "fortify-pump";
  return "vertical";
}

function demo(): void {
  const which = pickDemo();
  const runners: Record<DemoKind, () => GameState> = {
    vertical: runVerticalSlice,
    "ice-break": runIceBreakSlice,
    "ice-etr": runIceEtrSlice,
    "pump-break": runPumpBreakSlice,
    "multi-sub-etr": runMultiSubEtrSlice,
    "fortify-pump": runFortifyPumpSlice,
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
  const pin = loadPin();
  console.log(`CR pin: ${pin.tag} (${pin.repo})`);
  if (crDataPresent()) {
    assertPinnedTag(pin.tag);
    console.log("Vendor CR data present.");
  } else {
    console.log(
      "Vendor CR data missing — run npm run fetch-cr (tests need it).",
    );
  }

  const demoFlags = [
    "--demo",
    "--ice-break",
    "--ice-etr",
    "--pump-break",
    "--multi-sub-etr",
    "--fortify-pump",
  ];
  if (demoFlags.some((f) => process.argv.includes(f))) {
    demo();
  } else {
    void interactive();
  }
}

main();
