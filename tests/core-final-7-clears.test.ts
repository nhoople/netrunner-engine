/**
 * FFG Core Set final 7 clears + set-complete gate (floor → v1.87.0).
 * ABT, Account Siphon, Chum, Infiltration, Lemuria, Sacrificial Construct, Zaibatsu.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  getCardDef,
  instantiateCard,
  loadCardPool,
  validateEffectTree,
  moveRunnerCardToHeap,
} from "../src/index.js";
import {
  beginExpose,
  acceptPendingExpose,
  preventPendingExpose,
} from "../src/state/expose.js";
import {
  maybeOpenTrashPrevent,
  preventPendingInstalledTrash,
} from "../src/state/trashPrevent.js";

const FINAL7 = [
  "accelerated-beta-test",
  "account-siphon",
  "chum",
  "infiltration",
  "lemuria-codecracker",
  "sacrificial-construct",
  "zaibatsu-loyalty",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.125.0");
});

describe("FFG Core Set final 7 clears", () => {
  it("loads all 7 with empty unsupported", () => {
    for (const id of FINAL7) {
      const def = getCardDef(id);
      expect(def, id).toBeDefined();
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("core");
    }
  });

  it("Infiltration choose gain 2¢ or expose", () => {
    const def = getCardDef("infiltration");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(JSON.stringify(def.onPlay)).toContain("expose");
    expect(JSON.stringify(def.onPlay)).toContain("gain_credits");

    const s = structuredClone(createInitialState());
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["asset-1"],
    };
    const asset = instantiateCard("melange-mining-corp", "asset-1", "server:remote-1:root");
    asset.rezzed = false;
    asset.faceup = false;
    s.cards["asset-1"] = asset;
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      {
        op: "do",
        action: { kind: "expose", pick: "choose", cardId: "asset-1" },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.cards["asset-1"]!.faceup).toBe(true);
  });

  it("Lemuria requires successful HQ run this turn + expose IR", () => {
    const def = getCardDef("lemuria-codecracker");
    const ab = def.paidAbilities![0]!;
    expect(ab.requiresSuccessfulHqRunThisTurn).toBe(true);
    expect(ab.windows).toContain("runner_action_paw");
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(JSON.stringify(ab.effect)).toContain("expose");
  });

  it("Zaibatsu may-rez + prevent expose interrupt (smoke interrupt chain)", () => {
    const def = getCardDef("zaibatsu-loyalty");
    expect(def.mayRezWhenCardWouldBeExposed).toBe(true);
    expect(def.paidAbilities?.some((a) => a.windows.includes("expose_interrupt_paw"))).toBe(
      true,
    );
    for (const ab of def.paidAbilities ?? []) {
      expect(validateEffectTree(ab.effect)).toBeNull();
    }

    const s = structuredClone(createInitialState());
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["zb", "hidden"],
    };
    const zb = instantiateCard("zaibatsu-loyalty", "zb", "server:remote-1:root");
    zb.rezzed = false;
    zb.faceup = false;
    s.cards["zb"] = zb;
    const hidden = instantiateCard(
      "melange-mining-corp",
      "hidden",
      "server:remote-1:root",
    );
    hidden.rezzed = false;
    hidden.faceup = false;
    s.cards["hidden"] = hidden;
    s.corp.credits = 5;

    const status = beginExpose(s, "hidden");
    expect(status).toBe("pending");
    expect(s.pendingExpose?.phase).toBe("may_rez");
    expect(s.pendingChoice?.options.some((o) => o.id === "zaibatsu-rez:zb")).toBe(
      true,
    );

    // Decline may-rez → interrupt if Zaibatsu were rezzed; rez it first then prevent.
    const rez = evalEffect(
      { state: s, sourceId: "zb" },
      { op: "do", action: { kind: "rez_for_expose_interrupt", cardId: "zb" } },
    );
    expect(rez.ok).toBe(true);
    expect(s.cards["zb"]!.rezzed).toBe(true);
    expect(s.pendingExpose?.phase).toBe("interrupt");

    preventPendingExpose(s, 1);
    expect(s.pendingExpose).toBeNull();
    expect(s.cards["hidden"]!.faceup).toBe(false);
  });

  it("expose accept path faces the card up", () => {
    const s = structuredClone(createInitialState());
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hidden"],
    };
    const hidden = instantiateCard(
      "melange-mining-corp",
      "hidden",
      "server:remote-1:root",
    );
    hidden.rezzed = false;
    hidden.faceup = false;
    s.cards["hidden"] = hidden;
    beginExpose(s, "hidden");
    if (s.pendingExpose?.phase === "interrupt") {
      acceptPendingExpose(s);
    }
    expect(s.cards["hidden"]!.faceup).toBe(true);
  });

  it("Chum registers next-ice strength + conditional net", () => {
    const def = getCardDef("chum");
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
      "chum_register_next_ice",
    );

    const s = structuredClone(createInitialState());
    const chum = instantiateCard("chum", "chum-ice", "server:hq:ice");
    s.cards["chum-ice"] = chum;
    s.servers.hq.ice.push("chum-ice");
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
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
    const r = evalEffect(
      { state: s, sourceId: "chum-ice" },
      {
        op: "do",
        action: {
          kind: "chum_register_next_ice",
          strengthBonus: 2,
          netDamageIfNotFullyBroken: 3,
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.run!.chumNextIce).toEqual({
      strengthBonus: 2,
      netDamageIfNotFullyBroken: 3,
    });
  });

  it("Account Siphon may-instead-of-breach IR", () => {
    const def = getCardDef("account-siphon");
    expect(def.runEvent?.servers).toBe("hq");
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
      "account_siphon_may_instead_of_breach",
    );

    const s = structuredClone(createInitialState());
    s.corp.credits = 7;
    s.runner.credits = 0;
    s.runner.tags = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    const offer = evalEffect(
      { state: s, sourceId: "siphon" },
      {
        op: "do",
        action: { kind: "account_siphon_may_instead_of_breach" },
      },
    );
    expect(offer.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    const resolve = evalEffect(
      { state: s, sourceId: "siphon" },
      {
        op: "do",
        action: { kind: "account_siphon_resolve", loseAmount: 5 },
      },
    );
    expect(resolve.ok).toBe(true);
    expect(s.run!.skipBreach).toBe(true);
    expect(s.corp.credits).toBe(2);
    expect(s.runner.credits).toBe(10);
    expect(s.runner.tags).toBe(2);
  });

  it("ABT looks top N and may install+rez ice", () => {
    const def = getCardDef("accelerated-beta-test");
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onScore)).toContain("accelerated_beta_test");

    const s = structuredClone(createInitialState());
    const ice = instantiateCard("shadow", "ice-look", "corp:rd");
    const op = instantiateCard("aggressive-negotiation", "op-look", "corp:rd");
    const ice2 = instantiateCard("data-mine", "ice2-look", "corp:rd");
    s.cards["ice-look"] = ice;
    s.cards["op-look"] = op;
    s.cards["ice2-look"] = ice2;
    s.corp.deck = ["ice-look", "op-look", "ice2-look"];
    const r = evalEffect(
      { state: s, sourceId: "abt" },
      { op: "do", action: { kind: "accelerated_beta_test", n: 3 } },
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.turn.rdLookedCards).toContain("ice-look");
  });

  it("Sacrificial Construct opens trash interrupt (prevent × trash smoke)", () => {
    const def = getCardDef("sacrificial-construct");
    const ab = def.paidAbilities![0]!;
    expect(ab.windows).toContain("trash_interrupt_paw");
    expect(validateEffectTree(ab.effect)).toBeNull();

    const s = structuredClone(createInitialState());
    const sc = instantiateCard("sacrificial-construct", "sc", "runner:rig");
    s.cards["sc"] = sc;
    s.runner.rig.push("sc");
    const prog = instantiateCard("magnum-opus", "mo", "runner:rig");
    s.cards["mo"] = prog;
    s.runner.rig.push("mo");

    expect(maybeOpenTrashPrevent(s, "mo")).toBe(true);
    expect(s.pendingTrashPrevent?.cardId).toBe("mo");
    preventPendingInstalledTrash(s);
    expect(s.pendingTrashPrevent).toBeNull();
    expect(s.runner.rig).toContain("mo");

    // After prevent, a fresh trash with no interrupt payable goes through.
    s.runner.rig = s.runner.rig.filter((id) => id !== "sc");
    moveRunnerCardToHeap(s, "mo");
    expect(s.runner.discard).toContain("mo");
  });
});

describe("FFG Core Set set-complete gate", () => {
  it("declares core supported with 49/49 Core-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves.core).toBeDefined();
    expect(pool.waves.core.status).toBe("supported");
    expect(pool.waves.core.cards).toHaveLength(113);
    let clear = 0;
    for (const id of pool.waves.core.cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "core") {
        clear++;
      }
    }
    expect(clear).toBe(49);
  });

  it("interaction smoke — interrupt chain: Zaibatsu prevent × expose", () => {
    const s = structuredClone(createInitialState());
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["zb", "hidden"],
    };
    const zb = instantiateCard("zaibatsu-loyalty", "zb", "server:remote-1:root");
    zb.rezzed = true;
    zb.faceup = true;
    s.cards["zb"] = zb;
    const hidden = instantiateCard(
      "melange-mining-corp",
      "hidden",
      "server:remote-1:root",
    );
    hidden.rezzed = false;
    hidden.faceup = false;
    s.cards["hidden"] = hidden;
    s.corp.credits = 5;
    const status = beginExpose(s, "hidden");
    expect(status).toBe("pending");
    expect(s.pendingExpose?.phase).toBe("interrupt");
    preventPendingExpose(s, 1);
    expect(s.cards["hidden"]!.faceup).toBe(false);
  });

  it("interaction smoke — prevent × trash: Sacrificial Construct", () => {
    const s = structuredClone(createInitialState());
    const sc = instantiateCard("sacrificial-construct", "sc", "runner:rig");
    s.cards["sc"] = sc;
    s.runner.rig.push("sc");
    const hw = instantiateCard("desperado", "desp", "runner:rig");
    s.cards["desp"] = hw;
    s.runner.rig.push("desp");
    expect(maybeOpenTrashPrevent(s, "desp")).toBe(true);
    preventPendingInstalledTrash(s);
    expect(s.runner.rig).toContain("desp");
  });

  it("interaction smoke — success instead-of-breach: Account Siphon skipBreach", () => {
    const s = structuredClone(createInitialState());
    s.corp.credits = 4;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
    };
    const siphon = instantiateCard("account-siphon", "siphon", "runner:play-area");
    s.cards["siphon"] = siphon;
    evalEffect(
      { state: s, sourceId: "siphon" },
      {
        op: "do",
        action: { kind: "account_siphon_resolve", loseAmount: 4 },
      },
    );
    expect(s.run!.skipBreach).toBe(true);
    expect(s.corp.credits).toBe(0);
    expect(s.runner.credits).toBeGreaterThanOrEqual(8);
  });
});
