/**
 * System Core 2019 v1.72.0 M-slice: Paragon / Aggressive Secretary /
 * Successful Field Test / Hostage / Tinkering.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceSubtypes,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "paragon",
  "aggressive-secretary",
  "successful-field-test",
  "hostage",
  "tinkering",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

describe("System Core 2019 v1.72.0 M-slice", () => {
  it("declares at least 70 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(70);
  });

  it("loads five clear M-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Paragon reuses look_top_n_stack_may_bottom_one on successful run", () => {
    const def = getCardDef("paragon");
    expect(def.muBonus).toBe(1);
    expect(def.onSuccessfulRunOncePerTurn).toBe(true);
    expect(JSON.stringify(def.onSuccessfulRun)).toContain(
      "look_top_n_stack_may_bottom_one",
    );
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
  });

  it("Aggressive Secretary may pay 2¢ to trash programs per advancement", () => {
    const def = getCardDef("aggressive-secretary");
    expect(def.canAdvance).toBe(true);
    expect(def.onAccess).toEqual(
      fx.mayPayCreditsForTrashProgramsPerAdvancement(2),
    );
    expect(validateEffectTree(def.onAccess!)).toBeNull();

    const s = structuredClone(createInitialState());
    s.corp.credits = 2;
    const as = instantiateCard(
      "aggressive-secretary",
      "as",
      "server:remote-1:root",
    );
    as.advancementTokens = 2;
    s.cards["as"] = as;
    const prog = instantiateCard("corroder", "p1", "runner:rig");
    s.cards["p1"] = prog;
    s.runner.rig.push("p1");
    const r = evalEffect(
      { state: s, sourceId: "as" },
      fx.mayPayCreditsForTrashProgramsPerAdvancement(2),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "pay")).toBe(true);
  });

  it("Successful Field Test installs any number from HQ ignore costs", () => {
    const def = getCardDef("successful-field-test");
    expect(def.onScore).toEqual(fx.installAnyNumberFromHqIgnoreCosts());
    expect(validateEffectTree(def.onScore!)).toBeNull();

    const s = structuredClone(createInitialState());
    const ice = instantiateCard("ice-wall", "iw", "corp:hq");
    s.cards["iw"] = ice;
    s.corp.hand.push("iw");
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.installAnyNumberFromHqIgnoreCosts(),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "done-hq-install")).toBe(
      true,
    );
    expect(
      s.pendingChoice?.options.some((o) => o.id.startsWith("hq-any:iw:")),
    ).toBe(true);
  });

  it("Hostage searches stack for Connection and may install", () => {
    const def = getCardDef("hostage");
    expect(def.playAdditionalClick).toBe(true);
    expect(def.onPlay).toEqual(fx.searchStackSubtypeMayInstall("connection"));
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    const s = structuredClone(createInitialState());
    s.runner.credits = 5;
    const conn = instantiateCard("kati-jones", "kj", "runner:stack");
    s.cards["kj"] = conn;
    s.runner.deck = ["kj"];
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.searchStackSubtypeMayInstall("connection"),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand).toContain("kj");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.some((o) => o.id === "install:kj")).toBe(
      true,
    );
  });

  it("Tinkering grants chosen ice subtypes until end of turn", () => {
    const def = getCardDef("tinkering");
    expect(def.onPlay).toEqual(
      fx.grantChosenIceSubtypesUntilEndOfTurn([
        "sentry",
        "code gate",
        "barrier",
      ]),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    const s = structuredClone(createInitialState());
    const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
    s.cards["iw"] = ice;
    s.servers.hq.ice.push("iw");
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.grantChosenIceSubtypesUntilEndOfTurn([
        "sentry",
        "code gate",
        "barrier",
      ]),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    const grant = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      {
        op: "do",
        action: {
          kind: "grant_ice_subtypes_until_end_of_turn",
          cardId: "iw",
          subtypes: ["sentry", "code gate", "barrier"],
        },
      },
    );
    expect(grant.ok).toBe(true);
    expect(ice.grantedSubtypesUntilEndOfTurn).toEqual([
      "sentry",
      "code gate",
      "barrier",
    ]);
    const subs = effectiveIceSubtypes(s, "iw");
    expect(subs).toEqual(expect.arrayContaining(["barrier", "sentry", "code gate"]));
  });
});
