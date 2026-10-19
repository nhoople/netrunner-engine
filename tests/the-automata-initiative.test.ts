
import {
  describe,
  expect,
  it,
  beforeAll,
} from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  canPayCost,
  payCost,
  modifiersFromStartsRun,
  applyAction,
  fx,
  effectiveIceStrength,
  agendaPointsFor,
  queryLegality,
  continuousIceRezCostReduction,
  rootRezCostReduction,
  effectiveBreakerStrength,
  runnerCreditsFor,
  spendRunnerCreditsFor,
  CR,
  legalActions,
} from "../src/index.js";
import { fireHostedCreditsOnAnyIceRez } from "../src/state/powerCounters.js";
import { creditsAvailableForInstall, spendCreditsForInstall } from "../src/state/costs.js";
import type { ServerId } from "../src/state/types.js";
import { beginRunnerTurnFlags } from "../src/state/turn.js";
import { isRunTargetAllowed } from "../src/state/runLegality.js";
import { noteProgramOrHardwareInstalled } from "../src/state/programHardwareInstall.js";
import {
  noteRunnerStoleOrTrashedCorpCard,
  noteAccessTrash,
  noteFirstCorpRootInstallEachTurn,
  noteFirstCorpCardTrashEachTurn,
} from "../src/state/trashHooks.js";
import { noteCorpActionType } from "../src/state/corpActionHooks.js";

describe("the-automata-initiative", () => {
  describe("tai-b1001-umbrella-pichacao-cybersand-urban", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI B-1001 / Umbrella / Pichação / Cybersand / Urban Art", () => {
    it("wires B-1001 removeTags + requireOtherServer", () => {
      const def = getCardDef("b-1001");
      expect(def.unsupported).toEqual([]);
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost).toMatchObject({ removeTags: 1 });
      expect(ab?.requireOtherServer).toBe(true);
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("CostSpec.removeTags is payable only with enough tags", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("b-1001", "b1", "server:remote1:root");
      s.cards["b1"] = card;
      expect(canPayCost(s, "corp", { removeTags: 1 }, card)).toBe(false);
      s.runner.tags = 2;
      expect(canPayCost(s, "corp", { removeTags: 1 }, card)).toBe(true);
      payCost(s, "corp", { removeTags: 1 }, "test", card);
      expect(s.runner.tags).toBe(1);
    });

    it("wires Umbrella trojan-host interface + thenIfBroke", () => {
      const def = getCardDef("umbrella");
      expect(def.unsupported).toEqual([]);
      expect(def.interfaceRequiresTrojanHost).toBe(true);
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost).toMatchObject({ credits: 2 });
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(ab!.effect).toMatchObject({
        op: "do",
        action: {
          kind: "break_encounter_subroutine",
          maxSubs: 3,
          requireSubtype: "code gate",
        },
      });
      expect(
        (ab!.effect as { action: { thenIfBroke?: unknown } }).action.thenIfBroke,
      ).toBeTruthy();
    });

    it("wires Pichação onPassHost + clicks_gained cond", () => {
      const def = getCardDef("pichacao");
      expect(def.unsupported).toEqual([]);
      expect(def.installOnIce).toBe(true);
      expect(validateEffectTree(def.onPassHost!)).toBeNull();
    });

    it("gain_clicks during a run increments clicksGainedThisRun", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.run = {
        attackedServerId: "hq",
        phase: "movement",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        clicksGainedThisRun: 0,
      };
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        { op: "do", action: { kind: "gain_clicks", side: "runner", amount: 1 } },
      );
      expect(r.ok).toBe(true);
      expect(s.run.clicksGainedThisRun).toBe(1);
    });

    it("wires Cybersand hostedCreditsOnAnyIceRez + install spend", () => {
      const def = getCardDef("cybersand-harvester");
      expect(def.unsupported).toEqual([]);
      expect(def.hostedCreditsOnAnyIceRez).toBe(2);
      expect(def.hostedCreditsSpendFor).toEqual(["install"]);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });

    it("ice rez places hosted credits on Cybersand", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const sand = instantiateCard(
        "cybersand-harvester",
        "sand-1",
        "server:remote1:root",
      );
      sand.hostedCreditsOnAnyIceRez = 2;
      sand.rezzed = true;
      s.cards["sand-1"] = sand;
      if (!s.servers.remote1) {
        s.servers.remote1 = { id: "remote1", kind: "remote", ice: [], root: [] };
      }
      s.servers.remote1.root.push("sand-1");
      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice.push("ice-1");
      fireHostedCreditsOnAnyIceRez(s, "ice-1");
      expect(s.cards["sand-1"]!.hostedCredits).toBe(2);
    });

    it("hostedCreditsSpendFor install draws from Cybersand pool", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.credits = 0;
      const sand = instantiateCard(
        "cybersand-harvester",
        "sand-1",
        "server:remote1:root",
      );
      sand.hostedCreditsSpendFor = ["install"];
      sand.hostedCredits = 5;
      sand.rezzed = true;
      s.cards["sand-1"] = sand;
      expect(creditsAvailableForInstall(s, "corp")).toBe(5);
      spendCreditsForInstall(s, "corp", 3);
      expect(s.cards["sand-1"]!.hostedCredits).toBe(2);
      expect(s.corp.credits).toBe(0);
    });

    it("wires Urban Art return-trojan leaf + install spend", () => {
      const def = getCardDef("urban-art-vernissage");
      expect(def.unsupported).toEqual([]);
      expect(def.hostedCreditsSpendFor).toEqual(["install"]);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(def.onTurnBegin).toMatchObject({
        op: "do",
        action: {
          kind: "may_return_non_virus_trojan_to_grip_place_hosted",
          hostedAmount: 2,
        },
      });
    });
  });
  });

  describe("tai-banner-curupira-debbie-vsa-mercury", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI Banner / Curupira / Debbie / VSA / Mercury", () => {
    it("wires Banner forbid ETR ability; unsupported empty", () => {
      const def = getCardDef("banner");
      expect(def.unsupported).toEqual([]);
      const ab = def.paidAbilities?.[0];
      expect(ab?.requireEncounterSubtype).toBe("barrier");
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("forbid_end_the_run_this_encounter suppresses ETR", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: {
          iceId: "ice-1",
          broken: [false],
          forbidEndTheRunThisEncounter: true,
        },
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        { op: "do", action: { kind: "end_the_run" } },
      );
      expect(r.ok).toBe(true);
      expect(s.run.endedTheRun).toBe(false);
    });

    it("wires Curupira onFullyBreak + bypass/break/pump", () => {
      const def = getCardDef("curupira");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onFullyBreak!)).toBeNull();
      expect(def.paidAbilities).toHaveLength(3);
    });

    it("wires Debbie run-event credits + transfer startsRun", () => {
      const def = getCardDef("debbie-downtown-moreira");
      expect(def.unsupported).toEqual([]);
      expect(def.hostedCreditsOnRunEventPlay).toBe(1);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      const ab = def.paidAbilities?.[0];
      expect(ab?.startsRun?.transferHostedCreditsToEventCredits).toBe(true);
    });

    it("transferHostedCreditsToEventCredits moves pool into run mods", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const deb = instantiateCard(
        "debbie-downtown-moreira",
        "deb-1",
        "runner:installed",
      );
      deb.hostedCredits = 3;
      s.cards["deb-1"] = deb;
      s.runner.installed.push("deb-1");
      const mods = modifiersFromStartsRun(
        s,
        { servers: "any", transferHostedCreditsToEventCredits: true },
        "deb-1",
      );
      expect(mods.eventCredits).toBe(3);
      expect(s.cards["deb-1"]!.hostedCredits).toBe(0);
    });

    it("wires VSA onPass decoder tracker; unsupported empty", () => {
      const def = getCardDef("virtual-service-agent");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onPass!)).toBeNull();
      expect(def.subroutines).toHaveLength(1);
    });

    it("wires Mercury breach bonus field; unsupported empty", () => {
      const def = getCardDef("mercury-chrome-libertador");
      expect(def.unsupported).toEqual([]);
      expect(def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess).toBe(1);
    });
  });
  });

  describe("tai-beatriz-laser-mic", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI Beatriz / Laser Pointer / M.I.C.", () => {
    it("wires Beatriz HQ→RD redirect run; unsupported empty", () => {
      const def = getCardDef("beatriz-friere-gonzalez");
      expect(def.unsupported).toEqual([]);
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.clicks).toBe(2);
      expect(ab?.startsRun).toEqual({
        servers: "hq",
        redirectSuccessTo: "rd",
        bonusAccess: 1,
      });
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("wires Laser Pointer triple trash-bypass; unsupported empty", () => {
      const def = getCardDef("laser-pointer");
      expect(def.unsupported).toEqual([]);
      expect(def.paidAbilities).toHaveLength(3);
      for (const ab of def.paidAbilities ?? []) {
        expect(ab.cost?.trashSelf).toBe(true);
        expect(ab.requireEncounterSubtype).toBeTruthy();
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      const subs = (def.paidAbilities ?? []).map((a) => a.requireEncounterSubtype);
      expect(subs.sort()).toEqual(["ap", "destroyer", "observer"]);
    });

    it("wires M.I.C. approach trash + Enigma-like subs; unsupported empty", () => {
      const def = getCardDef("m-i-c");
      expect(def.unsupported).toEqual([]);
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.trashSelf).toBe(true);
      expect(ab?.windows).toContain("approach_paw");
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(def.subroutines).toHaveLength(3);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });
  });
  });

  describe("tai-behold-ydl", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function emptyRun(server: ServerId, candidates: string[]) {
    return {
      attackedServerId: server,
      phase: "breach" as const,
      position: null,
      successful: true,
      accessedCardIds: [] as string[],
      accessCandidates: candidates,
      randomAccessLimit: null as number | null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {} as Record<string, number>,
      encounterStrengthBoosts: {} as Record<string, number>,
      iceStrengthBoosts: {} as Record<string, number>,
      accessingCardId: null as string | null,
    };
  }

  describe("TAI Behold! + Your Digital Life", () => {
    it("wires Behold must-reveal + skip-archives + onAccess; unsupported empty", () => {
      const def = getCardDef("behold");
      expect(def.unsupported).toEqual([]);
      expect(def.mustRevealWhenAccessedFromRd).toBe(true);
      expect(def.skipOnAccessFromArchives).toBe(true);
      expect(def.onAccess).toBeDefined();
      expect(validateEffectTree(def.onAccess!)).toBeNull();
    });

    it("Snare carries skipOnAccessFromArchives", () => {
      const def = getCardDef("snare");
      expect(def.skipOnAccessFromArchives).toBe(true);
    });

    it("Behold onAccess from HQ offers pay-for-tags; Archives skips", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("behold", "bh-1", "corp:hq");
      card.faceup = true;
      s.cards["bh-1"] = card;
      s.corp.hand = ["bh-1"];
      s.corp.credits = 5;
      s.runner.tags = 0;
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = emptyRun("hq", ["bh-1"]);
      s = must(s, { type: "access_card", cardId: "bh-1" });
      expect(s.pendingChoice).toBeTruthy();
      expect(s.pendingChoice!.options.map((o) => o.id)).toContain("pay");
      s = must(s, {
        type: "choose_option",
        optionId: "pay",
      });
      expect(s.corp.credits).toBe(1);
      expect(s.runner.tags).toBe(2);

      // Archives: skipped
      let s2 = createInitialState();
      s2 = structuredClone(s2);
      const c2 = instantiateCard("behold", "bh-2", "corp:archives");
      c2.faceup = true;
      s2.cards["bh-2"] = c2;
      s2.corp.discardPile = ["bh-2"];
      s2.corp.credits = 5;
      s2.runner.tags = 0;
      s2.activeSide = "runner";
      s2.timingKey = "breach.awaitAccess";
      s2.run = emptyRun("archives", ["bh-2"]);
      s2 = must(s2, { type: "access_card", cardId: "bh-2" });
      expect(s2.pendingChoice).toBeFalsy();
      expect(s2.runner.tags).toBe(0);
      expect(s2.corp.credits).toBe(5);
    });

    it("wires Your Digital Life gain_credits_per_hq_card; unsupported empty", () => {
      const def = getCardDef("your-digital-life");
      expect(def.unsupported).toEqual([]);
      expect(def.onPlay).toEqual(fx.gainCreditsPerHqCard(1));
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("gains 1¢ per card in HQ", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.hand = ["a", "b", "c"];
      s.corp.credits = 2;
      const op = instantiateCard("your-digital-life", "ydl-1", "corp:play-area");
      s.cards["ydl-1"] = op;
      const r = evalEffect(
        { state: s, sourceId: "ydl-1" },
        fx.gainCreditsPerHqCard(1),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(5);
    });
  });
  });

  describe("tai-front-balanced-chrys-tucana-starlit", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
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
        randomAccessLimit: null,
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
        fx.do({ kind: "may_corp_reveal_agenda_from_hq" }),
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
        randomAccessLimit: null,
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
  });

  describe("tai-hermes-salvo-monkey-capy-ablative", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI Hermes / Salvo / Monkeywrench / Capybara / Ablative", () => {
    it("wires Hermes muBonus + onAgendaScoredOrStolen; unsupported empty", () => {
      const def = getCardDef("hermes");
      expect(def.unsupported).toEqual([]);
      expect(def.muBonus).toBe(1);
      expect(def.subtypes).toContain("console");
      expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
    });

    it("wires Salvo Testing onAgendaScored may core; unsupported empty", () => {
      const def = getCardDef("salvo-testing");
      expect(def.unsupported).toEqual([]);
      expect(def.agendaPoints).toBe(3);
      expect(def.advancementRequirement).toBe(5);
      expect(validateEffectTree(def.onAgendaScored!)).toBeNull();
    });

    it("wires Monkeywrench trojan strength mods; unsupported empty", () => {
      const def = getCardDef("monkeywrench");
      expect(def.unsupported).toEqual([]);
      expect(def.installOnIce).toBe(true);
      expect(def.hostStrengthModifier).toBe(-2);
      expect(def.otherIceProtectingServerStrengthModifier).toBe(-1);
    });

    it("Monkeywrench lowers host and sibling ice strength", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const host = instantiateCard("enigma", "ice-host", "server:hq:ice");
      host.strength = 5;
      const other = instantiateCard("enigma", "ice-other", "server:hq:ice");
      other.strength = 4;
      s.cards["ice-host"] = host;
      s.cards["ice-other"] = other;
      s.servers.hq.ice = ["ice-host", "ice-other"];
      const mw = instantiateCard("monkeywrench", "mw-1", "runner:installed");
      mw.hostId = "ice-host";
      mw.hostStrengthModifier = -2;
      mw.otherIceProtectingServerStrengthModifier = -1;
      s.cards["mw-1"] = mw;
      s.runner.installed.push("mw-1");
      expect(effectiveIceStrength(s, "ice-host")).toBe(3);
      expect(effectiveIceStrength(s, "ice-other")).toBe(3);
    });

    it("wires Capybara onBypass; unsupported empty", () => {
      const def = getCardDef("capybara");
      expect(def.unsupported).toEqual([]);
      expect(def.onBypass).toBeDefined();
      expect(validateEffectTree(def.onBypass!)).toBeNull();
    });

    it("rfg_self_then_derez_bypassed_ice RFGs source and derezzes ice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.faceup = true;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      const capy = instantiateCard("capybara", "capy-1", "runner:installed");
      s.cards["capy-1"] = capy;
      s.runner.installed.push("capy-1");
      s.run = {
        attackedServerId: "hq",
        position: 0,
        phase: "encounter",
        bypassedIceIds: ["ice-1"],
        iceStrengthBoosts: {},
        strengthBoosts: {},
        encounterStrengthBoosts: {},
      } as typeof s.run;
      const r = evalEffect(
        { state: s, sourceId: "capy-1" },
        fx.do({ kind: "rfg_self_then_derez_bypassed_ice" }),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["capy-1"]!.zone).toBe("removed-from-game");
      expect(s.runner.installed).not.toContain("capy-1");
      expect(s.cards["ice-1"]!.rezzed).toBe(false);
    });

    it("wires Ablative Barrier Threat onRez + ETR; unsupported empty", () => {
      const def = getCardDef("ablative-barrier");
      expect(def.unsupported).toEqual([]);
      expect(def.onRez).toBeDefined();
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(def.subroutines).toHaveLength(1);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });

    it("install_from_hq_or_archives excludeAgenda skips agendas", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ag = instantiateCard("hostile-takeover", "ag-1", "corp:hq");
      const ice = instantiateCard("enigma", "ice-hq", "corp:hq");
      s.cards["ag-1"] = ag;
      s.cards["ice-hq"] = ice;
      s.corp.hand = ["ag-1", "ice-hq"];
      const src = instantiateCard("ablative-barrier", "ab-1", "server:hq:ice");
      s.cards["ab-1"] = src;
      s.servers.hq.ice = ["ab-1"];
      const beforeRemotes = Object.keys(s.servers).filter((id) =>
        id.startsWith("remote-"),
      ).length;
      const r = evalEffect(
        { state: s, sourceId: "ab-1" },
        fx.do({
          kind: "install_from_hq_or_archives",
          excludeAgenda: true,
          excludeSourceServer: true,
        }),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.hand).toContain("ag-1");
      expect(s.corp.hand).not.toContain("ice-hq");
      const afterRemotes = Object.keys(s.servers).filter((id) =>
        id.startsWith("remote-"),
      );
      expect(afterRemotes.length).toBe(beforeRemotes + 1);
      expect(agendaPointsFor(s, "corp")).toBe(0);
    });
  });
  });

  describe("tai-lilypad-hannah-armed-saci-tatu", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI LilyPAD / Hannah / Armed / Saci / Tatu-Bola", () => {
    it("wires LilyPAD muBonus + onFirstProgramInstallEachTurn", () => {
      const def = getCardDef("lilypad");
      expect(def.unsupported).toEqual([]);
      expect(def.muBonus).toBe(2);
      expect(validateEffectTree(def.onFirstProgramInstallEachTurn!)).toBeNull();
    });

    it("first program install fires LilyPAD choice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const pad = instantiateCard("lilypad", "pad-1", "runner:installed");
      pad.onFirstProgramInstallEachTurn = getCardDef(
        "lilypad",
      ).onFirstProgramInstallEachTurn;
      s.cards["pad-1"] = pad;
      s.runner.installed.push("pad-1");
      const prog = instantiateCard("sure-gamble", "p-1", "runner:installed");
      prog.type = "program";
      s.cards["p-1"] = prog;
      s.runner.installed.push("p-1");
      s.turn.programsInstalledThisTurn = 1;
      noteProgramOrHardwareInstalled(s, "p-1");
      expect(s.pendingChoice).toBeTruthy();
      expect(s.pendingChoice?.sourceId).toBe("pad-1");
    });

    it("wires Hannah Wheels startsRun + onRunEnd run_unsuccessful", () => {
      const def = getCardDef("hannah-wheels-pilintra");
      expect(def.unsupported).toEqual([]);
      const runAb = def.paidAbilities?.[0];
      expect(runAb?.flag).toBe("once_per_turn");
      expect(runAb?.startsRun?.servers).toBe("remote");
      expect(validateEffectTree(runAb!.startsRun!.onRunEnd!)).toBeNull();
      expect(validateEffectTree(def.paidAbilities![1]!.effect)).toBeNull();
    });

    it("run_unsuccessful / run_successful conds", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.run = {
        attackedServerId: "hq",
        position: null,
        phase: "approach_server",
        successful: false,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: true,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      const ice = instantiateCard("phoneutria", "ph-1", "server:hq:ice");
      s.cards["ph-1"] = ice;
      expect(
        evalEffect(
          { state: s, sourceId: "ph-1" },
          {
            op: "if",
            cond: { op: "run_unsuccessful" },
            then: fx.do({ kind: "give_tags", amount: 1 }),
          },
        ).ok,
      ).toBe(true);
      expect(s.runner.tags).toBe(1);
    });

    it("wires Armed Asset Protection onPlay", () => {
      const def = getCardDef("armed-asset-protection");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("gain_credits_per_distinct_faceup_archive_type", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ag = instantiateCard("hostile-takeover", "ag-1", "corp:archives");
      ag.faceup = true;
      const ice = instantiateCard("enigma", "ice-a", "corp:archives");
      ice.faceup = true;
      const ice2 = instantiateCard("enigma", "ice-b", "corp:archives");
      ice2.faceup = true;
      s.cards["ag-1"] = ag;
      s.cards["ice-a"] = ice;
      s.cards["ice-b"] = ice2;
      s.corp.discardPile = ["ag-1", "ice-a", "ice-b"];
      s.corp.credits = 0;
      const src = instantiateCard("armed-asset-protection", "aap-1", "corp:hq");
      s.cards["aap-1"] = src;
      const r = evalEffect(
        { state: s, sourceId: "aap-1" },
        fx.do({ kind: "gain_credits_per_distinct_faceup_archive_type" }),
      );
      expect(r.ok).toBe(true);
      // types: agenda + ice = 2, +2 agenda bonus = 4
      expect(s.corp.credits).toBe(4);
    });

    it("wires Saci onHostRezzed/Derezzed", () => {
      const def = getCardDef("saci");
      expect(def.unsupported).toEqual([]);
      expect(def.installOnIce).toBe(true);
      expect(validateEffectTree(def.onHostRezzed!)).toBeNull();
      expect(validateEffectTree(def.onHostDerezzed!)).toBeNull();
    });

    it("wires Tatu-Bola onPass swap + ETR", () => {
      const def = getCardDef("tatu-bola");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onPass!)).toBeNull();
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });

    it("swap_ice_with_hq replaces ice and gains credits", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const tatu = instantiateCard("tatu-bola", "tb-1", "server:hq:ice");
      tatu.rezzed = true;
      const fromHq = instantiateCard("enigma", "hq-ice", "corp:hq");
      s.cards["tb-1"] = tatu;
      s.cards["hq-ice"] = fromHq;
      s.servers.hq.ice = ["tb-1"];
      s.corp.hand = ["hq-ice"];
      s.corp.credits = 0;
      const r = evalEffect(
        { state: s, sourceId: "tb-1" },
        fx.do({ kind: "swap_ice_with_hq", gainCredits: 4 }),
      );
      expect(r.ok).toBe(true);
      expect(s.servers.hq.ice).toEqual(["hq-ice"]);
      expect(s.corp.hand).toContain("tb-1");
      expect(s.cards["hq-ice"]!.rezzed).toBe(false);
      expect(s.corp.credits).toBe(4);
    });
  });
  });

  describe("tai-oppo-epiphany-pivot-federal-wage", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI Oppo / Epiphany / Pivot / Federal / Wage Workers", () => {
    it("wires Oppo Research gate + terminal + Threat tags", () => {
      const def = getCardDef("oppo-research");
      expect(def.unsupported).toEqual([]);
      expect(def.playRequiresRunnerStoleOrTrashedCorpCardLastTurn).toBe(true);
      expect(def.endsActionPhase).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("wires Epiphany steal-or-trash power + look/install", () => {
      const def = getCardDef("epiphany-analytica-nations-undivided");
      expect(def.unsupported).toEqual([]);
      expect(
        validateEffectTree(def.onFirstRunnerStoleOrTrashedCorpCardThisTurn!),
      ).toBeNull();
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost).toMatchObject({ clicks: 1, powerCounters: 1 });
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("wires Pivot search + Threat play/install", () => {
      const def = getCardDef("pivot");
      expect(def.unsupported).toEqual([]);
      expect(def.playAdditionalClick).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("wires Federal Fundraising arrange + unprotected draw", () => {
      const def = getCardDef("federal-fundraising");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("wires Wage Workers action tracking", () => {
      const def = getCardDef("wage-workers");
      expect(def.unsupported).toEqual([]);
      expect(def.wageWorkersTrackActions).toBe(true);
    });
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action?: Parameters<typeof applyAction>[1],
  ) {
    if (action) {
      const r = applyAction(state, action);
      if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
      return r.state;
    }
    return state;
  }

  function mustEval(r: { ok: boolean; error?: string }) {
    if (!r.ok) throw new Error(JSON.stringify(r));
  }

  describe("TAI v0.84 steal-or-trash tracker + play gate", () => {
    it("accepts new IR kinds in validateEffectTree", () => {
      expect(
        validateEffectTree(fx.do({ kind: "search_rd_operation_or_agenda_to_hq" })),
      ).toBeNull();
      expect(validateEffectTree(fx.lookTopNRdMayInstallOne(3))).toBeNull();
      expect(validateEffectTree(fx.lookTopNRdArrange(3))).toBeNull();
      expect(validateEffectTree(fx.mayPlayOrInstallFromHq())).toBeNull();
      expect(
        validateEffectTree(
          fx.if({ op: "host_server_unprotected_by_ice" }, fx.draw("corp", 1)),
        ),
      ).toBeNull();
    });

    it("tracks this turn + rolls last turn on Runner turn begin", () => {
      const s = createInitialState();
      noteRunnerStoleOrTrashedCorpCard(s);
      expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(true);
      expect(s.turn.runnerStoleOrTrashedCorpCardLastTurn).toBe(false);
      beginRunnerTurnFlags(s);
      expect(s.turn.runnerStoleOrTrashedCorpCardLastTurn).toBe(true);
      expect(s.turn.runnerStoleOrTrashedCorpCardThisTurn).toBe(false);
    });

    it("gates play_operation on playRequiresRunnerStoleOrTrashedCorpCardLastTurn", () => {
      const s = createInitialState();
      const op = instantiateCard("hedge-fund", "oppo-test", "corp:hq");
      op.playCost = 2;
      op.playRequiresRunnerStoleOrTrashedCorpCardLastTurn = true;
      s.cards["oppo-test"] = op;
      s.corp.hand = ["oppo-test"];
      s.corp.credits = 10;
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "play_operation" && e.action.cardId === "oppo-test",
        ),
      ).toBe(false);
      s.turn.runnerStoleOrTrashedCorpCardLastTurn = true;
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "play_operation" && e.action.cardId === "oppo-test",
        ),
      ).toBe(true);
    });

    it("fires identity onFirstRunnerStoleOrTrashedCorpCardThisTurn once per turn", () => {
      const s = createInitialState();
      const id = s.cards[s.runner.identityId];
      id.onFirstRunnerStoleOrTrashedCorpCardThisTurn = fx.addPowerCounter(1);
      id.powerCounters = 0;
      noteRunnerStoleOrTrashedCorpCard(s);
      expect(id.powerCounters).toBe(1);
      noteRunnerStoleOrTrashedCorpCard(s);
      expect(id.powerCounters).toBe(1);
    });
  });

  describe("TAI v0.84 Pivot / Federal / Wage primitives", () => {
    it("search_rd_operation_or_agenda_to_hq finds agenda and shuffles R&D", () => {
      const s = createInitialState();
      const agenda = instantiateCard("hedge-fund", "ag-1", "corp:rd");
      agenda.type = "agenda";
      agenda.agendaPoints = 1;
      agenda.advancementRequirement = 2;
      const ice = instantiateCard("hedge-fund", "ice-1", "corp:rd");
      ice.type = "ice";
      ice.rezCost = 1;
      s.cards["ag-1"] = agenda;
      s.cards["ice-1"] = ice;
      s.corp.deck = ["ag-1", "ice-1"];
      mustEval(
        evalEffect({ state: s, sourceId: "ag-1" }, fx.do({ kind: "search_rd_operation_or_agenda_to_hq" })),
      );
      expect(s.corp.hand).toEqual(["ag-1"]);
      expect(s.corp.deck).toEqual(["ice-1"]);
    });

    it("host_server_unprotected_by_ice cond and Federal arrange", () => {
      let s = createInitialState();
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [],
      };
      const asset = instantiateCard("hedge-fund", "fed-1", "server:remote-1:root");
      asset.rezzed = true;
      s.cards["fed-1"] = asset;
      s.servers["remote-1"].root.push("fed-1");
      const c1 = instantiateCard("hedge-fund", "rd-a", "corp:rd");
      c1.type = "agenda";
      c1.agendaPoints = 1;
      c1.advancementRequirement = 2;
      const c2 = instantiateCard("hedge-fund", "rd-b", "corp:rd");
      c2.type = "operation";
      s.cards["rd-a"] = c1;
      s.cards["rd-b"] = c2;
      s.corp.deck = ["rd-a", "rd-b"];

      mustEval(
        evalEffect(
          { state: s, sourceId: "fed-1" },
          fx.if({ op: "host_server_unprotected_by_ice" }, fx.draw("corp", 1)),
        ),
      );
      expect(s.corp.hand.length).toBe(1);

      s.corp.hand = [];
      s.corp.deck = ["rd-a", "rd-b"];
      mustEval(
        evalEffect(
          { state: s, sourceId: "fed-1" },
          fx.do({ kind: "look_top_n_rd_arrange", n: 2 }),
        ),
      );
      expect(s.pendingChoice?.options.length).toBe(2);
      s = must(s, { type: "choose_option", optionId: "rd-arrange:rd-b" });
      s = must(s, { type: "choose_option", optionId: "rd-arrange:rd-a" });
      expect(s.corp.deck.slice(0, 2).map((id) => s.cards[id]?.title)).toEqual([
        c2.title,
        c1.title,
      ]);
      expect(s.cards["rd-a"]).toBeUndefined();
      expect(s.cards["rd-b"]).toBeUndefined();
    });

    it("wageWorkersTrackActions gains click on third action of a type", () => {
      const s = createInitialState();
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [],
      };
      const wage = instantiateCard("hedge-fund", "wage-1", "server:remote-1:root");
      wage.wageWorkersTrackActions = true;
      wage.rezzed = true;
      s.cards["wage-1"] = wage;
      s.servers["remote-1"].root.push("wage-1");
      s.activeSide = "corp";
      s.corp.clicks = 3;
      noteCorpActionType(s, "basic_gain");
      noteCorpActionType(s, "basic_gain");
      expect(s.corp.clicks).toBe(3);
      noteCorpActionType(s, "basic_gain");
      expect(s.corp.clicks).toBe(4);
    });
  });
  });

  describe("tai-oracle-mural-greasing-bahia-vovo", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  function must<T extends { ok: boolean }>(
    r: T,
  ): asserts r is T & { ok: true } {
    if (!r.ok) throw new Error(JSON.stringify(r));
  }

  function ensureRemote(
    s: ReturnType<typeof createInitialState>,
    id = "remote-1",
  ): void {
    if (!s.servers[id as keyof typeof s.servers]) {
      s.servers[id as keyof typeof s.servers] = {
        id: id as "remote-1",
        kind: "remote",
        ice: [],
        root: [],
      };
    }
  }

  describe("TAI Oracle / Living Mural / Greasing / Bahia / Vovô", () => {
    it("wires Oracle Thinktank onSteal + score-area shuffle; unsupported empty", () => {
      const def = getCardDef("oracle-thinktank");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onSteal!)).toBeNull();
      const ab = def.paidAbilities?.[0];
      expect(ab?.usableFromRunnerScoreArea).toBe(true);
      expect(ab?.cost).toMatchObject({ clicks: 1, removeTags: 1 });
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("wires Living Mural turn strength + host-server break", () => {
      const def = getCardDef("living-mural");
      expect(def.unsupported).toEqual([]);
      expect(def.installOnIce).toBe(true);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      const br = def.paidAbilities?.find((a) => a.id === "mural-break");
      expect(br?.requireProtectingHostServer).toBe(true);
      expect(validateEffectTree(br!.effect)).toBeNull();
    });

    it("wires Greasing the Palm HQ install-paying-costs", () => {
      const def = getCardDef("greasing-the-palm");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("wires Bahia Bands choose_exactly_n + trash hosted spend", () => {
      const def = getCardDef("bahia-bands");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    });

    it("wires Vovô Ozetti rez discounts + onCorpTurnEnd", () => {
      const def = getCardDef("vovo-ozetti");
      expect(def.unsupported).toEqual([]);
      expect(def.iceRezCostReductionProtectingThisServer).toBe(2);
      expect(def.rootRezCostReductionThisServerIfThreat).toEqual({
        level: 4,
        amount: 2,
      });
      expect(validateEffectTree(def.onCorpTurnEnd!)).toBeNull();
    });

    it("accepts new primitive kinds in validateEffectTree", () => {
      expect(
        validateEffectTree(fx.do({ kind: "shuffle_source_into_rd" })),
      ).toBeNull();
      expect(
        validateEffectTree(fx.gainStrengthThisTurn(2)),
      ).toBeNull();
      expect(
        validateEffectTree(
          fx.chooseExactlyN(2, [
            { id: "a", label: "A", effect: fx.gainCredits("runner", 1) },
            { id: "b", label: "B", effect: fx.gainCredits("runner", 1) },
          ]),
        ),
      ).toBeNull();
      expect(
        validateEffectTree(fx.enableHostedCreditsSpendFor(["trash"])),
      ).toBeNull();
      expect(
        validateEffectTree(fx.mayInstallFromHqPayingCosts(true)),
      ).toBeNull();
      expect(
        validateEffectTree(fx.mayMoveSourceUpgradeToAnotherServerRoot()),
      ).toBeNull();
    });

    it("shuffle_source_into_rd moves Runner-scored source into Corp R&D", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ag = instantiateCard("hostile-takeover", "ag-score", "runner:score");
      s.cards["ag-score"] = ag;
      s.runner.scoreArea.push("ag-score");
      const r = evalEffect(
        { state: s, sourceId: "ag-score" },
        fx.shuffleSourceIntoRd(),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.scoreArea).not.toContain("ag-score");
      expect(s.corp.deck).toContain("ag-score");
      expect(s.cards["ag-score"]!.zone).toBe("corp:rd");
    });

    it("gain_strength_this_turn boosts effective breaker strength", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const br = instantiateCard("corroder", "br-1", "runner:installed");
      br.breaker = { breaksSubtype: "barrier", strength: 2 };
      s.cards["br-1"] = br;
      s.runner.installed.push("br-1");
      const before = effectiveBreakerStrength(s, "br-1");
      evalEffect(
        { state: s, sourceId: "br-1" },
        fx.gainStrengthThisTurn(3),
      );
      expect(effectiveBreakerStrength(s, "br-1")).toBe(before + 3);
    });

    it("choose_exactly_n opens exclusive multi-choice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.chooseExactlyN(2, [
          { id: "one", label: "One", effect: fx.gainCredits("runner", 1) },
          { id: "two", label: "Two", effect: fx.gainCredits("runner", 2) },
          { id: "three", label: "Three", effect: fx.gainCredits("runner", 3) },
        ]),
      );
      expect(s.pendingExclusiveChoices?.remaining).toBe(2);
      expect(s.pendingChoice).not.toBeNull();
    });

    it("hosted credits spend for trash includes heap run source", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("sure-gamble", "ev-1", "runner:heap");
      ev.hostedCredits = 4;
      ev.hostedCreditsSpendFor = ["trash"];
      s.cards["ev-1"] = ev;
      s.runner.discardPile.push("ev-1");
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        runSourceId: "ev-1",
      };
      expect(runnerCreditsFor(s, "trash")).toBeGreaterThanOrEqual(4);
      spendRunnerCreditsFor(s, 3, "trash");
      expect(s.cards["ev-1"]!.hostedCredits).toBe(1);
    });

    it("continuousIceRezCostReduction sums rezzed server upgrades", () => {
      let s = createInitialState();
      s = structuredClone(s);
      ensureRemote(s);
      const ice = instantiateCard("ice-wall", "iw-1", "server:remote-1:ice");
      ice.rezCost = 3;
      s.cards["iw-1"] = ice;
      s.servers["remote-1"]!.ice.push("iw-1");
      const up = instantiateCard("corporate-troubleshooter", "up-1", "server:remote-1:root");
      up.type = "upgrade";
      up.rezzed = true;
      up.iceRezCostReductionProtectingThisServer = 2;
      s.cards["up-1"] = up;
      s.servers["remote-1"]!.root.push("up-1");
      expect(continuousIceRezCostReduction(s, "iw-1")).toBe(2);
    });

    it("rootRezCostReduction applies at Threat", () => {
      let s = createInitialState();
      s = structuredClone(s);
      ensureRemote(s);
      const scored = instantiateCard("hostile-takeover", "sc-1", "corp:score");
      scored.agendaPoints = 3;
      s.cards["sc-1"] = scored;
      s.corp.scoreArea.push("sc-1");
      const asset = instantiateCard("ice-wall", "as-1", "server:remote-1:root");
      asset.type = "asset";
      asset.rezCost = 5;
      s.cards["as-1"] = asset;
      s.servers["remote-1"]!.root.push("as-1");
      const up = instantiateCard("corporate-troubleshooter", "up-2", "server:remote-1:root");
      up.type = "upgrade";
      up.rezzed = true;
      up.rootRezCostReductionThisServerIfThreat = { level: 3, amount: 2 };
      s.cards["up-2"] = up;
      s.servers["remote-1"]!.root.push("up-2");
      expect(rootRezCostReduction(s, "as-1")).toBe(2);
    });

    it("may_move_source_upgrade_to_another_server_root moves upgrade", () => {
      let s = createInitialState();
      s = structuredClone(s);
      ensureRemote(s);
      const up = instantiateCard("corporate-troubleshooter", "up-m", "server:remote-1:root");
      up.type = "upgrade";
      s.cards["up-m"] = up;
      s.servers["remote-1"]!.root.push("up-m");
      evalEffect(
        { state: s, sourceId: "up-m" },
        fx.mayMoveSourceUpgradeToAnotherServerRoot(),
      );
      const opt = s.pendingChoice!.options.find((o) => o.id === "move-root:hq");
      expect(opt).toBeDefined();
      const moved = applyAction(s, { type: "choose_option", optionId: opt!.id });
      must(moved);
      s = moved.state;
      expect(s.servers.hq.root).toContain("up-m");
      expect(s.servers["remote-1"]!.root).not.toContain("up-m");
    });

    it("usableFromRunnerScoreArea lists a Corp click ability at the take-action step", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      const ag = instantiateCard("hostile-takeover", "ag-rs", "runner:score");
      ag.paidAbilities = [
        {
          id: "oracle",
          label: "Oracle",
          clickCost: 1,
          creditCost: 0,
          cost: { clicks: 1 },
          windows: ["corp_action_paw"],
          usableFromRunnerScoreArea: true,
          effect: fx.shuffleSourceIntoRd(),
        },
      ];
      s.cards["ag-rs"] = ag;
      s.runner.scoreArea.push("ag-rs");
      s.corp.clicks = 2;
      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.cardId === "ag-rs" &&
            e.action.abilityId === "oracle",
        ),
      ).toBe(true);
    });
  });
  });

  describe("tai-slash-audrey-price-lago-angelique", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI Slash / Audrey / Price / Lago / Angelique", () => {
    it("wires Slash and Burn expendable place_advancements; unsupported empty", () => {
      const def = getCardDef("slash-and-burn-agriculture");
      expect(def.unsupported).toEqual([]);
      const ab = def.paidAbilities?.[0];
      expect(ab?.usableFromHq).toBe(true);
      expect(ab?.cost).toMatchObject({
        clicks: 1,
        credits: 1,
        trashSelf: true,
      });
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("wires Audrey v2 onAccessTrash + virus break / grip pump", () => {
      const def = getCardDef("audrey-v2");
      expect(def.unsupported).toEqual([]);
      expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(validateEffectTree(def.onAccessTrash!)).toBeNull();
      expect(def.paidAbilities).toHaveLength(2);
      expect(def.paidAbilities![0]!.cost).toMatchObject({ virusCounters: 1 });
      expect(def.paidAbilities![1]!.cost).toMatchObject({ trashFromGrip: 1 });
    });

    it("access trash places virus on Audrey every time", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const audrey = instantiateCard("audrey-v2", "aud-1", "runner:installed");
      audrey.onAccessTrash = getCardDef("audrey-v2").onAccessTrash;
      s.cards["aud-1"] = audrey;
      s.runner.installed.push("aud-1");
      noteAccessTrash(s);
      expect(s.cards["aud-1"]!.virusCounters).toBe(1);
      noteAccessTrash(s);
      expect(s.cards["aud-1"]!.virusCounters).toBe(2);
    });

    it("wires The Price mill+install leaf; unsupported empty", () => {
      const def = getCardDef("the-price");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(def.onPlay).toMatchObject({
        op: "do",
        action: {
          kind: "trash_top_n_may_install_discount",
          count: 4,
          discount: 3,
        },
      });
    });

    it("The Price mills top 4 and offers discounted heap install", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.runner.credits = 10;
      // Put four installable resources on top of the stack.
      const titles = ["easy-1", "easy-2", "easy-3", "easy-4"];
      for (const id of titles) {
        const card = instantiateCard("scrubber", id, "runner:stack");
        s.cards[id] = card;
        s.runner.deck.unshift(id);
      }
      const price = instantiateCard("the-price", "price-1", "runner:grip");
      s.cards["price-1"] = price;
      const r = evalEffect(
        { state: s, sourceId: "price-1" },
        getCardDef("the-price").onPlay!,
      );
      expect(r.ok).toBe(true);
      expect(s.runner.discardPile.filter((id) => titles.includes(id))).toHaveLength(
        4,
      );
      expect(s.pendingChoice).toBeTruthy();
      expect(s.pendingChoice!.options.length).toBeGreaterThan(1);
    });

    it("wires Lago onFirstCorpRootInstallEachTurn; unsupported empty", () => {
      const def = getCardDef("lago-paranoa-shelter");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onFirstCorpRootInstallEachTurn!)).toBeNull();
    });

    it("first Corp root install fires Lago once", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const lago = instantiateCard("lago-paranoa-shelter", "lago-1", "runner:installed");
      lago.onFirstCorpRootInstallEachTurn = getCardDef(
        "lago-paranoa-shelter",
      ).onFirstCorpRootInstallEachTurn;
      s.cards["lago-1"] = lago;
      s.runner.installed.push("lago-1");
      noteFirstCorpRootInstallEachTurn(s);
      expect(s.pendingChoice).toBeTruthy();
      expect(s.turn.firstCorpRootInstallUsedThisTurn).toBe(true);
      const choice = s.pendingChoice;
      s.pendingChoice = null;
      noteFirstCorpRootInstallEachTurn(s);
      expect(s.pendingChoice).toBeNull();
      expect(choice!.options.some((o) => o.id === "mill-draw")).toBe(true);
    });

    it("wires Angelique Threat expendable + rezzed onAccess", () => {
      const def = getCardDef("angelique-garza-correa");
      expect(def.unsupported).toEqual([]);
      expect(def.onAccessRequiresRezzed).toBe(true);
      expect(validateEffectTree(def.onAccess!)).toBeNull();
      const ab = def.paidAbilities?.[0];
      expect(ab?.flag).toEqual({ threat: 3 });
      expect(ab?.usableFromHq).toBe(true);
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("agendaPointsFor supports Threat gate math", () => {
      let s = createInitialState();
      s = structuredClone(s);
      expect(agendaPointsFor(s, "corp")).toBe(0);
      expect(agendaPointsFor(s, "runner")).toBe(0);
    });
  });
  });

  describe("tai-solidarity-eru-valentao-sdobrado", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI Solidarity / Eru / Valentão / S-Dobrado", () => {
    it("wires Solidarity Badge trash + onTurnBegin; unsupported empty", () => {
      const def = getCardDef("solidarity-badge");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onFirstCorpCardTrashEachTurn!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("first Corp trash places power on Solidarity Badge", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const badge = instantiateCard("solidarity-badge", "sb-1", "runner:installed");
      badge.onFirstCorpCardTrashEachTurn = getCardDef(
        "solidarity-badge",
      ).onFirstCorpCardTrashEachTurn;
      s.cards["sb-1"] = badge;
      s.runner.installed.push("sb-1");
      noteFirstCorpCardTrashEachTurn(s);
      expect(s.cards["sb-1"]!.powerCounters).toBe(1);
      noteFirstCorpCardTrashEachTurn(s);
      expect(s.cards["sb-1"]!.powerCounters).toBe(1);
    });

    it("wires Eru tags cost + Archives→R&D redirect", () => {
      const def = getCardDef("eru-ayase-pessoa");
      expect(def.unsupported).toEqual([]);
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost).toMatchObject({ clicks: 1, tags: 1 });
      expect(ab?.startsRun?.servers).toBe("archives");
      expect(ab?.startsRun?.redirectSuccessTo).toBe("rd");
      expect(validateEffectTree(ab!.startsRun!.onSuccessfulRun!)).toBeNull();
    });

    it("CostSpec.tags is always payable and adds tags", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("eru-ayase-pessoa", "eru-1", "runner:installed");
      s.cards["eru-1"] = card;
      s.runner.installed.push("eru-1");
      expect(canPayCost(s, "runner", { tags: 1 }, card)).toBe(true);
      payCost(s, "runner", { tags: 1 }, "test", card);
      expect(s.runner.tags).toBe(1);
    });

    it("wires Valentão rezAdditionalCost + credits_gt ETR", () => {
      const def = getCardDef("valentao");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.rezAdditionalCost!)).toBeNull();
      expect(def.subroutines).toHaveLength(3);
      expect(validateEffectTree(def.subroutines![2]!.effect)).toBeNull();
    });

    it("credits_gt_other_side cond", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.credits = 5;
      s.runner.credits = 3;
      const ice = instantiateCard("valentao", "v-1", "server:hq:ice");
      s.cards["v-1"] = ice;
      const before = s.corp.credits;
      const r = evalEffect(
        { state: s, sourceId: "v-1" },
        {
          op: "if",
          cond: { op: "credits_gt_other_side", side: "corp" },
          then: fx.do({ kind: "gain_credits", side: "corp", amount: 1 }),
        },
      );
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(before + 1);
    });

    it("wires S-Dobrado bypassFirst + Threat second click-bypass", () => {
      const def = getCardDef("s-dobrado");
      expect(def.unsupported).toEqual([]);
      expect(def.runEvent?.bypassFirstEncounter).toBe(true);
      expect(def.runEvent?.bypassSecondEncounterForClickIfThreat).toBe(4);
    });

    it("Threat gates bypassSecondEncounterForClick at run start", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const src = instantiateCard("s-dobrado", "sd-1", "runner:grip");
      s.cards["sd-1"] = src;
      const modsLow = modifiersFromStartsRun(
        s,
        {
          servers: "central",
          bypassFirstEncounter: true,
          bypassSecondEncounterForClickIfThreat: 4,
        },
        "sd-1",
      );
      expect(modsLow.bypassSecondEncounterForClick).toBeFalsy();
      const ag = instantiateCard("hostile-takeover", "ag-1", "corp:score");
      ag.agendaPoints = 4;
      s.cards["ag-1"] = ag;
      s.corp.scoreArea = ["ag-1"];
      expect(agendaPointsFor(s, "corp")).toBe(4);
      const modsHi = modifiersFromStartsRun(
        s,
        {
          servers: "central",
          bypassFirstEncounter: true,
          bypassSecondEncounterForClickIfThreat: 4,
        },
        "sd-1",
      );
      expect(modsHi.bypassSecondEncounterForClick).toBe(true);
    });
  });
  });

  describe("tai-threat-mindscape", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI threat + Mindscaping / Shibboleth / Jaguarundi", () => {
    it("wires Shibboleth threat strength −2 + decoder; unsupported empty", () => {
      const def = getCardDef("shibboleth");
      expect(def.unsupported).toEqual([]);
      expect(def.threatStrengthBonus).toEqual({ level: 4, amount: -2 });
      expect(def.breaker?.breaksSubtype).toBe("code gate");
    });

    it("wires Mindscaping choose tree; unsupported empty", () => {
      const def = getCardDef("mindscaping");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("wires Jaguarundi threat onEncounter + subs; unsupported empty", () => {
      const def = getCardDef("jaguarundi");
      expect(def.unsupported).toEqual([]);
      expect(def.onEncounter).toBeDefined();
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("net_damage_up_to_tags caps at max", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.runner.tags = 5;
      for (let i = 0; i < 5; i++) {
        const id = `g-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const src = instantiateCard("mindscaping", "ms-1", "corp:play-area");
      s.cards["ms-1"] = src;
      const before = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "ms-1" },
        fx.netDamageUpToTags(3),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand.length).toBe(before - 3);
    });

    it("hq_to_top_rd moves one HQ card to R&D top", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (const id of ["h1", "h2"]) {
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
        s.corp.hand.push(id);
      }
      const src = instantiateCard("mindscaping", "ms-2", "corp:play-area");
      s.cards["ms-2"] = src;
      const r = evalEffect(
        { state: s, sourceId: "ms-2" },
        fx.hqToTopRd("first"),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.hand).toHaveLength(1);
      expect(s.corp.deck.at(-1)).toBe("h1");
    });

    it("threat cond uses max agenda points across players", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ag = instantiateCard("hostile-takeover", "ag-1", "corp:score");
      ag.agendaPoints = 4;
      s.cards["ag-1"] = ag;
      s.corp.scoreArea = ["ag-1"];
      expect(agendaPointsFor(s, "corp")).toBe(4);
      const ice = instantiateCard("jaguarundi", "jag-1", "server:hq:ice");
      ice.onEncounter = getCardDef("jaguarundi").onEncounter;
      s.cards["jag-1"] = ice;
      const r = evalEffect(
        { state: s, sourceId: "jag-1" },
        ice.onEncounter!,
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
    });
  });
  });

  describe("tai-tree-phone-slap-attini", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("TAI Tree Line / Phoneutria / Slap Vandal / Attini", () => {
    it("wires Tree Line canAdvance + expendable + gain/ETR; unsupported empty", () => {
      const def = getCardDef("tree-line");
      expect(def.unsupported).toEqual([]);
      expect(def.canAdvance).toBe(true);
      expect(def.strengthPerAdvancement).toBe(1);
      const ab = def.paidAbilities?.[0];
      expect(ab?.usableFromHq).toBe(true);
      expect(ab?.cost).toMatchObject({
        clicks: 1,
        credits: 1,
        trashSelf: true,
      });
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(def.subroutines).toHaveLength(1);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });

    it("place_advancements anyInstalledIce targets ice without canAdvance", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      ice.canAdvance = false;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      const src = instantiateCard("tree-line", "tl-1", "corp:hq");
      s.cards["tl-1"] = src;
      s.corp.hand.push("tl-1");
      const r = evalEffect(
        { state: s, sourceId: "tl-1" },
        fx.placeAdvancements(3, false, { anyInstalledIce: true }),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["ice-1"]!.advancementCounters).toBe(3);
    });

    it("wires Phoneutria onPass grip≥4 + 2×net; unsupported empty", () => {
      const def = getCardDef("phoneutria");
      expect(def.unsupported).toEqual([]);
      expect(def.onPass).toBeDefined();
      expect(validateEffectTree(def.onPass!)).toBeNull();
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("grip_count_gte cond", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (let i = 0; i < 4; i++) {
        const id = `g-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const ice = instantiateCard("phoneutria", "ph-1", "server:hq:ice");
      ice.onPass = getCardDef("phoneutria").onPass;
      s.cards["ph-1"] = ice;
      const before = s.runner.tags;
      const r = evalEffect({ state: s, sourceId: "ph-1" }, ice.onPass!);
      expect(r.ok).toBe(true);
      expect(s.runner.tags).toBe(before + 1);
    });

    it("wires Slap Vandal installOnIce + oncePerEncounter break; unsupported empty", () => {
      const def = getCardDef("slap-vandal");
      expect(def.unsupported).toEqual([]);
      expect(def.installOnIce).toBe(true);
      const ab = def.paidAbilities?.[0];
      expect(ab?.oncePerEncounter).toBe(true);
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("wires Attini threatCannotSpendCreditsDuringSubs + 3× pay-or-net", () => {
      const def = getCardDef("attini");
      expect(def.unsupported).toEqual([]);
      expect(def.threatCannotSpendCreditsDuringSubs).toBe(3);
      expect(def.subroutines).toHaveLength(3);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("Attini threat path forces net (no pay) when agenda points ≥ 3", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ag = instantiateCard("hostile-takeover", "ag-1", "corp:score");
      ag.agendaPoints = 3;
      s.cards["ag-1"] = ag;
      s.corp.scoreArea = ["ag-1"];
      expect(agendaPointsFor(s, "corp")).toBe(3);
      for (let i = 0; i < 3; i++) {
        const id = `g-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      s.runner.credits = 10;
      const ice = instantiateCard("attini", "at-1", "server:hq:ice");
      ice.subroutines = getCardDef("attini").subroutines;
      s.cards["at-1"] = ice;
      const beforeHand = s.runner.hand.length;
      const beforeCred = s.runner.credits;
      const r = evalEffect(
        { state: s, sourceId: "at-1" },
        ice.subroutines![0]!.effect,
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand.length).toBe(beforeHand - 1);
      expect(s.runner.credits).toBe(beforeCred);
      expect(s.pendingChoice).toBeFalsy();
    });
  });
  });

  describe("tai-v086-final-six", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state!;
  }


  describe("TAI final six card wiring", () => {
    for (const id of [
      "daniela-jorge-inacio",
      "adrian-seis",
      "a-teia-ip-recovery",
      "arissana-rocha-nahu-street-artist",
      "stegodon-mk-iv",
      "airbladex-jsrf-ed",
    ] as const) {
      it(`wires ${id}; unsupported empty`, () => {
        const def = getCardDef(id);
        expect(def.unsupported).toEqual([]);
      });
    }
  });

  describe("TAI v0.86 IR validation", () => {
    it("validates Daniela trash/steal additional cost + add_random_grip_to_stack_bottom", () => {
      const cost = fx.do({
        kind: "add_random_grip_to_stack_bottom",
        count: 2,
      });
      expect(validateEffectTree(cost)).toBeNull();
    });

    it("validates Adrian psi + restrict_run_access", () => {
      const tree = fx.do({
        kind: "play_psi_game",
        maxBid: 2,
        ifBidsDiffer: fx.do({
          kind: "restrict_run_access",
          mode: "only_source",
          cardIdsFromSource: true,
        }),
        ifBidsMatch: fx.do({
          kind: "restrict_run_access",
          mode: "forbid_source",
          cardIdsFromSource: true,
        }),
      });
      expect(validateEffectTree(tree)).toBeNull();
    });

    it("validates A Teia remote cap fields + HQ chain install", () => {
      expect(
        validateEffectTree(
          fx.do({
            kind: "may_install_from_hq_on_other_remote_ignore_costs",
            cannotScoreInstalledCardThisTurn: true,
          }),
        ),
      ).toBeNull();
    });

    it("validates Arissana install_program_from_grip_paying_cost", () => {
      expect(
        validateEffectTree(
          fx.do({
            kind: "install_program_from_grip_paying_cost",
            trackOnRunEndTrashUnlessSubtype: "trojan",
          }),
        ),
      ).toBeNull();
    });

    it("validates Stegodon scored penalty + may_derez_installed filters", () => {
      expect(
        validateEffectTree(
          fx.do({
            kind: "may_derez_installed",
            onlyIce: true,
            excludeProtectingAttackedServer: true,
            then: fx.gainCredits("corp", 1),
          }),
        ),
      ).toBeNull();
    });

    it("validates AirbladeX interrupt leaves", () => {
      expect(
        validateEffectTree(fx.do({ kind: "prevent_pending_damage", amount: 1 })),
      ).toBeNull();
      expect(
        validateEffectTree(fx.do({ kind: "prevent_current_ice_on_encounter" })),
      ).toBeNull();
    });
  });

  describe("Daniela add_random_grip_to_stack_bottom (v0 first N)", () => {
    it("moves first two grip cards to bottom of stack", () => {
      const s = createInitialState();
      s.runner.hand = ["h1", "h2", "h3"];
      s.runner.deck = ["d-top"];
      for (const id of ["h1", "h2", "h3"]) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.cards[id].title = id;
      }
      s.cards["d-top"] = instantiateCard("sure-gamble", "d-top", "runner:stack");
      const r = evalEffect(
        { state: s, sourceId: "x" },
        fx.do({ kind: "add_random_grip_to_stack_bottom", count: 2 }),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand).toEqual(["h3"]);
      expect(s.runner.deck).toEqual(["d-top", "h1", "h2"]);
    });
  });

  describe("Adrian play_psi_game + restrict_run_access", () => {
    it("applies only_source when bids differ", () => {
      const s = createInitialState();
      s.run = {
        attackedServerId: "remote-1",
        phase: "breach",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: ["ag-1", "up-1"],
        randomAccessLimit: 2,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ag-1", "up-1"],
      };
      const adrian = instantiateCard("adrian-seis", "up-1", "server:remote-1:root");
      s.cards["up-1"] = adrian;
      s.cards["ag-1"] = instantiateCard("hedge-fund", "ag-1", "server:remote-1:root");
      s.cards["ag-1"].type = "agenda";
      const r = evalEffect(
        { state: s, sourceId: "up-1" },
        fx.do({
          kind: "restrict_run_access",
          mode: "only_source",
          cardIdsFromSource: true,
        }),
      );
      expect(r.ok).toBe(true);
      expect(s.run!.accessCandidates).toEqual(["up-1"]);
    });

    it("resolves psi sequential bids and spends credits", () => {
      let s = createInitialState();
      s.runner.credits = 5;
      s.corp.credits = 5;
      s.activeSide = "runner";
      const r = evalEffect(
        { state: s, sourceId: "psi-src" },
        fx.do({
          kind: "play_psi_game",
          maxBid: 2,
          ifBidsDiffer: fx.do({
            kind: "gain_credits",
            side: "runner",
            amount: 1,
          }),
          ifBidsMatch: fx.do({
            kind: "gain_credits",
            side: "corp",
            amount: 1,
          }),
        }),
      );
      expect(r.ok).toBe(true);
      expect(s.psi).toBeTruthy();
      s = must(s, { type: "psi_runner_bid", amount: 2 });
      expect(s.runner.credits).toBe(5);
      s = must(s, { type: "psi_corp_bid", amount: 2 });
      expect(s.corp.credits).toBe(4);
      expect(s.psi).toBeNull();
      expect(s.runner.credits).toBe(3);
    });
  });

  describe("A Teia maxRemoteServers + HQ chain", () => {
    it("blocks third remote when maxRemoteServers is 2", () => {
      const s = createInitialState();
      const id = instantiateCard("a-teia-ip-recovery", "corp-id", "corp:identity");
      id.maxRemoteServers = 2;
      s.corp.identityId = "corp-id";
      s.cards["corp-id"] = id;
      s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
      s.servers["remote-2"] = { id: "remote-2", kind: "remote", ice: [], root: [] };
      s.nextRemoteNumber = 3;
      const ice = instantiateCard("ice-wall", "ice-new", "corp:hq");
      s.cards["ice-new"] = ice;
      s.corp.hand = ["ice-new"];
      s.corp.credits = 10;
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      const bad = applyAction(s, {
        type: "basic_install",
        cardId: "ice-new",
        destination: { kind: "new_remote" },
      });
      expect(bad.ok).toBe(false);
    });
  });

  describe("Stegodon iceDerezzedThisRun + breaker penalty", () => {
    it("applies -2 to breakers when scored and ice derezzed", () => {
      const s = createInitialState();
      const steg = instantiateCard("stegodon-mk-iv", "steg", "corp:score");
      steg.whileScoredBreakerStrengthPenaltyIfIceDerezzedThisRun = 2;
      s.corp.scoreArea = ["steg"];
      s.cards["steg"] = steg;
      const br = instantiateCard("corroder", "br-1", "runner:installed");
      br.breaker = { strength: 2, breakCredits: 1, subtypes: ["barrier"] };
      s.runner.installed = ["br-1"];
      s.cards["br-1"] = br;
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        iceDerezzedThisRun: true,
      };
      expect(effectiveBreakerStrength(s, "br-1")).toBe(0);
    });
  });

  describe("AirbladeX damage_interrupt", () => {
    it("opens pendingDamage from real net_damage so AirbladeX can prevent (CR 9.9.5 / 9.9.3a / 10.4)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Use card IR (power counters + interrupt paid ability), not a hand-rolled ability.
      const abx = instantiateCard("airbladex-jsrf-ed", "abx", "runner:installed");
      abx.powerCounters = abx.powerCountersOnInstall ?? 3;
      s.cards["abx"] = abx;
      s.runner.installed = ["abx"];
      expect(abx.powerCounters).toBe(3);
      expect(
        abx.paidAbilities?.some((a) =>
          a.windows.includes("damage_interrupt"),
        ),
      ).toBe(true);

      s.runner.hand = ["h1", "h2", "h3"];
      for (const id of ["h1", "h2", "h3"]) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };

      // Real net damage path — must open interrupt PAW (not apply immediately).
      const r = evalEffect(
        { state: s, sourceId: "ice-src" },
        fx.netDamage(2),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingDamage).toEqual({
        type: "net",
        remaining: 2,
        sourceId: "ice-src",
        interruptPawOnly: true,
      });
      expect(s.runner.hand).toHaveLength(3);
      expect(
        s.log.some(
          (l) =>
            l.includes(CR.sufferDamage.number) &&
            l.includes(CR.preventDamage.number),
        ),
      ).toBe(true);

      const legal = legalActions(s);
      expect(legal.some((a) => a.type === "accept_damage")).toBe(true);
      expect(legal.some((a) => a.type === "prevent_damage")).toBe(false);
      expect(
        legal.some(
          (a) =>
            a.type === "use_paid_ability" &&
            a.cardId === "abx" &&
            a.abilityId === "airblade-prevent-damage",
        ),
      ).toBe(true);

      s = must(s, {
        type: "use_paid_ability",
        cardId: "abx",
        abilityId: "airblade-prevent-damage",
      });
      expect(s.cards["abx"]!.powerCounters).toBe(2);
      expect(s.pendingDamage?.remaining).toBe(1);
      expect(s.runner.hand).toHaveLength(3);

      s = must(s, { type: "accept_damage" });
      expect(s.pendingDamage).toBeNull();
      expect(s.runner.hand).toHaveLength(2);
      expect(s.runner.discardPile).toHaveLength(1);
    });

    it("applies net damage immediately when no interrupt ability is payable", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.runner.hand = ["h1", "h2"];
      for (const id of ["h1", "h2"]) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      const r = evalEffect(
        { state: s, sourceId: "ice-src" },
        fx.netDamage(1),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingDamage).toBeNull();
      expect(s.runner.hand).toHaveLength(1);
    });
  });
  });
});
