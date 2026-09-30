/**
 * System Core 2019 v1.66.0 G-slice: HQ/R&D Interface, Closed Accounts, Flare,
 * Leela Patel — new Effect IR leaves + wiring.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";
import { beginBreachAccess } from "../src/state/access.js";

const CLEAR = [
  "hq-interface",
  "r-d-interface",
  "closed-accounts",
  "flare",
  "leela-patel-trained-pragmatist",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.105.0");
});

describe("System Core 2019 v1.66.0 G-slice", () => {
  it("declares at least 40 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(40);
  });

  it("loads five clear G-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("HQ Interface grants +1 access whenever breaching HQ", () => {
    const def = getCardDef("hq-interface");
    expect(def.bonusAccessOnHqBreach).toBe(1);
    expect(def.type).toBe("hardware");

    const s = structuredClone(createInitialState());
    const hw = instantiateCard("hq-interface", "hqi", "runner:rig");
    s.cards["hqi"] = hw;
    s.runner.rig = ["hqi"];
    for (const id of ["c1", "c2", "c3"] as const) {
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
    }
    s.corp.hand = ["c1", "c2", "c3"];
    s.turn.hqBreachesThisTurn = 1; // not first-breach-only
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
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
    beginBreachAccess(s);
    expect(s.run!.accessCandidates.length).toBe(2);
    expect(
      s.log.some((l) => l.includes("HQ Interface") && l.includes("+1")),
    ).toBe(true);
  });

  it("R&D Interface grants +1 access whenever breaching R&D", () => {
    const def = getCardDef("r-d-interface");
    expect(def.bonusAccessOnRdBreach).toBe(1);

    const s = structuredClone(createInitialState());
    const hw = instantiateCard("r-d-interface", "rdi", "runner:rig");
    s.cards["rdi"] = hw;
    s.runner.rig = ["rdi"];
    for (const id of ["d1", "d2", "d3"] as const) {
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
    }
    s.corp.deck = ["d1", "d2", "d3"];
    s.run = {
      attackedServerId: "rd",
      phase: "breach",
      position: null,
      successful: true,
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
    beginBreachAccess(s);
    expect((s.run!.bonusAccess ?? 0)).toBeGreaterThanOrEqual(1);
    expect(s.run!.accessCandidates.length).toBeGreaterThanOrEqual(2);
    expect(
      s.log.some((l) => l.includes("R&D Interface") && l.includes("+1")),
    ).toBe(true);
  });

  it("Closed Accounts requires a tag and drains the Runner credit pool", () => {
    const def = getCardDef("closed-accounts");
    expect(def.playRequiresTagged).toBe(true);
    expect(def.onPlay).toEqual(fx.loseAllCredits("runner"));
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    const s = structuredClone(createInitialState());
    s.runner.credits = 7;
    const r = evalEffect(
      { state: s, sourceId: "closed-accounts" },
      fx.loseAllCredits("runner"),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(0);
  });

  it("Flare Trace success trashes hardware, deals unpreventable meat, ETRs", () => {
    const def = getCardDef("flare");
    expect(def.subroutines?.length).toBe(1);
    const sub = def.subroutines![0]!;
    expect(sub.effect?.op).toBe("do");
    expect(validateEffectTree(sub.effect!)).toBeNull();
    const raw = JSON.stringify(sub.effect);
    expect(raw).toContain('"kind":"trace"');
    expect(raw).toContain('"kind":"trash_hardware"');
    expect(raw).toContain('"cannotPrevent":true');
    expect(raw).toContain('"kind":"end_the_run"');

    const s = structuredClone(createInitialState());
    // Grip cards so meat can trash; Plascrete-class interrupt must not open.
    for (const id of ["g1", "g2"] as const) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.runner.hand = ["g1", "g2"];
    const pc = instantiateCard("sure-gamble", "pc", "runner:rig");
    pc.paidAbilities = [
      {
        id: "fake-plascrete",
        label: "prevent meat",
        windows: ["damage_interrupt_paw"],
        requirePendingDamageTypes: ["meat"],
        cost: { credits: 0 },
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      },
    ];
    s.cards["pc"] = pc;
    s.runner.rig = ["pc"];
    const r = evalEffect(
      { state: s, sourceId: "flare" },
      fx.meatDamage(2, { cannotPrevent: true }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingDamage).toBeFalsy();
    expect(s.runner.hand.length).toBe(0);
    expect(
      s.log.some((l) => l.includes("cannot be prevented")),
    ).toBe(true);
  });

  it("Leela bounces an unrezzed installed Corp card on score/steal", () => {
    const def = getCardDef("leela-patel-trained-pragmatist");
    expect(def.type).toBe("identity");
    expect(def.onAgendaScoredOrStolen).toEqual(
      fx.returnInstalledCorpToHq("choose", { unrezzedOnly: true }),
    );
    expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();

    const s = structuredClone(createInitialState());
    const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
    ice.rezzed = false;
    const rezzed = instantiateCard("pad-campaign", "pad", "server:remote1:root");
    rezzed.rezzed = true;
    s.cards["iw"] = ice;
    s.cards["pad"] = rezzed;
    s.servers.hq.ice = ["iw"];
    s.servers.remote1 = {
      id: "remote1",
      kind: "remote",
      root: ["pad"],
      ice: [],
    };
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.returnInstalledCorpToHq("choose", { unrezzedOnly: true }),
    );
    expect(r.ok).toBe(true);
    // Only one unrezzed target → auto-pick, no choice.
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.hand).toContain("iw");
    expect(s.servers.hq.ice).not.toContain("iw");
    expect(s.servers.remote1.root).toContain("pad");
  });
});
