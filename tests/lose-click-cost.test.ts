/**
 * "Lose [click]" as a cost. Losing a click is not spending it (CR 1.11.3b),
 * so a cost that is "Lose [click]" does not begin with a [click] symbol and
 * the ability is not an action (CR 5.2.1, 5.2.1a). Cards write it as
 * `cost.loseClicks`; `cost.clicks` is the [click] that begins an action.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";
import { findPaidAbility } from "../src/actions/paidAbility.js";
import { canPayCost, costBeginsWithClick, payCost } from "../src/state/costs.js";
import type { GameState, PaidAbility } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function ability(cost: PaidAbility["cost"]): PaidAbility {
  return {
    id: "test-ability",
    label: "test",
    clickCost: cost?.clicks ?? 0,
    creditCost: 0,
    cost,
    windows: ["corp_action_paw"],
    effect: { op: "do", action: { kind: "gain_credits", side: "corp", amount: 1 } },
  } as PaidAbility;
}

/** MirrorMorph Corp with a rezzed asset carrying one test ability. */
function corpWithAbility(cost: PaidAbility["cost"]): GameState {
  const s = createInitialState();
  const id = s.corp.identityId;
  s.cards[id] = instantiateCard("mirrormorph-endless-iteration", id, "corp:identity");
  s.cards["runner-program-1"]!.rezzed = false;
  const card = instantiateCard("sealed-vault", "sv-1", "server:remote-1:root");
  card.rezzed = true;
  card.faceup = true;
  card.paidAbilities = [ability(cost)];
  s.cards["sv-1"] = card;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: ["sv-1"],
  } as GameState["servers"][string];
  s.nextRemoteNumber = 2;
  s.activeSide = "corp";
  s.corp.clicks = 3;
  s.corp.credits = 5;
  return s;
}

describe("Lose [click] costs", () => {
  it("a Lose [click] cost does not begin with [click] (CR 5.2.1, 1.11.3b)", () => {
    expect(costBeginsWithClick(ability({ loseClicks: 1 }))).toBe(false);
    expect(costBeginsWithClick(ability({ clicks: 1 }))).toBe(true);
  });

  it("needs and removes the clicks, without counting them as spent", () => {
    const s = createInitialState();
    s.activeSide = "runner";
    s.runner.clicks = 1;
    const spentBefore = s.turn.runnerClicksSpentThisTurn;
    expect(canPayCost(s, "runner", { loseClicks: 2 })).toBe(false);
    expect(canPayCost(s, "runner", { loseClicks: 1 })).toBe(true);
    payCost(s, "runner", { loseClicks: 1 }, "test");
    expect(s.runner.clicks).toBe(0);
    expect(s.turn.runnerClicksSpentThisTurn).toBe(spentBefore);
  });

  it("a Corp Lose [click] ability is used in the paid ability window and is not an action", () => {
    const s = corpWithAbility({ loseClicks: 1 });
    s.timingKey = "corp.actionPaw";
    const used = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sv-1",
      abilityId: "test-ability",
    });
    if (!used.ok) throw new Error(used.error);
    expect(used.state.corp.clicks).toBe(2);
    expect(used.state.corp.credits).toBe(6);
    // MirrorMorph and Wage Workers count actions only (CR 5.2.1, 5.2.5).
    expect(used.state.turn.corpActionSequenceThisTurn ?? []).toEqual([]);
  });

  it("the same ability with a [click] cost is an action and is counted", () => {
    const s = corpWithAbility({ clicks: 1 });
    s.timingKey = "corp.takeAction";
    const used = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sv-1",
      abilityId: "test-ability",
    });
    if (!used.ok) throw new Error(used.error);
    expect(used.state.corp.clicks).toBe(2);
    expect(used.state.turn.corpActionSequenceThisTurn).toEqual([
      "use_paid_ability:sv-1:test-ability",
    ]);
  });

  it("refuses a Lose [click] cost the player cannot pay", () => {
    const s = corpWithAbility({ loseClicks: 1 });
    s.corp.clicks = 0;
    s.timingKey = "corp.actionPaw";
    const used = applyIntent(s, {
      type: "use_paid_ability",
      cardId: "sv-1",
      abilityId: "test-ability",
    });
    expect(used.ok).toBe(false);
  });
});

/** The Runner encounters a rezzed Markus 1.0 written with `loseClicks`. */
function encounterMarkus(): GameState {
  const s = createInitialState();
  s.activeSide = "runner";
  s.runner.clicks = 2;
  s.priorityStack = [];
  s.cards["runner-program-1"]!.rezzed = false;
  const markus = instantiateCard("markus-1-0", "mk-1", "server:hq:ice");
  markus.rezzed = true;
  markus.faceup = true;
  // The card data after the cards release that writes loseClicks.
  for (const record of (markus.abilities ?? []) as { id?: string; cost?: unknown }[]) {
    if (record.id === "markus-break") record.cost = { loseClicks: 1 };
  }
  const brk = markus.paidAbilities!.find((a) => a.id === "markus-break")!;
  brk.cost = { loseClicks: 1 };
  brk.clickCost = 0;
  s.cards["mk-1"] = markus;
  s.servers.hq.ice = ["mk-1"];
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: { iceId: "mk-1", broken: [false, false] },
    endedTheRun: false,
    cannotJackOut: false,
  } as never;
  s.timingKey = "run.encounterPaw";
  return s;
}

function useMarkusBreak(s: GameState) {
  return applyIntent(s, {
    type: "use_paid_ability",
    cardId: "mk-1",
    abilityId: "markus-break",
  });
}

describe("Lose [click] on bioroid ice", () => {
  it("the Runner loses [click] to break a subroutine on Markus 1.0, without spending it", () => {
    const s = encounterMarkus();
    const spentBefore = s.turn.runnerClicksSpentThisTurn;
    const brk = findPaidAbility(s.cards["mk-1"]!, "markus-break")!;
    expect(brk.cost).toEqual({ loseClicks: 1 });
    expect(costBeginsWithClick(brk)).toBe(false);
    const used = useMarkusBreak(s);
    if (!used.ok) throw new Error(used.error);
    let after = used.state;
    if (after.pendingChoice) {
      const pick = applyIntent(after, {
        type: "choose_option",
        optionId: after.pendingChoice.options[0]!.id,
      });
      if (!pick.ok) throw new Error(pick.error);
      after = pick.state;
    }
    expect(after.runner.clicks).toBe(1);
    expect(after.turn.runnerClicksSpentThisTurn).toBe(spentBefore);
    expect(after.run?.encounter?.broken.some(Boolean)).toBe(true);
    // Zed 1.0 / 2.0: "the Runner has lost [click] to break a subroutine".
    expect(after.run?.lostClickToBreakThisRun).toBe(true);
  });

  it("Hákarl 1.0's prohibition stops the paid ability too (CR 1.2.2)", () => {
    const s = encounterMarkus();
    s.turn.bioroidIcePaidAbilitiesForbidden = true;
    const used = useMarkusBreak(s);
    expect(used.ok).toBe(false);
    expect(s.runner.clicks).toBe(2);
  });
});
