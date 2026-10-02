/**
 * Downfall v1.57.0 J-slice: Reduced Service / Cold Site Server / Stargate /
 * Letheia Nisei / Climactic Showdown.
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
import { additionalRunInitiateTax } from "../src/state/runInitiateTax.js";
import { beginBreachAccess } from "../src/state/access.js";
import { emptyTurnBookkeeping } from "../src/state/turn.js";

const CLEAR = [
  "reduced-service",
  "cold-site-server",
  "stargate",
  "letheia-nisei",
  "climactic-showdown",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.143.0");
});

describe("Downfall v1.57.0 J-slice", () => {
  it("declares downfall supported with at least 55 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(55);
  });

  it("loads five new clear J-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Reduced Service rez spend + initiate tax per power", () => {
    const def = getCardDef("reduced-service");
    expect(def.rezSpendCreditsForPowerCounters).toEqual({ max: 4 });
    expect(def.additionalRunInitiatePerPowerCounter).toEqual({ credits: 2 });
    expect(JSON.stringify(def.onSuccessfulRun)).toContain("remove_power_counter");
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("reduced-service", "rs-1", "server:remote1:root");
    card.rezzed = true;
    card.powerCounters = 2;
    s.cards["rs-1"] = card;
    s.servers["remote1"] = {
      id: "remote1",
      kind: "remote",
      root: ["rs-1"],
      ice: [],
    };
    expect(additionalRunInitiateTax(s, "remote1")).toEqual({
      credits: 4,
      clicks: 0,
    });

    const spend = evalEffect(
      { state: s, sourceId: "rs-1" },
      fx.do({ kind: "rez_spend_credits_for_power_counters", amount: 3 }),
    );
    expect(spend.ok).toBe(true);
    // Corp starts with 5; spending 3 leaves 2; power was 2 + 3 = 5.
    expect(s.corp.credits).toBe(2);
    expect(s.cards["rs-1"]!.powerCounters).toBe(5);
  });

  it("Cold Site Server click→power, initiate tax, remove_all", () => {
    const def = getCardDef("cold-site-server");
    expect(def.additionalRunInitiatePerPowerCounter).toEqual({
      clicks: 1,
      credits: 1,
    });
    expect(def.onTurnBegin).toEqual(fx.removeAllPowerCounters());
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(def.paidAbilities?.[0]?.effect).toEqual(fx.addPowerCounter(1));

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("cold-site-server", "cs-1", "server:remote1:root");
    card.rezzed = true;
    card.powerCounters = 3;
    s.cards["cs-1"] = card;
    s.servers["remote1"] = {
      id: "remote1",
      kind: "remote",
      root: ["cs-1"],
      ice: [],
    };
    expect(additionalRunInitiateTax(s, "remote1")).toEqual({
      credits: 3,
      clicks: 3,
    });
    const r = evalEffect(
      { state: s, sourceId: "cs-1" },
      fx.removeAllPowerCounters(),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["cs-1"]!.powerCounters).toBe(0);
  });

  it("Stargate reveal top n RD trash one", () => {
    const def = getCardDef("stargate");
    expect(JSON.stringify(def.paidAbilities)).toContain(
      "reveal_top_n_rd_trash_one",
    );
    expect(JSON.stringify(def.paidAbilities)).toContain("set_run_skip_breach");
    const onSuccess = def.paidAbilities![0]!.startsRun!.onSuccessfulRun!;
    expect(validateEffectTree(onSuccess)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const a = instantiateCard("hedge-fund", "rd-a", "corp:rd");
    const b = instantiateCard("hedge-fund", "rd-b", "corp:rd");
    const c = instantiateCard("hedge-fund", "rd-c", "corp:rd");
    s.cards["rd-a"] = a;
    s.cards["rd-b"] = b;
    s.cards["rd-c"] = c;
    s.corp.deck = ["rd-a", "rd-b", "rd-c"];
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.revealTopNRdTrashOne(3),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options).toHaveLength(3);
    expect(s.turn.rdLookedCards).toEqual(["rd-a", "rd-b", "rd-c"]);
  });

  it("Letheia Nisei once-per-run approach + move outermost", () => {
    const def = getCardDef("letheia-nisei");
    expect(def.onApproachServerOncePerRun).toBe(true);
    expect(JSON.stringify(def.onApproachServer)).toContain(
      "move_runner_to_outermost_attacked",
    );
    expect(validateEffectTree(def.onApproachServer!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "success",
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
    };
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.moveRunnerToOutermostAttacked(),
    );
    expect(r.ok).toBe(true);
    expect(s.run!.position).toBe(0);
  });

  it("Climactic Showdown choose server → decline registers breach bonus", () => {
    const def = getCardDef("climactic-showdown");
    expect(JSON.stringify(def.onTurnBegin)).toContain("rfg_self");
    expect(JSON.stringify(def.onTurnBegin)).toContain(
      "climactic_choose_server_corp_may_trash_ice_else_bonus_access",
    );
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    s.turn = emptyTurnBookkeeping();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const choose = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.climacticChooseServerCorpMayTrashIceElseBonusAccess(),
    );
    expect(choose.ok).toBe(true);
    expect(
      s.pendingChoice?.options.some((o) => o.id === "climactic-server:hq"),
    ).toBe(true);

    const corpMay = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.do({ kind: "climactic_corp_may_trash_ice", serverId: "hq" }),
    );
    expect(corpMay.ok).toBe(true);
    expect(
      s.pendingChoice?.options.some((o) => o.id === "climactic-decline"),
    ).toBe(true);

    const decline = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.do({ kind: "climactic_register_bonus_access", amount: 2 }),
    );
    expect(decline.ok).toBe(true);
    expect(s.turn.climacticBonusAccessOnFirstHqRdBreach).toBe(2);

    // Fire at first HQ breach.
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
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
    // Seed HQ hand so bonus access has cards to expand into.
    const h1 = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    const h2 = instantiateCard("hedge-fund", "hq-2", "corp:hq");
    const h3 = instantiateCard("hedge-fund", "hq-3", "corp:hq");
    s.cards["hq-1"] = h1;
    s.cards["hq-2"] = h2;
    s.cards["hq-3"] = h3;
    s.corp.hand = ["hq-1", "hq-2", "hq-3"];
    beginBreachAccess(s, "hq");
    expect(s.turn.climacticBonusAccessOnFirstHqRdBreach).toBe(0);
    expect(s.run!.bonusAccess ?? 0).toBeGreaterThanOrEqual(2);
  });
});
