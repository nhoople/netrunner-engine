/**
 * Midnight Sun: Trieste (forbid runner-card breaks), Wave (search ice + harmonic
 * credits), Regenesis (score facedown Archives agenda if Archives clean).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  agendaPointsFor,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.23.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS Trieste choose_rezzed_bioroid_forbid_runner_break", () => {
  it("validates tree", () => {
    expect(
      validateEffectTree(fx.chooseRezzedBioroidForbidRunnerBreak()),
    ).toBeNull();
  });

  it("marks the only rezzed bioroid ice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("hakarl-1-0", "bio-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["bio-1"] = ice;
    s.servers.hq.ice = ["bio-1"];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.chooseRezzedBioroidForbidRunnerBreak(),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["bio-1"].cannotBreakWithRunnerCardAbilities).toBe(true);
  });
});

describe("MS Wave search_rd_ice + gain_credits_per_rezzed_subtype", () => {
  it("validates trees", () => {
    expect(validateEffectTree(fx.searchRdIceToHq())).toBeNull();
    expect(
      validateEffectTree(fx.gainCreditsPerRezzedSubtype("harmonic")),
    ).toBeNull();
  });

  it("searches R&D for ice into HQ", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "rd-ice", "corp:rd");
    s.cards["rd-ice"] = ice;
    s.corp.deck = ["rd-ice", ...s.corp.deck];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.searchRdIceToHq(),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toContain("rd-ice");
    expect(s.cards["rd-ice"].zone).toBe("corp:hq");
  });

  it("gains 1¢ per rezzed harmonic ice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 0;
    const h1 = instantiateCard("ice-wall", "h1", "server:hq:ice");
    h1.rezzed = true;
    h1.subtypes = ["code gate", "harmonic"];
    s.cards["h1"] = h1;
    s.servers.hq.ice = ["h1"];
    const h2 = instantiateCard("ice-wall", "h2", "server:rd:ice");
    h2.rezzed = true;
    h2.subtypes = ["barrier", "harmonic"];
    s.cards["h2"] = h2;
    s.servers.rd.ice = ["h2"];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.gainCreditsPerRezzedSubtype("harmonic"),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(2);
  });
});

describe("MS Regenesis score_facedown_agenda_from_archives_if_clean", () => {
  it("validates tree", () => {
    expect(
      validateEffectTree(fx.scoreFacedownAgendaFromArchivesIfClean()),
    ).toBeNull();
  });

  it("scores a facedown Archives agenda when Archives was clean", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.turn.corpCardsAddedToArchivesThisTurn = 0;
    const ag = instantiateCard("hostile-takeover", "arch-ag", "corp:archives");
    ag.faceup = false;
    s.cards["arch-ag"] = ag;
    s.corp.discard = ["arch-ag"];
    const before = agendaPointsFor(s, "corp");
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.scoreFacedownAgendaFromArchivesIfClean(),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.score).toContain("arch-ag");
    expect(s.cards["arch-ag"].faceup).toBe(true);
    expect(agendaPointsFor(s, "corp")).toBe(before + 1);
  });

  it("skips when Corp cards were added to Archives this turn", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.turn.corpCardsAddedToArchivesThisTurn = 2;
    const ag = instantiateCard("hostile-takeover", "arch-ag2", "corp:archives");
    ag.faceup = false;
    s.cards["arch-ag2"] = ag;
    s.corp.discard = ["arch-ag2"];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.scoreFacedownAgendaFromArchivesIfClean(),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.score).not.toContain("arch-ag2");
  });
});

describe("MS card wiring (Trieste / Wave / Regenesis)", () => {
  it("wires cleared cards", () => {
    expect(getCardDef("trieste-model-bioroids").unsupported).toEqual([]);
    expect(getCardDef("wave").unsupported).toEqual([]);
    expect(getCardDef("regenesis").unsupported).toEqual([]);
    expect(getCardDef("regenesis").onScore).toEqual(fx.scoreFacedownAgendaFromArchivesIfClean());
  });
});
