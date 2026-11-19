/**
 * The playout blockers (CR audit program, step PB).
 *
 * B1: after an agenda was stolen, a "when stolen" choice (Send a Message)
 * left the run at access.stealAgenda with no card being accessed. Legality
 * offered finish_breach / access_card there; apply refused them.
 *
 * B2: a "when your turn begins" choice left the turn parked on
 * corp.turnBegins / runner.turnBegins with nothing legal, and the Corp step
 * noted its turn-begin abilities again each time it was walked.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  enterStep,
  instantiateCard,
  isActionLegal,
  queryLegality,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";
import { replayTo, type Format } from "./playout/harness.js";
import { passIdle } from "../src/demo/passIdle.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.24");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${action.type}: ${result.error}`);
  return passIdle(result.state);
}

/** Every action legality offers, apply takes (CR 9.2.1: legality is apply's gate). */
function expectEveryLegalActionApplies(state: GameState): void {
  const legal = queryLegality(state).legal;
  expect(legal.length).toBeGreaterThan(0);
  for (const { action } of legal) {
    const result = applyAction(structuredClone(state), action);
    expect(result.ok ? "ok" : `${action.type}: ${result.error}`).toBe("ok");
  }
}

describe("B1: the access completes after a stolen agenda's choice (CR 7.2.3, 7.2.4)", () => {
  // Learn to play starter, seed 1: the Runner breaches HQ and accesses
  // Send a Message, which lets the Corp rez a piece of ice when stolen.
  const atSteal = () => replayTo("learn_to_play_starter", 1, 22);

  it("Send a Message's rez choice ends the access and the run, not a stalled steal step", () => {
    let s = atSteal();
    expect(s.timingKey).toBe("access.stealAgenda");
    const agendaId = s.run?.accessingCardId;
    expect(agendaId && s.cards[agendaId]?.title).toBe("Send a Message");

    s = must(s, { type: "steal_agenda", cardId: agendaId! });
    expect(s.cards[agendaId!]?.zone).toBe("runner:score");
    const rez = s.pendingChoice?.options.find((o) => o.id !== "decline");
    expect(rez).toBeDefined();

    s = must(s, { type: "choose_option", optionId: rez!.id });
    expect(s.cards[rez!.id]?.rezzed).toBe(true);
    // 7.2.4: the access is complete; HQ's access limit was 1, so the breach
    // and the run end and the Runner is back in their action phase.
    expect(s.timingKey.startsWith("access.")).toBe(false);
    expect(s.run).toBeNull();
    expect(s.log.some((l) => l.includes("Access complete (CR 7.2.4"))).toBe(
      true,
    );
    expectEveryLegalActionApplies(s);
  });

  it("legality and apply share one gate for breach candidates (11.5_4_a)", () => {
    const s = atSteal();
    for (const action of [
      { type: "finish_breach" },
      { type: "access_card", cardId: s.run!.accessingCardId! },
    ] as Action[]) {
      expect(isActionLegal(s, action)).toBe(false);
      expect(applyAction(structuredClone(s), action).ok).toBe(false);
    }
  });

  it.each([
    ["learn_to_play_starter", 2, 63],
    ["learn_to_play_starter", 4, 138],
    ["startup", 2, 136],
  ] as [Format, number, number][])(
    "%s seed %i: every breach action offered at step %i applies",
    (format, seed, step) => {
      expectEveryLegalActionApplies(replayTo(format, seed, step));
    },
    // A replay of up to 200 steps, like the playout suites.
    60_000,
  );
});

/** AU Co. as the Corp identity, at the start of the Corp's turn. */
function auCoTurnBegins(powerCounters: number): GameState {
  const s = createInitialState();
  // The default grip Marjanah is marked rezzed (CR 8.1.4f); clear it.
  s.cards["runner-program-1"]!.rezzed = false;
  const identity = instantiateCard(
    "au-co-the-gold-standard-in-clones",
    s.corp.identityId,
    s.cards[s.corp.identityId]!.zone,
  );
  identity.powerCounters = powerCounters;
  s.cards[s.corp.identityId] = identity;
  s.activeSide = "corp";
  s.timingKey = "corp.startPaw";
  enterStep(s, "corp.turnBegins");
  autoWalk(s);
  return s;
}

describe("B2: a turn-begin choice does not stall the turn (CR 9.6.6, 11.2_1_d, 11.3_1_d)", () => {
  it("declining AU Co. moves the Corp's turn on to the draw, and the ability is marked once", () => {
    let s = auCoTurnBegins(0);
    expect(s.pendingChoice?.sourceId).toBe(s.corp.identityId);
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.pendingChoice).toBeNull();
    expect(s.timingKey).not.toBe("corp.turnBegins");
    expect(s.turn.corpTurnBegan).toBe(true);
    expect(s.log.filter((l) => l.startsWith("Corp turn begins"))).toHaveLength(
      1,
    );
    expectEveryLegalActionApplies(s);
  });

  it("AU Co.'s look with too few power counters pays nothing and the turn goes on (CR 1.16.1)", () => {
    let s = auCoTurnBegins(1);
    const deck = [...s.corp.deck];
    s = must(s, { type: "choose_option", optionId: "look" });
    expect(s.cards[s.corp.identityId]?.powerCounters).toBe(1);
    expect(s.corp.deck).toEqual(deck);
    expect(s.pendingChoice).toBeNull();
    expect(s.timingKey).not.toBe("corp.turnBegins");
    expectEveryLegalActionApplies(s);
  });

  it.each([
    ["startup", 3, 44],
    ["startup", 4, 5],
    ["startup", 11, 182],
    ["core", 1, 84],
    ["standard", 1, 191],
    ["standard", 14, 71],
  ] as [Format, number, number][])(
    "%s seed %i: the turn has a legal action at step %i",
    (format, seed, step) => {
      const s = replayTo(format, seed, step);
      expect(s.timingKey.endsWith(".turnBegins") && !s.pendingChoice).toBe(
        false,
      );
      expectEveryLegalActionApplies(s);
    },
    // A replay of up to 200 steps, like the playout suites.
    60_000,
  );
});

describe("B1: steal is offered only when its additional costs can be paid (CR 1.16.1, 1.16.10b, 7.2.3)", () => {
  // Standard, seed 179: the Runner accesses SDS Drone Deployment ("as an
  // additional cost to steal this agenda, the Runner must trash an installed
  // program") with no program installed.
  it("SDS Drone Deployment with no installed program: only finishing the access is legal", () => {
    const s = replayTo("standard", 179, 66);
    expect(s.timingKey).toBe("access.stealAgenda");
    const agendaId = s.run!.accessingCardId!;
    expect(s.cards[agendaId]?.title).toBe("SDS Drone Deployment");
    expect(
      s.runner.installed.filter((id) => s.cards[id]?.type === "program"),
    ).toEqual([]);

    const steal: Action = { type: "steal_agenda", cardId: agendaId };
    expect(isActionLegal(s, steal)).toBe(false);
    expect(applyAction(structuredClone(s), steal).ok).toBe(false);
    expect(queryLegality(s).legal.map((l) => l.action.type)).toEqual([
      "finish_access",
    ]);

    const after = must(s, { type: "finish_access" });
    expect(after.cards[agendaId]?.zone).toBe("corp:rd");
    expect(after.runner.scoreArea).not.toContain(agendaId);
    expectEveryLegalActionApplies(after);
  });
});

describe("a run-end choice answered after the run is over (CR 6.9.6d, 10.3.6)", () => {
  // Standard, seed 50: Always Have a Backup Plan offers its rerun at run end.
  it("declining Always Have a Backup Plan returns the Runner to their action phase", () => {
    const s = replayTo("standard", 50, 27);
    expect(s.timingKey).toBe("run.ends");
    expect(s.run).toBeNull();
    expect(s.cards[s.pendingChoice!.sourceId!]?.title).toBe(
      "Always Have a Backup Plan",
    );
    const after = must(s, {
      type: "choose_option",
      optionId: "decline-backup",
    });
    expect(after.pendingChoice).toBeNull();
    expect(after.run).toBeNull();
    expect(after.timingKey).toBe("runner.actionPaw");
    expectEveryLegalActionApplies(after);
  });

  it("accepting starts the new run on the attacked server, ignoring additional costs, with no click spent", () => {
    const s = replayTo("standard", 50, 27);
    const clicks = s.runner.clicks;
    const after = must(s, { type: "choose_option", optionId: "backup-rerun" });
    expect(after.pendingChoice).toBeNull();
    expect(after.run?.attackedServerId).toBe("hq");
    expect(after.run?.backupPlanIgnoreAdditionalCosts).toBe(true);
    expect(after.timingKey.startsWith("run.")).toBe(true);
    expect(after.runner.clicks).toBe(clicks);
    expectEveryLegalActionApplies(after);
  });
});
