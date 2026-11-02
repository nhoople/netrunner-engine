import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  deckbuildingReport,
  enterStep,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";
import type { GameState } from "../src/state/types.js";
import { occurCheckpoint } from "../src/legality/checkpoints.js";
import { memoryLimit } from "../src/state/turn.js";
import { recomputeRunnerMaxHandSize } from "../src/state/handSize.js";
import { installBlockReason, onCardRezzed } from "../src/state/staticFlags.js";
import { CR } from "../src/timing/labels.js";

describe("static declarations", () => {
  beforeAll(() => {
    assertCardsPinnedTag("v1.147.18");
    assertPinnedTag("v26.03");
  });

  it("takes bad publicity when a card with that rez declaration is rezzed", () => {
    expect(cardsDataPresent() && crDataPresent()).toBe(true);
    const s = createInitialState();
    const ice = instantiateCard("bulwark", "bw-1", "server:hq:ice");
    s.cards["bw-1"] = ice;
    s.servers.hq.ice = ["bw-1"];
    ice.rezzed = true;
    onCardRezzed(s, ice);
    expect(s.corp.badPublicity).toBeGreaterThan(0);
  });

  it("empties the credit pool through lose_credits and Order of Sol gains 1", () => {
    const s = createInitialState();
    const sol = instantiateCard("order-of-sol", "sol-1", "runner:installed");
    s.cards["sol-1"] = sol;
    s.runner.installed = ["sol-1"];
    s.runner.credits = 2;
    const lost = evalEffect(
      { state: s, sourceId: "sol-1" },
      fx.do({ kind: "lose_credits", side: "runner", amount: 2 }),
    );
    expect(lost.ok).toBe(true);
    expect(s.runner.credits).toBe(0);
    expect(s.turn.firstCreditPoolEmptyMetPending).toBe(true);
    occurCheckpoint(
      s,
      "instruction",
      "first credit pool empty",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.runner.credits).toBe(1);
  });

  it("refuses a resource that needs more link than the Runner has", () => {
    const s = createInitialState();
    const card = instantiateCard("sure-gamble", "st-1", "runner:grip");
    card.installRequiresLinkGte = 2;
    s.cards["st-1"] = card;
    s.runner.link = 0;
    expect(installBlockReason(s, card)).toMatch(/link/);
  });

  it("counts agenda points toward memory and hand size when those declarations are set", () => {
    const s = createInitialState();
    const chip = instantiateCard("sure-gamble", "chip-1", "runner:installed");
    chip.type = "hardware";
    chip.muEqualsAgendaPoints = true;
    chip.handSizeEqualsAgendaPoints = true;
    s.cards["chip-1"] = chip;
    s.runner.installed = ["chip-1"];
    s.runner.scoreArea = [];
    const agenda = instantiateCard("priority-requisition", "ag-1", "runner:score");
    s.cards["ag-1"] = agenda;
    s.runner.scoreArea = ["ag-1"];
    expect(memoryLimit(s)).toBe(s.runner.memoryLimit + 3);
    recomputeRunnerMaxHandSize(s);
    expect(s.runner.maxHandSize).toBe(5 + 3);
  });

  it("reports a deck over its printed copy limit and zeroes influence when the condition holds", () => {
    const report = deckbuildingReport([
      { defId: "fifteen-minutes", deckLimit: 1, influence: 2 },
      { defId: "fifteen-minutes", deckLimit: 1, influence: 2 },
      {
        defId: "mumbad-construction-co",
        influence: 3,
        type: "asset",
        zeroInfluenceIfAssetsInDeckGte: 2,
      },
      { defId: "pad", type: "asset", influence: 0 },
    ]);
    expect(report.overLimit).toContain("fifteen-minutes");
    expect(report.influence).toBe(4);
    expect(report.deckSize).toBe(4);
    expect(report.underMinimum).toBe(false);
    expect(report.agendaOutOfRange).toBe(false);
  });

  it("checks minimum deck size, influence, and the Corp agenda band (CR 1.4.3, 1.4.5, 1.4.6)", () => {
    const identity = {
      side: "corp" as const,
      faction: "haas-bioroid",
      minimumDeckSize: 45,
      influenceLimit: 15,
    };
    const short = deckbuildingReport(
      Array.from({ length: 39 }, (_, i) => ({
        defId: `card-${i}`,
        influence: 0,
        faction: "haas-bioroid",
      })),
      identity,
    );
    expect(short.underMinimum).toBe(true);
    expect(short.agendaMin).toBe(null);

    const legal = deckbuildingReport(
      [
        ...Array.from({ length: 43 }, (_, i) => ({
          defId: `ice-${i}`,
          type: "ice",
          influence: i === 0 ? 16 : 0,
          faction: i === 0 ? "jinteki" : "haas-bioroid",
        })),
        { defId: "ag-a", type: "agenda", agendaPoints: 10, influence: 0 },
        { defId: "ag-b", type: "agenda", agendaPoints: 10, influence: 0 },
      ],
      identity,
    );
    expect(legal.deckSize).toBe(45);
    expect(legal.underMinimum).toBe(false);
    expect(legal.influence).toBe(16);
    expect(legal.overInfluence).toBe(true);
    expect(legal.agendaPoints).toBe(20);
    expect(legal.agendaMin).toBe(20);
    expect(legal.agendaMax).toBe(21);
    expect(legal.agendaOutOfRange).toBe(false);

    const wide = deckbuildingReport(
      Array.from({ length: 66 }, (_, i) => ({
        defId: i < 14 ? `ag-${i}` : `card-${i}`,
        type: i < 14 ? "agenda" : "ice",
        agendaPoints: i < 14 ? 2 : 0,
        influence: 0,
      })),
      { side: "corp", minimumDeckSize: 40, influenceLimit: 15 },
    );
    expect(wide.agendaPoints).toBe(28);
    expect(wide.agendaMin).toBe(28);
    expect(wide.agendaMax).toBe(29);
    expect(wide.agendaOutOfRange).toBe(false);

    const runner = deckbuildingReport(
      [{ defId: "sure-gamble", influence: 0 }],
      { side: "runner", minimumDeckSize: 45, influenceLimit: 15 },
    );
    expect(runner.underMinimum).toBe(true);
    expect(runner.agendaMin).toBe(null);
    expect(runner.agendaOutOfRange).toBe(false);
  });

  it("draws one extra card on the first basic draw from the declaration", () => {
    let s = createInitialState();
    const card = instantiateCard("sure-gamble", "vp", "runner:installed");
    card.additionalCardsOnFirstBasicDrawEachTurn = 1;
    card.title = "Verbal Plasticity";
    card.defId = "sure-gamble";
    s.cards["vp"] = card;
    s.runner.installed = ["vp"];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;
    const hand = s.runner.hand.length;
    s = must(s, { type: "basic_draw" });
    expect(s.runner.hand).toHaveLength(hand + 2);
    expect(s.log.some((line) => line.includes("Verbal Plasticity — first basic draw is 2."))).toBe(true);

    const named = createInitialState();
    const shell = instantiateCard("sure-gamble", "shell", "runner:installed");
    shell.defId = "verbal-plasticity";
    shell.additionalCardsOnFirstBasicDrawEachTurn = undefined;
    named.cards["shell"] = shell;
    named.runner.installed = ["shell"];
    named.activeSide = "runner";
    named.timingKey = "runner.takeAction";
    named.runner.clicks = 1;
    const namedHand = named.runner.hand.length;
    const drawn = must(named, { type: "basic_draw" });
    expect(drawn.runner.hand).toHaveLength(namedHand + 1);
  });

  it("gains a credit at Corp turn end when Archives has a facedown card", () => {
    const s = createInitialState();
    const id = s.cards[s.corp.identityId]!;
    id.gainCreditOnCorpTurnEndIfArchivesHasFacedown = 1;
    id.title = "Jinteki: Restoring Humanity";
    const facedown = instantiateCard("hedge-fund", "arch-1", "corp:discard");
    facedown.faceup = false;
    s.cards["arch-1"] = facedown;
    s.corp.discardPile = ["arch-1"];
    const before = s.corp.credits;
    s.timingKey = "corp.loseClicks";
    enterStep(s, "corp.turnEnds");
    autoWalk(s);
    expect(s.corp.credits).toBe(before + 1);
    expect(s.log.join("\n")).toContain("facedown Archives");

    const blank = createInitialState();
    const blankId = blank.cards[blank.corp.identityId]!;
    blankId.gainCreditOnCorpTurnEndIfArchivesHasFacedown = 1;
    blankId.defId = "jinteki-restoring-humanity";
    suppressAbilities(blank, blankId.id);
    const hidden = instantiateCard("hedge-fund", "arch-2", "corp:discard");
    hidden.faceup = false;
    blank.cards["arch-2"] = hidden;
    blank.corp.discardPile = ["arch-2"];
    const blankCredits = blank.corp.credits;
    blank.timingKey = "corp.loseClicks";
    enterStep(blank, "corp.turnEnds");
    autoWalk(blank);
    expect(blank.corp.credits).toBe(blankCredits);
  });
});

function must(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
