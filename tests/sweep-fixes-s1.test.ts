/**
 * Printed-text sweep S1 fixes (CR audit program, slice PF-S1).
 *
 * Each describe block is one Startup card the S1 sweep found playing
 * against its printed text (tests/baselines/printed-sweep.json). The card
 * text wins over the model (CR 1.2.1). Each test name states the printed
 * behavior and cites the rule it follows.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import { fx } from "../src/effects/ir.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
import { trashCard } from "../src/state/procedures/trash.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.24");
});

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

/** A rezzed asset installed in a new remote. */
function installAsset(s: GameState, defId: string, id: string) {
  const serverId = `remote-${id}`;
  (s.servers as Record<string, unknown>)[serverId] = {
    id: serverId,
    root: [id],
    ice: [],
  };
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = true;
  return card;
}

describe("first Corp card trash triggers (area 1 trash hooks)", () => {
  it("Cacophony and Epiphany Analytica meet their trigger only when the Runner trashes a Corp card, not when the Corp trashes its own (CR 1.14.5a)", () => {
    const s = createInitialState();
    const caco = put(s, "cacophony", "caco-1", "runner:installed");
    s.runner.installed.push("caco-1");
    caco.powerCounters = 0;
    installAsset(s, "pad-campaign", "pad-1");
    trashCard(s, "pad-1", { by: "corp" });
    checkpointAfterInstruction(s, "test");
    expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(false);
    expect(caco.powerCounters).toBe(0);

    installAsset(s, "pad-campaign", "pad-2");
    trashCard(s, "pad-2", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(true);
    expect(caco.powerCounters).toBe(1);
  });

  it("an HQ card the Runner trashes uses Solidarity Badge's first time but not the first installed Corp card trash (CR 9.6.5c)", () => {
    const s = createInitialState();
    const badge = put(s, "solidarity-badge", "sb-1", "runner:installed");
    s.runner.installed.push("sb-1");
    badge.powerCounters = 0;
    // A source with the installed-only trigger (Aggressive Trendsetting's
    // printed condition; its card data moves to it in paired cut A).
    const watcher = put(s, "sure-gamble", "w-1", "runner:installed");
    s.runner.installed.push("w-1");
    watcher.onFirstInstalledCorpCardTrashEachTurn = fx.gainCredits(
      "runner",
      5,
    );
    const credits = s.runner.credits;

    const hqCard = put(s, "pad-campaign", "hq-1", "corp:hq");
    s.corp.hand.push(hqCard.id);
    trashCard(s, "hq-1", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(badge.powerCounters).toBe(1);
    expect(s.runner.credits).toBe(credits);

    installAsset(s, "pad-campaign", "pad-1");
    trashCard(s, "pad-1", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(badge.powerCounters).toBe(1);
    expect(s.runner.credits).toBe(credits + 5);

    installAsset(s, "pad-campaign", "pad-2");
    trashCard(s, "pad-2", { by: "runner" });
    checkpointAfterInstruction(s, "test");
    expect(s.runner.credits).toBe(credits + 5);
  });
});
