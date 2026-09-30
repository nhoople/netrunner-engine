/**
 * TAI v0.85 primitives: Front / Balanced / Chrys / Tucana / Starlit.
 * Cards pin v0.85.0.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  applyAction,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";
import { isRunTargetAllowed } from "../src/state/runLegality.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.120.0");
});

const frontIr = {
  rezOnlyDuringCorpTurn: true,
  firstRunCannotTargetRemote: true,
  onFirstArchivesRunBeginThisTurn: fx.if(
    { op: "host_server_unprotected_by_ice" },
    fx.netDamage(2),
  ),
};


describe("TAI Front / Balanced / Chrys / Tucana / Starlit wiring", () => {
  it("wires Front Company all three rules; unsupported empty", () => {
    const def = getCardDef("front-company");
    expect(def.unsupported).toEqual([]);
    expect(def.rezOnlyDuringCorpTurn).toBe(true);
    expect(def.firstRunCannotTargetRemote).toBe(true);
    expect(validateEffectTree(def.onFirstArchivesRunBeginThisTurn!)).toBeNull();
  });
  it("wires Balanced Coverage onTurnBegin", () => {
    const def = getCardDef("balanced-coverage");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
  });
  it("wires Chrysopoeian Skimming onPlay", () => {
    const def = getCardDef("chrysopoeian-skimming");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
  it("wires Tucana persistent search-install-rez", () => {
    const def = getCardDef("tucana");
    expect(def.unsupported).toEqual([]);
    expect(def.remoteOnly).toBe(true);
    expect(def.persistent).toBe(true);
    expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
  });
  it("wires Starlit Knight Threat ETR + tags", () => {
    const def = getCardDef("starlit-knight");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(def.subroutines).toHaveLength(2);
  });
});

describe("TAI v0.85 IR wiring (engine)", () => {
  it("validates Front Company full IR tree", () => {
    expect(validateEffectTree(frontIr.onFirstArchivesRunBeginThisTurn!)).toBeNull();
  });

  it("Front Company: rez only on Corp turn", () => {
    const s = createInitialState();
    const fc = instantiateCard("front-company", "fc", "server:archives:root");
    Object.assign(fc, frontIr);
    s.servers.archives.root.push(fc.id);
    s.cards[fc.id] = fc;
    s.timingKey = "run.approachServerPaw";
    s.activeSide = "runner";
    s.run = {
      attackedServerId: "archives",
      phase: "approach_server",
      position: null,
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
      agendasStolenThisRun: 0,
      iceEncounteredCount: 0,
      bypassedIceIds: [],
      passedIceIds: [],
    };
    const r = applyAction(s, { type: "rez_asset", cardId: fc.id });
    expect(r.ok).toBe(false);
  });

  it("Front Company: first run cannot target remote", () => {
    const s = createInitialState();
    beginRunnerTurnFlags(s);
    const fc = instantiateCard("front-company", "fc", "server:archives:root");
    Object.assign(fc, { ...frontIr, rezzed: true, faceup: true });
    s.servers.archives.root.push(fc.id);
    s.cards[fc.id] = fc;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    expect(isRunTargetAllowed(s, "remote-1")).toBe(false);
    expect(isRunTargetAllowed(s, "hq")).toBe(true);
  });

  it("Front Company: first Archives run unprotected → 2 net damage", () => {
    const s = createInitialState();
    beginRunnerTurnFlags(s);
    const fc = instantiateCard("front-company", "fc", "server:archives:root");
    Object.assign(fc, { ...frontIr, rezzed: true, faceup: true });
    s.servers.archives.root.push(fc.id);
    s.cards[fc.id] = fc;
    s.runner.clicks = 4;
    s.timingKey = "runner.takeAction";
    s.activeSide = "runner";
    s.servers.archives.ice = [];
    s.corp.deck = [];
    const r = applyAction(s, { type: "basic_run", serverId: "archives" });
    expect(r.ok).toBe(true);
    expect(r.state!.turn.archivesRunBegunThisTurn).toBe(true);
    expect(
      r.state!.log.some((line) => /net damage|2/.test(line)),
    ).toBe(true);
  });

  it("Balanced Coverage peek primitive validates", () => {
    expect(
      validateEffectTree(
        fx.do({ kind: "look_top_1_rd_choose_type_may_reveal_gain", credits: 2 }),
      ),
    ).toBeNull();
  });

  it("look_top_1_rd_choose_type_may_reveal_gain offers type choice", () => {
    const s = createInitialState();
    const asset = instantiateCard("hedge-fund", "bc", "corp:rd");
    s.corp.deck = [asset.id];
    s.cards[asset.id] = asset;
    const r = evalEffect(
      { state: s, sourceId: asset.id },
      fx.do({ kind: "look_top_1_rd_choose_type_may_reveal_gain", credits: 2 }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice!.options.length).toBe(6);
  });

  it("look_top_n_rd_peek logs and preserves order", () => {
    const s = createInitialState();
    const a = instantiateCard("hedge-fund", "a", "corp:rd");
    const b = instantiateCard("hedge-fund", "b", "corp:rd");
    s.corp.deck = [a.id, b.id];
    s.cards[a.id] = a;
    s.cards[b.id] = b;
    evalEffect(
      { state: s, sourceId: a.id },
      fx.do({ kind: "look_top_n_rd_peek", n: 2 }),
    );
    expect(s.corp.deck).toEqual([a.id, b.id]);
  });

  it("corp_may_reveal_agenda_from_hq opens agenda choice", () => {
    const s = createInitialState();
    const ag = instantiateCard("hedge-fund", "ag", "corp:hq");
    ag.type = "agenda";
    s.corp.hand = [ag.id];
    s.cards[ag.id] = ag;
    evalEffect(
      { state: s, sourceId: ag.id },
      fx.do({ kind: "corp_may_reveal_agenda_from_hq" }),
    );
    expect(s.pendingChoice?.options.some((o) => o.id.startsWith("reveal-hq:"))).toBe(
      true,
    );
  });

  it("Tucana cond + search primitive validate", () => {
    expect(
      validateEffectTree(
        fx.if(
          { op: "last_agenda_scored_or_stolen_from_source_server_root" },
          fx.do({
            kind: "search_rd_install_rez_ice_on_source_server",
            totalDiscount: 3,
          }),
        ),
      ),
    ).toBeNull();
  });

  it("etr_subroutines_per_runner_tags_on_encounter appends ETR subs", () => {
    const s = createInitialState();
    const ice = instantiateCard("ice-wall", "sk", "server:archives:ice");
    ice.subroutines = [
      {
        id: "t1",
        text: "Give 1 tag.",
        effect: fx.do({ kind: "give_tags", amount: 1 }),
      },
    ];
    s.servers.archives.ice.push(ice.id);
    ice.rezzed = true;
    s.cards[ice.id] = ice;
    s.runner.tags = 2;
    s.run = {
      attackedServerId: "archives",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: { iceId: ice.id, broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      agendasStolenThisRun: 0,
      iceEncounteredCount: 1,
      bypassedIceIds: [],
      passedIceIds: [],
    };
    evalEffect(
      { state: s, sourceId: ice.id },
      fx.do({ kind: "etr_subroutines_per_runner_tags_on_encounter" }),
    );
    expect(ice.subroutines!.length).toBe(3);
    expect(s.run!.encounter!.broken.length).toBe(3);
  });
});
