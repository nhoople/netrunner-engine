/**
 * System Core 2019 v1.69.0 I-slice: John Masanori / Spark Agency /
 * Paper Trail / Data Dealer / Cyberfeeder.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  canPayCost,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  payCost,
  validateEffectTree,
} from "../src/index.js";
import { creditsAvailableForInstall, spendCreditsForInstall } from "../src/state/costs.js";

const CLEAR = [
  "john-masanori",
  "spark-agency-worldswide-reach",
  "paper-trail",
  "data-dealer",
  "cyberfeeder",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.112.0");
});

describe("System Core 2019 v1.69.0 I-slice", () => {
  it("declares at least 50 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(50);
  });

  it("loads five clear I-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("John Masanori draws on first success and tags on first unsuccessful", () => {
    const def = getCardDef("john-masanori");
    expect(def.onFirstSuccessfulRunThisTurn).toEqual(fx.draw("runner", 1));
    expect(def.onFirstUnsuccessfulRunThisTurn).toEqual(fx.giveTags(1));
    expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn!)).toBeNull();
    expect(validateEffectTree(def.onFirstUnsuccessfulRunThisTurn!)).toBeNull();

    const s = structuredClone(createInitialState());
    const john = instantiateCard("john-masanori", "john", "runner:rig");
    s.cards["john"] = john;
    s.runner.rig = ["john"];
    for (const id of ["c1"] as const) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
    }
    s.runner.deck = ["c1"];
    const r = evalEffect(
      { state: s, sourceId: "john" },
      fx.draw("runner", 1),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand).toContain("c1");
    expect(s.runner.tags).toBe(0);
    const t = evalEffect(
      { state: s, sourceId: "john" },
      fx.giveTags(1),
    );
    expect(t.ok).toBe(true);
    expect(s.runner.tags).toBe(1);
  });

  it("Spark Agency loses Runner credits on first advertisement rez", () => {
    const def = getCardDef("spark-agency-worldswide-reach");
    expect(def.loseCreditsOnFirstAdvertisementRezThisTurn).toBe(1);

    const s = structuredClone(createInitialState());
    const id = instantiateCard(
      "spark-agency-worldswide-reach",
      "spark-id",
      "corp:hq",
    );
    s.cards["spark-id"] = id;
    s.corp.identityId = "spark-id";
    s.runner.credits = 5;
    expect(id.loseCreditsOnFirstAdvertisementRezThisTurn).toBe(1);
  });

  it("Paper Trail traces then trashes connection/job resources", () => {
    const def = getCardDef("paper-trail");
    expect(def.onScore).toEqual({
      op: "do",
      action: {
        kind: "trace",
        strength: 6,
        onSuccess: fx.trashInstalledResourcesWithAnySubtype([
          "connection",
          "job",
        ]),
      },
    });
    expect(validateEffectTree(def.onScore!)).toBeNull();

    const s = structuredClone(createInitialState());
    const conn = instantiateCard("john-masanori", "conn", "runner:rig");
    const other = instantiateCard("cyberfeeder", "chip", "runner:rig");
    s.cards["conn"] = conn;
    s.cards["chip"] = other;
    s.runner.rig = ["conn", "chip"];
    s.cards["pt"] = instantiateCard("paper-trail", "pt", "corp:score");
    const r = evalEffect(
      { state: s, sourceId: "pt" },
      fx.trashInstalledResourcesWithAnySubtype(["connection", "job"]),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.rig).toEqual(["chip"]);
    expect(s.runner.discard).toContain("conn");
  });

  it("Data Dealer forfeits an agenda for 9¢", () => {
    const def = getCardDef("data-dealer");
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.forfeitAgenda).toBe(true);
    expect(ab?.cost?.clicks).toBe(1);
    expect(ab?.effect).toEqual(fx.gainCredits("runner", 9));
    expect(validateEffectTree(ab!.effect)).toBeNull();

    const s = structuredClone(createInitialState());
    const dd = instantiateCard("data-dealer", "dd", "runner:rig");
    s.cards["dd"] = dd;
    s.runner.rig = ["dd"];
    s.runner.clicks = 1;
    s.runner.credits = 0;
    const ag = instantiateCard("hostile-takeover", "stolen", "runner:score");
    s.cards["stolen"] = ag;
    s.runner.score = ["stolen"];
    const cost = ab!.cost!;
    expect(canPayCost(s, "runner", cost, dd)).toBe(true);
    payCost(s, "runner", cost, "data-dealer-forfeit", dd);
    expect(s.runner.clicks).toBe(0);
    expect(s.runner.score).toEqual([]);
    expect(s.removedFromGame).toContain("stolen");
    const r = evalEffect({ state: s, sourceId: "dd" }, ab!.effect);
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(9);
  });

  it("Cyberfeeder provides recurring credits for virus installs", () => {
    const def = getCardDef("cyberfeeder");
    expect(def.recurringCreditsMax).toBe(1);
    expect(def.recurringSpendFor).toEqual(["use_program", "install_virus"]);

    const s = structuredClone(createInitialState());
    const cf = instantiateCard("cyberfeeder", "cf", "runner:rig");
    cf.recurringCredits = 1;
    s.cards["cf"] = cf;
    s.runner.rig = ["cf"];
    s.runner.credits = 0;
    const virus = instantiateCard("fermenter", "ds", "runner:grip");
    s.cards["ds"] = virus;
    expect(creditsAvailableForInstall(s, "runner", virus)).toBe(1);
    spendCreditsForInstall(s, "runner", 1, virus);
    expect(cf.recurringCredits).toBe(0);
    expect(s.runner.credits).toBe(0);
  });
});
