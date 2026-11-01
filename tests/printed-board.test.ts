/**
 * A subroutine whose printed text is one instruction is played on its
 * encounter step. The board must change by the number in that sentence.
 * "Gain 2¢." with a tree that gains 3 fails, and so does a tree that gains 2
 * while the credit pool changes by something else.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  loadCardCatalog,
  STEPS,
} from "../src/index.js";
import { cursorFrom } from "../src/timing/graph.js";
import type { CardDef } from "../src/cards/load.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

type Measure = "corpCredits" | "runnerCredits" | "tags" | "grip" | "corpHand" | "runnerHand";

const SENTENCES: Array<{ pattern: RegExp; kind: string; measure: Measure }> = [
  { pattern: /^Gain (\d+)(?:\[credit\]|¢)\.$/, kind: "gain_credits", measure: "corpCredits" },
  { pattern: /^The Runner loses (\d+)(?:\[credit\]|¢| credits)\.$/, kind: "lose_credits", measure: "runnerCredits" },
  { pattern: /^Do (\d+) net damage\.$/, kind: "net_damage", measure: "grip" },
  { pattern: /^Do (\d+) meat damage\.$/, kind: "meat_damage", measure: "grip" },
  { pattern: /^Do (\d+) core damage\.$/, kind: "core_damage", measure: "grip" },
  { pattern: /^Give the Runner (\d+) tags?\.$/, kind: "give_tags", measure: "tags" },
  { pattern: /^Draw (\d+) cards?\.$/, kind: "draw", measure: "runnerHand" },
];

function singleAmount(effect: unknown): { kind: string; amount: number; side?: string } | null {
  if (!effect || typeof effect !== "object") return null;
  const node = effect as { op?: string; action?: Record<string, unknown> };
  if (node.op !== "do" || !node.action) return null;
  const action = node.action;
  if (typeof action.kind !== "string" || typeof action.amount !== "number") return null;
  if (action.tally !== undefined) return null;
  const extra = Object.keys(action).filter((key) => key !== "kind" && key !== "amount" && key !== "side");
  if (extra.length > 0) return null;
  return {
    kind: action.kind,
    amount: action.amount,
    side: typeof action.side === "string" ? action.side : undefined,
  };
}

function readMeasure(state: GameState, measure: Measure, side?: string): number {
  if (measure === "corpCredits") return side === "runner" ? state.runner.credits : state.corp.credits;
  if (measure === "runnerCredits") return state.runner.credits;
  if (measure === "tags") return state.runner.tags;
  if (measure === "grip") return state.runner.hand.length;
  if (measure === "corpHand") return state.corp.hand.length;
  return side === "corp" ? state.corp.hand.length : state.runner.hand.length;
}

function fillGrip(state: GameState): void {
  while (state.runner.hand.length < 15 && state.runner.deck.length > 0) {
    const id = state.runner.deck.shift();
    if (!id) break;
    state.runner.hand.push(id);
    state.cards[id]!.zone = "runner:grip";
    state.cards[id]!.faceup = false;
  }
}

describe("printed one-instruction subroutines", () => {
  it("changes the board by the number printed on the subroutine", () => {
    const failures: string[] = [];
    let played = 0;
    for (const def of loadCardCatalog(true).values()) {
      for (const sub of def.subroutines ?? []) {
        const sentence = SENTENCES.find((entry) => entry.pattern.test(sub.text));
        if (!sentence) continue;
        const printed = Number(sentence.pattern.exec(sub.text)?.[1]);
        const action = singleAmount(sub.effect);
        if (!action || action.kind !== sentence.kind) {
          failures.push(`${def.id} prints "${sub.text}" but the instruction is not ${sentence.kind}`);
          continue;
        }
        if (action.amount !== printed) {
          failures.push(`${def.id} prints "${sub.text}" but the instruction amount is ${action.amount}`);
          continue;
        }
        const state = boardFor(def);
        const card = state.cards.subject!;
        const index = card.subroutines?.findIndex((item) => item.text === sub.text) ?? -1;
        if (index < 0 || !state.run?.encounter) {
          failures.push(`${def.id} "${sub.text}" was not seated as a subroutine`);
          continue;
        }
        state.run.encounter.broken = card.subroutines!.map((_, at) => at !== index);
        const before = readMeasure(state, sentence.measure, action.side);
        try {
          STEPS["run.resolveSub"]?.onResolve?.(state);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${def.id} "${sub.text}" threw: ${message}`);
          continue;
        }
        if (state.log.some((line) => line.includes("Unhandled primitive"))) {
          failures.push(`${def.id} "${sub.text}" hit an unhandled primitive`);
          continue;
        }
        if (state.pendingChoice || state.pendingDamage || state.pendingTags) {
          failures.push(`${def.id} "${sub.text}" paused before the instruction finished`);
          continue;
        }
        const after = readMeasure(state, sentence.measure, action.side);
        const delta = sentence.measure === "runnerCredits" || sentence.measure === "grip" ? before - after : after - before;
        if (delta !== printed) {
          failures.push(`${def.id} "${sub.text}" changed the board by ${delta}`);
        } else {
          played += 1;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(played).toBeGreaterThan(0);
  }, 60_000);
});

function boardFor(def: CardDef): GameState {
  const state = createInitialState();
  state.corp.credits = 50;
  state.runner.credits = 50;
  state.corp.clicks = 3;
  state.runner.clicks = 3;
  fillGrip(state);
  const card = instantiateCard(def.id, "subject", "server:hq:ice");
  card.rezzed = true;
  card.faceup = true;
  state.cards.subject = card;
  state.servers.hq.ice = ["subject", ...state.servers.hq.ice.filter((id) => id !== "subject")];
  const step = STEPS["run.resolveSub"]!;
  state.timingKey = step.key;
  state.timing = cursorFrom(step);
  state.turnPhase = step.turnPhase ?? state.turnPhase;
  const subs = card.subroutines ?? [];
  state.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: {
      iceId: "subject",
      broken: subs.map(() => true),
    },
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
  return state;
}
