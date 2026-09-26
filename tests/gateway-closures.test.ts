import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  createGame,
  createInitialState,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  setupEmptyRemoteWithIce,
  assertPinnedTag,
  crDataPresent,
  effectiveBreakerStrength,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("Gateway partial closures", () => {
  it("closes a large wave of Gateway unsupported notes", () => {
    const pool = loadCardPool(true).waves["system-gateway"].cards;
    let full = 0;
    let partial = 0;
    for (const id of pool) {
      const notes = getCardDef(id).unsupported ?? [];
      if (notes.length === 0) full += 1;
      else partial += 1;
    }
    expect(full + partial).toBe(77);
    expect(full).toBeGreaterThanOrEqual(70);
    expect(partial).toBeLessThanOrEqual(7);
  });

  it("Hansei Review trashes from HQ after gaining 10", () => {
    let s = createInitialState();
    const op = instantiateCard("hansei-review", "hr-1", "corp:hq");
    const filler = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    s = structuredClone(s);
    s.cards["hr-1"] = op;
    s.cards["hq-1"] = filler;
    s.corp.hand = ["hr-1", "hq-1"];
    s.corp.credits = 10;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const before = s.corp.credits;
    s = must(s, { type: "play_operation", cardId: "hr-1" });
    expect(s.corp.credits).toBe(before - 5 + 10);
    expect(s.corp.discard).toContain("hq-1");
    expect(s.corp.hand).not.toContain("hq-1");
  });

  it("Sprint draws 3 then shuffles 2 HQ into R&D", () => {
    let s = createInitialState();
    const op = instantiateCard("sprint", "sp-1", "corp:hq");
    s = structuredClone(s);
    s.cards["sp-1"] = op;
    for (let i = 0; i < 5; i++) {
      const id = `fill-${i}`;
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
      s.corp.deck.push(id);
    }
    s.corp.hand = ["sp-1"];
    s.corp.credits = 5;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, { type: "play_operation", cardId: "sp-1" });
    // Drew 3 into hand then shuffled 2 back → hand size 1
    expect(s.corp.hand.length).toBe(1);
  });

  it("Retribution requires tagged Runner and may trash hardware", () => {
    const def = getCardDef("retribution");
    expect(def.playRequiresTagged).toBe(true);
    expect(def.onPlay).toEqual(fx.trashProgramOrHardware("choose"));
  });

  it("Echelon gains strength per icebreaker", () => {
    let s = createInitialState();
    const ech = instantiateCard("echelon", "ech-1", "runner:rig");
    const other = instantiateCard("cleaver", "cl-1", "runner:rig");
    s = structuredClone(s);
    s.cards["ech-1"] = ech;
    s.cards["cl-1"] = other;
    s.runner.rig = ["ech-1", "cl-1"];
    expect(effectiveBreakerStrength(s, "ech-1")).toBe(2);
  });

  it("MU bonus tracked; Diviner ETR on odd grip after net", () => {
    expect(getCardDef("t400-memory-diamond").muBonus).toBe(1);
    expect(getCardDef("diviner").unsupported ?? []).toEqual([]);
    const sub = getCardDef("diviner").subroutines![0]!;
    expect(sub.effect).toEqual(
      fx.seq(
        fx.netDamage(1),
        fx.if({ op: "grip_count_odd" }, fx.etr()),
      ),
    );
  });

  it("Luminal forbids further scoring this turn", () => {
    expect(getCardDef("luminal-transubstantiation").onScore).toEqual(
      fx.seq(fx.gainClicks("corp", 3), fx.forbidScoringAgendasThisTurn()),
    );
  });

  it("Mayfly and Zahya / René fields load", () => {
    expect(getCardDef("mayfly").trashAfterBreakingThisRun).toBe(true);
    expect(getCardDef("zahya-sadeghi-versatile-smuggler").creditsPerAccessOnCentralRunEnd).toBe(
      true,
    );
    expect(getCardDef("rene-loup-arcemont-party-animal").onAccessTrashGain).toEqual({
      credits: 1,
      draw: 1,
      oncePerTurn: true,
    });
  });

  it("Leech places virus on successful central run", () => {
    expect(getCardDef("leech").onSuccessfulRun).toEqual(
      fx.if({ op: "attacking_central" }, fx.addVirusCounter(1)),
    );
  });
});
