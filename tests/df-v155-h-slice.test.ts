/**
 * Downfall v1.55.0 H-slice: Sting! / Az McCaffrey / Saisentan /
 * Focus Group / Divested Trust.
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
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { resolveDamage } from "../src/state/damage.js";
import { emptyTurnBookkeeping } from "../src/state/turn.js";

const CLEAR = [
  "sting",
  "az-mccaffrey-mechanical-prodigy",
  "saisentan",
  "focus-group",
  "divested-trust",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.55.0");
});

describe("Downfall v1.55.0 H-slice", () => {
  it("declares downfall in-progress with at least 45 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("in-progress");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(45);
  });

  it("loads five new clear H-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Sting! does 1 + copies in other score on score/steal", () => {
    const def = getCardDef("sting");
    const kind =
      "net_damage_1_plus_copies_of_source_title_in_other_score_area";
    expect(def.onScore).toEqual(fx.do({ kind }));
    expect(def.onSteal).toEqual(fx.do({ kind }));
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(validateEffectTree(def.onSteal!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const sting = instantiateCard("sting", "sting-1", "corp:score");
    s.cards["sting-1"] = sting;
    s.corp.score = ["sting-1"];
    const other = instantiateCard("sting", "sting-2", "runner:score");
    s.cards["sting-2"] = other;
    s.runner.score = ["sting-2"];
    // Fill grip so 2 net does not flatline.
    for (let i = 0; i < 5; i++) {
      const id = `grip-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const before = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "sting-1" },
      fx.netDamage1PlusCopiesOfSourceTitleInOtherScoreArea(),
    );
    expect(r.ok).toBe(true);
    // 1 + 1 copy in other score = 2 net.
    expect(s.runner.hand.length).toBe(before - 2);
  });

  it("Az discounts first job/connection/hardware install", () => {
    const def = getCardDef("az-mccaffrey-mechanical-prodigy");
    expect(def.firstJobConnectionOrHardwareInstallDiscount).toBe(1);
  });

  it("Saisentan chooses type and amplifies net on trash of type", () => {
    const def = getCardDef("saisentan");
    expect(JSON.stringify(def.onEncounter)).toContain(
      "choose_card_type_for_encounter",
    );
    expect(def.amplifyNetDamageOnTrashChosenEncounterType).toBe(true);
    expect(def.subroutines).toHaveLength(3);
    for (const sub of def.subroutines!) {
      expect(JSON.stringify(sub.effect)).toContain("net_damage");
      expect(validateEffectTree(sub.effect)).toBeNull();
    }
    expect(validateEffectTree(def.onEncounter!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("saisentan", "sai-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["sai-1"] = ice;
    s.servers.hq!.ice = ["sai-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "sai-1",
        broken: [false, false, false],
        chosenCardType: "event",
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    // Grip: 1 event + 2 programs so amplify can trash further.
    for (let i = 0; i < 4; i++) {
      const id = `g-${i}`;
      const title = i === 0 ? "sure-gamble" : "corroder";
      s.cards[id] = instantiateCard(title, id, "runner:grip");
      s.runner.hand.push(id);
    }
    const before = s.runner.hand.length;
    resolveDamage(s, "net", 1, "sai-1");
    // At least the first trash + possible amplify; event trash triggers +1.
    expect(s.runner.hand.length).toBeLessThan(before);
  });

  it("Focus Group requires successful run last turn and reveal-advance", () => {
    const def = getCardDef("focus-group");
    expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
    expect(def.onPlay).toEqual(
      fx.do({ kind: "focus_group_reveal_may_advance" }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    s.turn = emptyTurnBookkeeping({
      successfulRunLastTurn: true,
    });
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.focusGroupRevealMayAdvance(),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id.startsWith("fg-type:"))).toBe(
      true,
    );
  });

  it("Divested Trust may forfeit on other steal to return agenda", () => {
    const def = getCardDef("divested-trust");
    expect(JSON.stringify(def.onOtherAgendaStolen)).toContain(
      "divested_trust_may_forfeit_return_stolen",
    );
    expect(validateEffectTree(def.onOtherAgendaStolen!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const div = instantiateCard("divested-trust", "div-1", "corp:score");
    s.cards["div-1"] = div;
    s.corp.score = ["div-1"];
    const stolen = instantiateCard("priority-requisition", "stolen-1", "runner:score");
    s.cards["stolen-1"] = stolen;
    s.runner.score = ["stolen-1"];
    s.turn.lastStolenAgendaId = "stolen-1";
    const creditsBefore = s.corp.credits;
    const r = evalEffect(
      { state: s, sourceId: "div-1" },
      fx.divestedTrustMayForfeitReturnStolen(5),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id === "forfeit-return")).toBe(
      true,
    );
    // Resolve forfeit path.
    const opt = s.pendingChoice!.options.find((o) => o.id === "forfeit-return")!;
    s.pendingChoice = null;
    const r2 = evalEffect({ state: s, sourceId: "div-1" }, opt.effect);
    expect(r2.ok).toBe(true);
    expect(s.corp.score.includes("div-1")).toBe(false);
    expect(s.corp.credits).toBe(creditsBefore + 5);
    expect(s.corp.hand.includes("stolen-1")).toBe(true);
    expect(s.runner.score.includes("stolen-1")).toBe(false);
  });
});
