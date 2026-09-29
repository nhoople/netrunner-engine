/**
 * Downfall v1.58.0 K-slice: final 10 → 65/65 set-complete.
 * Direct Access / Lucky Charm / Whistleblower / Storgotic Resonator /
 * Hyoubu Institute / The Class Act / Always Have a Backup Plan /
 * Complete Image / Khusyuk / MirrorMorph.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
  createInitialState,
  instantiateCard,
  additionalRunInitiateTax,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { emptyTurnBookkeeping } from "../src/state/turn.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import {
  openPendingEndTheRun,
  preventPendingEndTheRun,
} from "../src/state/endTheRun.js";

const CLEAR = [
  "direct-access",
  "lucky-charm",
  "whistleblower",
  "storgotic-resonator",
  "hyoubu-institute-absolute-clarity",
  "the-class-act",
  "always-have-a-backup-plan",
  "complete-image",
  "khusyuk",
  "mirrormorph-endless-iteration",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.67.0");
});

describe("Downfall v1.58.0 K-slice", () => {
  it("declares downfall supported with 65/65 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBe(65);
  });

  it("loads ten K-slice clears with empty unsupported", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
      expect(typeof def.faction).toBe("string");
    }
  });

  it("Direct Access blanks identities + may shuffle on run end", () => {
    const def = getCardDef("direct-access");
    expect(def.blankIdentitiesWhileResolving).toBe(true);
    expect(def.runEvent?.servers).toBe("any");
    expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain(
      "may_shuffle_title_from_heap_into_stack",
    );
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const da = instantiateCard("direct-access", "da-1", "runner:heap");
    s.cards["da-1"] = da;
    s.run = {
      attackedServerId: "hq",
      phase: "approach_server",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      blankIdentities: true,
      runSourceId: "da-1",
    };
    expect(abilitiesSuppressed(s, s.corp.identityId)).toBe(true);
    expect(abilitiesSuppressed(s, s.runner.identityId)).toBe(true);
  });

  it("Lucky Charm interrupt RFG prevent Corp ETR", () => {
    const def = getCardDef("lucky-charm");
    const ab = def.paidAbilities![0]!;
    expect(ab.windows).toEqual(["end_the_run_interrupt_paw"]);
    expect(ab.requiresSuccessfulHqRunThisTurn).toBe(true);
    expect(ab.cost?.rfgSelf).toBe(true);
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(JSON.stringify(ab.effect)).toContain(
      "prevent_pending_end_the_run_from_corp_card_ability",
    );
  });

  it("Whistleblower name-steal leaf validates", () => {
    const def = getCardDef("whistleblower");
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "whistleblower_may_trash_name_agenda_steal_ignore_costs",
    );
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
  });

  it("Storgotic Resonator faction + power + net", () => {
    const def = getCardDef("storgotic-resonator");
    expect(def.faction).toBe("jinteki");
    expect(def.onFirstTrashMatchingRunnerIdentityFactionEachTurn).toBeTruthy();
    expect(JSON.stringify(def.paidAbilities)).toContain("net_damage");
    expect(
      validateEffectTree(def.onFirstTrashMatchingRunnerIdentityFactionEachTurn!),
    ).toBeNull();
  });

  it("Hyoubu Institute first-reveal + reveal paid", () => {
    const def = getCardDef("hyoubu-institute-absolute-clarity");
    expect(JSON.stringify(def.onFirstRevealEachTurn)).toContain("gain_credits");
    expect(JSON.stringify(def.paidAbilities)).toContain(
      "hyoubu_reveal_grip_random_or_stack_top",
    );
    expect(validateEffectTree(def.onFirstRevealEachTurn!)).toBeNull();
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });

  it("The Class Act discard-install draw + would-draw interrupt", () => {
    const def = getCardDef("the-class-act");
    expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain(
      "self_installed_this_turn",
    );
    expect(JSON.stringify(def.onWouldDrawOncePerTurn)).toContain(
      "class_act_look_top_draw_amount_plus_one_bottom_one",
    );
    expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
    expect(validateEffectTree(def.onWouldDrawOncePerTurn!)).toBeNull();
  });

  it("Always Have a Backup Plan unsuccessful rerun leaf", () => {
    const def = getCardDef("always-have-a-backup-plan");
    expect(def.runEvent?.servers).toBe("any");
    expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain(
      "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice",
    );
    expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain("run_unsuccessful");
    expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
  });

  it("Complete Image agenda-pts gate + name-net loop", () => {
    const def = getCardDef("complete-image");
    expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
    expect(def.playRequiresRunnerAgendaPointsGte).toBe(3);
    expect(def.endsActionPhase).toBe(true);
    expect(JSON.stringify(def.onPlay)).toContain(
      "complete_image_name_net_damage_loop",
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Khusyuk skip breach + set-aside access", () => {
    const def = getCardDef("khusyuk");
    expect(def.runEvent?.servers).toBe("rd");
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
      "set_run_skip_breach",
    );
    expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
      "khusyuk_choose_install_cost_set_aside_access_shuffle",
    );
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
  });

  it("MirrorMorph third-distinct tracking field + discount leaf", () => {
    const def = getCardDef("mirrormorph-endless-iteration");
    expect(def.mirrormorphOnThirdDistinctAction).toBeTruthy();
    expect(JSON.stringify(def.mirrormorphOnThirdDistinctAction)).toContain(
      "mirrormorph_take_different_action_click_discount",
    );
    expect(validateEffectTree(def.mirrormorphOnThirdDistinctAction!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const mm = instantiateCard(
      "mirrormorph-endless-iteration",
      "mm-1",
      "corp:identity",
    );
    s.cards["mm-1"] = mm;
    s.corp.identityId = "mm-1";
    expect(mm.mirrormorphTrackDistinctActions).toBe(true);
    const r = evalEffect(
      { state: s, sourceId: "mm-1" },
      fx.mirrormorphTakeDifferentActionClickDiscount(),
    );
    expect(r.ok).toBe(true);
    expect(s.turn.mirrormorphClickDiscountPending).toBe(true);
  });

  it("interaction: Cold Site Server initiate tax still works", () => {
    let s: GameState = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("cold-site-server", "cs-1", "server:remote1:root");
    card.rezzed = true;
    card.powerCounters = 2;
    s.cards["cs-1"] = card;
    s.servers["remote1"] = {
      id: "remote1",
      kind: "remote",
      root: ["cs-1"],
      ice: [],
    };
    expect(additionalRunInitiateTax(s, "remote1")).toEqual({
      credits: 2,
      clicks: 2,
    });
  });

  it("interaction: Direct Access blankIdentities suppresses identity abilities", () => {
    let s: GameState = createInitialState();
    s = structuredClone(s);
    s.turn = emptyTurnBookkeeping();
    s.run = {
      attackedServerId: "rd",
      phase: "approach_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      blankIdentities: true,
    };
    expect(abilitiesSuppressed(s, s.corp.identityId)).toBe(true);
    expect(abilitiesSuppressed(s, s.runner.identityId)).toBe(true);
  });

  it("interaction: Lucky Charm prevent pending Corp-ability ETR", () => {
    let s: GameState = createInitialState();
    s = structuredClone(s);
    s.turn = emptyTurnBookkeeping();
    s.turn.successfulHqRunThisTurn = true;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter_ice",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    openPendingEndTheRun(s, "ice-wall-1", true);
    expect(s.pendingEndTheRun?.fromCorpCardAbility).toBe(true);
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.preventPendingEndTheRunFromCorpCardAbility(),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingEndTheRun).toBeNull();
    expect(s.run?.endedTheRun).toBe(false);
    // Accept path would end the run — prevent cleared it.
    preventPendingEndTheRun(s);
    expect(s.pendingEndTheRun).toBeNull();
  });
});
