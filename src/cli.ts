#!/usr/bin/env node
/**
 * Interactive / demo CLI stepper for the v0 engine.
 *
 *   npx tsx src/cli.ts --demo
 *   npx tsx src/cli.ts
 */
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { applyAction, describeState, legalActions } from "./actions/apply.js";
import { createInitialState } from "./state/createGame.js";
import { runVerticalSlice } from "./demo/verticalSlice.js";
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
  console.log("Netrunner engine CLI stepper (v0). Commands: number | demo | state | quit");
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

function demo(): void {
  const state = runVerticalSlice();
  console.log(describeState(state));
  console.log("\n--- log ---");
  for (const line of state.log) console.log(line);
  if (!state.done) {
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
    console.log("Vendor CR data missing — run npm run fetch-cr (tests need it).");
  }

  if (process.argv.includes("--demo")) {
    demo();
  } else {
    void interactive();
  }
}

main();
