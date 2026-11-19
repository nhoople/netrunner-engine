/**
 * "Break 1 subroutine on this ice. Only the Runner can use this ability."
 * printed on Corp ice: N-Pot (3[credit]), Negotiator (2[credit]) and
 * Hákarl 1.0 (Lose [click]).
 *
 * The Runner breaks subroutines in the Encounter Ice paid ability window
 * (CR 6.5.4, 6.9.3b, 9.8.5). An ability only the Runner can use is
 * controlled by the Runner (CR 1.14.4b), so the Runner pays its cost
 * (CR 9.5.1), uses it while holding priority (CR 9.5.2), and the Corp cannot
 * use it (CR 1.14.4). Losing [click] is not spending it, so Hákarl's ability
 * is not an action (CR 1.11.3b, 5.2.1a).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  instantiateCard,
  loadCardCatalog,
  queryLegality,
} from "../src/index.js";
import { findPaidAbility } from "../src/actions/paidAbility.js";
import { ensurePriorityWindow } from "../src/legality/priority.js";
import { costBeginsWithClick } from "../src/state/costs.js";
import type { CardInstance, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

/**
 * N-Pot as cards v1.147.24 writes it: the Markus 1.0 pattern. Applying it
 * to the pinned catalog is a no-op; it keeps the test's shape fixed if the
 * pinned data changes.
 */
function writeNPotAsPrinted(card: CardInstance): void {
  // Paid abilities are read from the card's ability records.
  const records = (card.abilities ?? []) as unknown as Record<
    string,
    unknown
  >[];
  const brk = records.find((a) => a.id === "n-pot-break")!;
  brk.instructions = {
    op: "do",
    action: { kind: "break_subroutine_on_self", amount: 1 },
  };
  brk.usableByRunnerOnSelfIce = true;
}

/** The Runner encounters `defId`, rezzed, as the only ice on HQ. */
function encounter(defId: string): GameState {
  const s = createInitialState();
  s.activeSide = "runner";
  s.runner.clicks = 2;
  s.runner.credits = 5;
  s.corp.credits = 5;
  s.priorityStack = [];
  s.cards["runner-program-1"]!.rezzed = false;
  const ice = instantiateCard(defId, "ice-1", "server:hq:ice");
  ice.rezzed = true;
  ice.faceup = true;
  if (defId === "n-pot") writeNPotAsPrinted(ice);
  const subs = (ice.abilities ?? []).filter(
    (a) => (a as { class?: string }).class === "subroutine",
  ).length;
  s.cards["ice-1"] = ice;
  s.servers.hq.ice = ["ice-1"];
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: { iceId: "ice-1", broken: Array(subs).fill(false) },
    endedTheRun: false,
    cannotJackOut: false,
  } as never;
  s.timingKey = "run.encounterPaw";
  return s;
}

function use(s: GameState, abilityId: string) {
  return applyIntent(s, {
    type: "use_paid_ability",
    cardId: "ice-1",
    abilityId,
  });
}

/** Legality entries for this ability, with the seat the game sends them from. */
function entries(s: GameState, abilityId: string) {
  return queryLegality(s).legal.filter(
    (e) =>
      e.action.type === "use_paid_ability" &&
      e.action.cardId === "ice-1" &&
      e.action.abilityId === abilityId,
  );
}

/** The Corp holds priority in the encounter's paid ability window. */
function corpHoldsPriority(s: GameState): void {
  ensurePriorityWindow(s).priorityHolder = "corp";
}

const CASES = [
  {
    title: "N-Pot",
    defId: "n-pot",
    abilityId: "n-pot-break",
    subs: 3,
    paid: (before: GameState, after: GameState) => {
      expect(after.runner.credits).toBe(before.runner.credits - 3);
      expect(after.runner.clicks).toBe(before.runner.clicks);
    },
  },
  {
    title: "Hákarl 1.0",
    defId: "hakarl-1-0",
    abilityId: "hakarl-click-break",
    subs: 2,
    paid: (before: GameState, after: GameState) => {
      expect(after.runner.clicks).toBe(before.runner.clicks - 1);
      expect(after.runner.credits).toBe(before.runner.credits);
      // Losing [click] is not spending it (CR 1.11.3b).
      expect(after.turn.runnerClicksSpentThisTurn).toBe(
        before.turn.runnerClicksSpentThisTurn,
      );
    },
  },
  {
    title: "Negotiator",
    defId: "negotiator",
    abilityId: "negotiator-break",
    subs: 2,
    paid: (before: GameState, after: GameState) => {
      expect(after.runner.credits).toBe(before.runner.credits - 2);
      expect(after.runner.clicks).toBe(before.runner.clicks);
    },
  },
] as const;

describe.each(CASES)("$title: Break 1 subroutine on this ice", (c) => {
  it("is offered to the Runner, not the Corp, in the encounter window (CR 6.5.4, 1.14.4b)", () => {
    const s = encounter(c.defId);
    expect(s.run?.encounter?.broken).toHaveLength(c.subs);
    const offered = entries(s, c.abilityId);
    expect(offered.map((e) => e.actor)).toEqual(["runner"]);
  });

  it("the Runner pays the cost and breaks 1 subroutine (CR 9.5.1, 9.8.5)", () => {
    const s = encounter(c.defId);
    const before = structuredClone(s);
    const used = use(s, c.abilityId);
    if (!used.ok) throw new Error(used.error);
    c.paid(before, used.state);
    expect(used.state.corp.credits).toBe(before.corp.credits);
    expect(used.state.corp.clicks).toBe(before.corp.clicks);
    expect(used.state.run?.encounter?.broken.filter(Boolean)).toHaveLength(1);
  });

  it("the Corp cannot use it, even while it holds priority (CR 1.14.4, 9.5.2)", () => {
    const s = encounter(c.defId);
    corpHoldsPriority(s);
    // The match host sends an act only from the seat legality names as its
    // actor; with the Corp holding priority, the Runner's ability is not legal.
    const legal = queryLegality(s);
    expect(legal.priority).toBe("corp");
    expect(entries(s, c.abilityId)).toEqual([]);
    expect(
      legal.legal.some(
        (e) => e.actor === "corp" && e.action.type === "use_paid_ability",
      ),
    ).toBe(false);
  });
});

describe("Hákarl 1.0's lock", () => {
  it("bioroid ice breaks are not offered while the Runner cannot use them (CR 1.2.2)", () => {
    const s = encounter("hakarl-1-0");
    s.turn.bioroidIcePaidAbilitiesForbidden = true;
    expect(entries(s, "hakarl-click-break")).toEqual([]);
    expect(use(s, "hakarl-click-break").ok).toBe(false);
  });

  it("does not reach N-Pot, which is not bioroid ice", () => {
    const s = encounter("n-pot");
    s.turn.bioroidIcePaidAbilitiesForbidden = true;
    expect(entries(s, "n-pot-break").map((e) => e.actor)).toEqual(["runner"]);
  });
});

describe("Hákarl 1.0's cost", () => {
  it("is Lose [click], so the ability is not an action (CR 5.2.1, 1.11.3b)", () => {
    const hakarl = instantiateCard("hakarl-1-0", "h-1", "server:hq:ice");
    const brk = findPaidAbility(hakarl, "hakarl-click-break")!;
    expect(brk.cost).toEqual({ loseClicks: 1 });
    expect(costBeginsWithClick(brk)).toBe(false);
  });
});
