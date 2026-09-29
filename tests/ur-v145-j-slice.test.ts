/**
 * Uprising v1.45.0 J-slice: Hoshiko Shiro / Digital Rights Management /
 * Paule's Café / Konjin / Buffer Drive.
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
  getCardDef,
  instantiateCard,
  loadCardPool,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import {
  beginCorpTurnFlags,
  beginRunnerTurnFlags,
} from "../src/state/turn.js";
import type { Action, GameState } from "../src/state/types.js";

const CLEAR = [
  "hoshiko-shiro-untold-protagonist",
  "digital-rights-management",
  "paules-cafe",
  "konjin",
  "buffer-drive",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.45.0");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function corpPlayReady(s: GameState): GameState {
  s = structuredClone(s);
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  s.corp.credits = 20;
  return s;
}

function runnerActionReady(s: GameState): GameState {
  s = structuredClone(s);
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = 20;
  return s;
}

describe("Uprising v1.45.0 J-slice", () => {
  it("declares uprising in-progress with at least 58 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["uprising"].status).toBe("in-progress");
    let clear = 0;
    for (const id of pool.waves["uprising"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(58);
  });

  it("loads five J-slice clears", () => {
    for (const id of CLEAR) {
      const def = getCardDef(id);
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("uprising");
    }
  });

  it("Hoshiko wires access-turn-end flip + flipped begin draw", () => {
    const def = getCardDef("hoshiko-shiro-untold-protagonist");
    expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
      "accessed_a_card_this_turn",
    );
    expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("flip_identity");
    expect(JSON.stringify(def.onTurnBegin)).toContain("identity_flipped");
    expect(JSON.stringify(def.onTurnBegin)).toContain("draw");
  });

  it("Hoshiko gains 2¢ and flips when a card was accessed", () => {
    let s = createInitialState();
    const id = instantiateCard(
      "hoshiko-shiro-untold-protagonist",
      "hoshiko-1",
      "runner:identity",
    );
    s.cards["hoshiko-1"] = id;
    s.runner.identityId = "hoshiko-1";
    s.runner.credits = 5;
    s.turn.accessedACardThisTurn = true;
    expect(s.cards["hoshiko-1"]!.identityFlipped).toBeFalsy();

    const r = evalEffect(
      { state: s, sourceId: "hoshiko-1" },
      s.cards["hoshiko-1"]!.onRunnerTurnEnd!,
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(7);
    expect(s.cards["hoshiko-1"]!.identityFlipped).toBe(true);
  });

  it("DRM wires no-HQ-last-turn gate + search + remote install + forbid score", () => {
    const def = getCardDef("digital-rights-management");
    expect(def.playRequiresNoSuccessfulHqRunLastTurn).toBe(true);
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("search_rd_agenda_to_hq");
    expect(JSON.stringify(def.onPlay)).toContain(
      "may_install_from_hq_in_remote_root_paying_costs",
    );
    expect(JSON.stringify(def.onPlay)).toContain(
      "forbid_scoring_agendas_this_turn",
    );
  });

  it("DRM play gate blocks after successful HQ last turn", () => {
    let s = corpPlayReady(createInitialState());
    const drm = instantiateCard(
      "digital-rights-management",
      "drm-1",
      "corp:hq",
    );
    s.cards["drm-1"] = drm;
    s.corp.hand = ["drm-1"];
    s.turn.successfulHqRunLastTurn = true;
    expect(
      queryLegality(s).legal.some(
        (e) =>
          e.action.type === "play_operation" && e.action.cardId === "drm-1",
      ),
    ).toBe(false);
    const blocked = applyAction(s, {
      type: "play_operation",
      cardId: "drm-1",
    });
    expect(blocked.ok).toBe(false);

    s.turn.successfulHqRunLastTurn = false;
    expect(
      queryLegality(s).legal.some(
        (e) =>
          e.action.type === "play_operation" && e.action.cardId === "drm-1",
      ),
    ).toBe(true);
  });

  it("beginCorpTurnFlags carries successfulHqRunLastTurn", () => {
    const s = createInitialState();
    s.turn.successfulHqRunThisTurn = true;
    beginCorpTurnFlags(s);
    expect(s.turn.successfulHqRunLastTurn).toBe(true);
    expect(s.turn.successfulHqRunThisTurn).toBe(false);
  });

  it("Paule's Café wires host faceup + install-hosted discount", () => {
    const def = getCardDef("paules-cafe");
    expect(def.unique).toBe(true);
    expect(def.paidAbilities?.length).toBe(2);
    const host = def.paidAbilities![0]!;
    const install = def.paidAbilities![1]!;
    expect(validateEffectTree(host.effect)).toBeNull();
    expect(validateEffectTree(install.effect)).toBeNull();
    expect(JSON.stringify(host.effect)).toContain(
      "may_host_one_program_or_hardware_from_grip_faceup",
    );
    expect(JSON.stringify(install.effect)).toContain(
      "may_install_one_hosted_card",
    );
    expect(JSON.stringify(install.effect)).toContain(
      "firstThisTurnDiscountPerUniqueConnection",
    );
  });

  it("Paule's may host a program faceup from grip", () => {
    let s = runnerActionReady(createInitialState());
    const cafe = instantiateCard("paules-cafe", "cafe-1", "runner:rig");
    const prog = instantiateCard("sure-gamble", "prog-1", "runner:grip");
    // Use a real program if available; otherwise force type.
    prog.type = "program";
    prog.installCost = 2;
    prog.memoryCost = 1;
    s.cards["cafe-1"] = cafe;
    s.cards["prog-1"] = prog;
    s.runner.rig = ["cafe-1"];
    s.runner.hand = ["prog-1"];

    const r = evalEffect(
      { state: s, sourceId: "cafe-1" },
      {
        op: "do",
        action: { kind: "may_host_one_program_or_hardware_from_grip_faceup" },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id.includes("prog-1"))).toBe(
      true,
    );
    s = must(s, {
      type: "choose_option",
      optionId: `host-grip-faceup:prog-1`,
    });
    expect(s.cards["prog-1"]!.zone).toBe("hosted:cafe-1");
    expect(s.cards["prog-1"]!.faceup).toBe(true);
    expect(s.cards["cafe-1"]!.hostedCardIds).toContain("prog-1");
  });

  it("Konjin wires psi → may nested encounter resume", () => {
    const def = getCardDef("konjin");
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
    expect(JSON.stringify(def.onEncounter)).toContain("play_psi_game");
    expect(JSON.stringify(def.onEncounter)).toContain(
      "may_choose_other_rezzed_ice_encounter_then_resume_source",
    );
  });

  it("Konjin may choose other rezzed ice for nested encounter", () => {
    const s = createInitialState();
    const konjin = instantiateCard("konjin", "kon-1", "server:hq:ice");
    const wall = instantiateCard("ice-wall", "wall-1", "server:rd:ice");
    wall.rezzed = true;
    wall.faceup = true;
    konjin.rezzed = true;
    konjin.faceup = true;
    s.cards["kon-1"] = konjin;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["kon-1"];
    s.servers.rd.ice = ["wall-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: { iceId: "kon-1", broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      iceStrengthBoosts: {},
    };

    const r = evalEffect(
      { state: s, sourceId: "kon-1" },
      {
        op: "do",
        action: {
          kind: "may_choose_other_rezzed_ice_encounter_then_resume_source",
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(
      s.pendingChoice?.options.some((o) => o.id === "konjin-encounter:wall-1"),
    ).toBe(true);

    const chosen = applyAction(s, {
      type: "choose_option",
      optionId: "konjin-encounter:wall-1",
    });
    // Divert may walk; accept either pending divert state or resumed walk.
    expect(chosen.ok).toBe(true);
    if (chosen.ok) {
      expect(
        chosen.state.run?.resumeEncounterIceId === "kon-1" ||
          chosen.state.run?.forceEncounterIceId === "wall-1" ||
          chosen.state.run?.encounter?.iceId === "wall-1" ||
          chosen.state.log.some((l) => l.includes("resume")),
      ).toBe(true);
    }
  });

  it("Buffer Drive wires spectator batch + RFG heap-to-top", () => {
    const def = getCardDef("buffer-drive");
    expect(def.unique).toBe(true);
    expect(validateEffectTree(def.onFirstGripOrStackTrashBatchEachTurn!)).toBeNull();
    expect(JSON.stringify(def.onFirstGripOrStackTrashBatchEachTurn)).toContain(
      "may_add_one_of_card_ids_to_stack_bottom",
    );
    const paid = def.paidAbilities![0]!;
    expect(validateEffectTree(paid.effect)).toBeNull();
    expect(JSON.stringify(paid.effect)).toContain("rfg_self");
    expect(JSON.stringify(paid.effect)).toContain(
      "may_add_from_heap_to_stack_top",
    );
  });

  it("Buffer Drive offers bottoming one of a grip trash batch", () => {
    let s = createInitialState();
    const buf = instantiateCard("buffer-drive", "buf-1", "runner:rig");
    const a = instantiateCard("sure-gamble", "a-1", "runner:grip");
    const b = instantiateCard("sure-gamble", "b-1", "runner:grip");
    s.cards["buf-1"] = buf;
    s.cards["a-1"] = a;
    s.cards["b-1"] = b;
    s.runner.rig = ["buf-1"];
    s.runner.hand = ["a-1", "b-1"];
    s.turn.pendingGripOrStackTrashBatchIds = ["a-1", "b-1"];
    // Simulate already in heap after trash.
    s.runner.hand = [];
    s.runner.discard = ["a-1", "b-1"];
    a.zone = "runner:heap";
    b.zone = "runner:heap";

    const r = evalEffect(
      { state: s, sourceId: "buf-1" },
      buf.onFirstGripOrStackTrashBatchEachTurn!,
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id === "batch-bottom:a-1")).toBe(
      true,
    );
    s = must(s, { type: "choose_option", optionId: "batch-bottom:a-1" });
    expect(s.runner.deck[s.runner.deck.length - 1]).toBe("a-1");
    expect(s.runner.discard).not.toContain("a-1");
  });

  it("beginRunnerTurnFlags resets access + café + buffer once flags", () => {
    const s = createInitialState();
    s.turn.accessedACardThisTurn = true;
    s.turn.paulesCafeInstallUsedThisTurn = true;
    s.turn.bufferDriveGripStackTrashUsedThisTurn = true;
    s.turn.successfulHqRunLastTurn = true;
    beginRunnerTurnFlags(s);
    expect(s.turn.accessedACardThisTurn).toBe(false);
    expect(s.turn.paulesCafeInstallUsedThisTurn).toBe(false);
    expect(s.turn.bufferDriveGripStackTrashUsedThisTurn).toBe(false);
    expect(s.turn.successfulHqRunLastTurn).toBe(true);
  });
});
