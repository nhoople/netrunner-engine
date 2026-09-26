import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  createInitialState,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  setupEmptyRemoteWithIce,
  assertPinnedTag,
  crDataPresent,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  agendaPointsFor,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

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

describe("SU21 partial closures", () => {
  it("closes many SU21 unsupported notes (tally)", () => {
    const pool = loadCardPool(true).waves["system-update-2021"].cards;
    let full = 0;
    let partial = 0;
    for (const id of pool) {
      const notes = getCardDef(id).unsupported ?? [];
      if (notes.length === 0) full += 1;
      else partial += 1;
    }
    expect(full + partial).toBe(82);
    expect(full).toBe(82);
    expect(partial).toBe(0);
  });

  it("agenda counters place on agendaCounters, not advancements", () => {
    let s = createInitialState();
    const ag = instantiateCard("nisei-mk-ii", "nisei-1", "corp:score");
    s = structuredClone(s);
    s.cards["nisei-1"] = ag;
    s.corp.score.push("nisei-1");
    const r = evalEffect(
      { state: s, sourceId: "nisei-1" },
      fx.addAgendaCounter(1),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["nisei-1"].agendaCounters).toBe(1);
    expect(s.cards["nisei-1"].advancementTokens ?? 0).toBe(0);
  });

  it("Beale overadvance counters and AP from counters", () => {
    let s = createInitialState();
    const ag = instantiateCard("project-beale", "beale-1", "corp:score");
    ag.advancementTokens = 7; // past 3 → floor(4/2)=2 counters
    s = structuredClone(s);
    s.cards["beale-1"] = ag;
    s.corp.score = ["beale-1"];
    const r = evalEffect(
      { state: s, sourceId: "beale-1" },
      fx.addAgendaCountersFromOveradvance(3, 2),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["beale-1"].agendaCounters).toBe(2);
    expect(agendaPointsFor(s, "corp")).toBe(4);
  });

  it("Tollbooth forces pay when Runner has credits", () => {
    let s = createInitialState();
    s.runner.credits = 5;
    const r = evalEffect(
      { state: s, sourceId: "tb" },
      fx.payCreditsOrEtr("runner", 3),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(2);
  });

  it("Egret grants all ice subtypes to host", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    s = structuredClone(s);
    s.cards[iceId] = instantiateCard(
      "lotus-field",
      iceId,
      `server:${remote.id}:ice`,
    );
    s.cards[iceId].rezzed = true;
    const eg = instantiateCard("egret", "eg-1", "runner:rig");
    eg.hostId = iceId;
    eg.hostGainsAllIceSubtypes = true;
    s.cards["eg-1"] = eg;
    s.runner.rig.push("eg-1");
    const subs = effectiveIceSubtypes(s, iceId);
    expect(subs).toEqual(
      expect.arrayContaining(["code gate", "barrier", "sentry"]),
    );
  });

  it("Swordsman / Hortum block AI breaks when flagged", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    s = structuredClone(s);
    s.cards[iceId] = instantiateCard(
      "swordsman",
      iceId,
      `server:${remote.id}:ice`,
    );
    expect(iceBlocksAiBreak(s, iceId)).toBe(true);

    s.cards[iceId] = instantiateCard(
      "hortum",
      iceId,
      `server:${remote.id}:ice`,
    );
    s.cards[iceId].advancementTokens = 2;
    expect(iceBlocksAiBreak(s, iceId)).toBe(false);
    s.cards[iceId].advancementTokens = 3;
    expect(iceBlocksAiBreak(s, iceId)).toBe(true);
  });

  it("Oaktown installs faceup and pays on advance", () => {
    let s = createInitialState();
    const oak = instantiateCard("oaktown-renovation", "oak-1", "corp:hq");
    s = structuredClone(s);
    s.cards["oak-1"] = oak;
    s.corp.hand = ["oak-1"];
    s.corp.credits = 10;
    s.corp.clicks = 4;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, {
      type: "basic_install",
      cardId: "oak-1",
      destination: { kind: "new_remote" },
    });
    expect(s.cards["oak-1"].faceup).toBe(true);
    const before = s.corp.credits;
    s = must(s, { type: "advance", cardId: "oak-1" });
    expect(s.corp.credits).toBe(before - 1 + 2);
  });

  it("closed cards have empty unsupported", () => {
    for (const id of [
      "nisei-mk-ii",
      "house-of-knives",
      "project-vitruvius",
      "project-atlas",
      "project-beale",
      "quetzal-free-spirit",
      "abagnale",
      "tollbooth",
      "imp",
      "crisium-grid",
      "sansan-city-grid",
      "hokusai-grid",
      "egret",
      "swordsman",
      "hortum",
      "ronin",
      "paricia",
      "scrubber",
      "prepaid-voicepad",
      "oaktown-renovation",
      "license-acquisition",
      "punitive-counterstrike",
      "emergency-shutdown",
      "networking",
      "career-fair",
      "archer",
      "corporate-town",
      "atman",
      "chameleon",
      "femme-fatale",
      "en-passant",
      "retrieval-run",
      "test-run",
      "security-testing",
      "marilyn-campaign",
      "magnet",
      "ravana-1-0",
      "corporate-troubleshooter",
      "celebrity-gift",
      "trick-of-light",
      "daily-business-show",
      "psychographics",
      "haas-bioroid-architects-of-tomorrow",
      "steve-cambridge-master-grifter",
      "ayla-bios-rahim-simulant-specialist",
      "subliminal-messaging",
      "forged-activation-orders",
      "hostile-takeover",
      "aesops-pawnshop",
    ]) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("Archer rez requires forfeit agenda", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    s = structuredClone(s);
    s.cards[iceId] = instantiateCard("archer", iceId, `server:${remote.id}:ice`);
    s.cards[iceId].rezzed = false;
    s.corp.credits = 10;
    s.timingKey = "run.approachPaw";
    s.run = {
      attackedServerId: remote.id,
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    // No scored agenda → cannot rez
    const blocked = applyIntent(s, { type: "rez_ice", cardId: iceId });
    expect(blocked.ok).toBe(false);

    const ag = instantiateCard("hostile-takeover", "ht-scored", "corp:score");
    s.cards["ht-scored"] = ag;
    s.corp.score = ["ht-scored"];
    s = must(s, { type: "rez_ice", cardId: iceId });
    expect(s.cards[iceId].rezzed).toBe(true);
    expect(s.corp.score).toEqual([]);
    expect(s.corp.discard).toContain("ht-scored");
  });

  it("Psychographics spends X ≤ tags for advancements", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const op = instantiateCard("psychographics", "psy-1", "corp:hq");
    s.cards["psy-1"] = op;
    s.corp.hand = ["psy-1"];
    s.corp.credits = 5;
    s.corp.clicks = 3;
    s.runner.tags = 3;
    const ice = instantiateCard("ice-wall", "iw-1", "server:remote-1:ice");
    s.cards["iw-1"] = ice;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["iw-1"],
      root: [],
    };
    s.nextRemoteNumber = 2;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s = must(s, { type: "play_operation", cardId: "psy-1" });
    expect(s.corp.credits).toBe(2); // spent 3
    expect(s.cards["iw-1"].advancementTokens).toBe(3);
  });

  it("Atman gains strength from power counters and equal-str gate", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const at = instantiateCard("atman", "at-1", "runner:grip");
    s.cards["at-1"] = at;
    s.runner.hand = ["at-1"];
    s.runner.credits = 5; // 3 install + 2 for counters
    s.runner.clicks = 2;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "basic_install",
      cardId: "at-1",
      destination: { kind: "rig" },
    });
    expect(s.cards["at-1"].powerCounters).toBe(2);
    expect(s.runner.credits).toBe(0);
  });
});
