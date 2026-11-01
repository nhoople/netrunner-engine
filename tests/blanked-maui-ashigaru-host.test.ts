/**
 * Blanked Maui / Ashigaru / NEXT / cannot-host continuous abilities
 * (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { syncMauiRecurringCredits } from "../src/effects/redsandBawPrimitives.js";
import { syncCorpHandSizeSubroutines } from "../src/state/handSizeSubroutines.js";
import { syncNextSubtypeEtrSubs } from "../src/state/powerCounters.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked Maui / Ashigaru / host (CR 9.12.1d)", () => {
  it("drops Maui ice-protecting-HQ recurring sync while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const maui = instantiateCard("maui", "maui-1", "runner:installed");
    s.cards["maui-1"] = maui;
    s.runner.installed = ["maui-1"];
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];

    syncMauiRecurringCredits(s);
    expect(maui.recurringCreditsMax).toBe(1);
    expect(maui.recurringCredits).toBe(1);

    suppressAbilities(s, maui.id);
    syncMauiRecurringCredits(s);
    expect(maui.recurringCreditsMax).toBe(0);
    expect(maui.recurringCredits).toBe(0);
  });

  it("drops Ashigaru HQ-size ETR subs while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ash = instantiateCard("ashigaru", "ash-1", "server:hq:ice");
    ash.rezzed = true;
    s.cards["ash-1"] = ash;
    s.servers.hq.ice = ["ash-1"];
    const hand = s.corp.deck.splice(0, 3);
    s.corp.hand = hand;
    for (const id of hand) {
      const held = s.cards[id];
      if (held) held.zone = "corp:hq";
    }

    syncCorpHandSizeSubroutines(s, "ash-1");
    const withHand = (ash.subroutines ?? []).length;
    expect(withHand).toBeGreaterThan((ash.baseSubroutines ?? []).length);

    suppressAbilities(s, ash.id);
    syncCorpHandSizeSubroutines(s, "ash-1");
    expect((ash.subroutines ?? []).length).toBe(
      (ash.baseSubroutines ?? []).length,
    );
  });

  it("drops NEXT Silver ETR-per-NEXT while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const silver = instantiateCard("next-silver", "ns-1", "server:hq:ice");
    silver.rezzed = true;
    s.cards["ns-1"] = silver;
    const gold = instantiateCard("next-gold", "ng-1", "server:rd:ice");
    gold.rezzed = true;
    s.cards["ng-1"] = gold;
    s.servers.hq.ice = ["ns-1"];
    s.servers.rd.ice = ["ng-1"];

    syncNextSubtypeEtrSubs(s, "ns-1");
    expect((silver.subroutines ?? []).length).toBeGreaterThan(
      (silver.baseSubroutines ?? []).length,
    );

    suppressAbilities(s, silver.id);
    syncNextSubtypeEtrSubs(s, "ns-1");
    expect((silver.subroutines ?? []).length).toBe(
      (silver.baseSubroutines ?? []).length,
    );
  });

  it("allows hosting on blanked Tithonium (cannotHostCards)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("tithonium", "tith-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["tith-1"] = ice;
    s.servers.hq.ice = ["tith-1"];
    expect(ice.cannotHostCards).toBe(true);

    const blocked =
      Boolean(ice.cannotHostCards) && !abilitiesSuppressed(s, "tith-1");
    expect(blocked).toBe(true);

    suppressAbilities(s, ice.id);
    const stillBlocked =
      Boolean(ice.cannotHostCards) && !abilitiesSuppressed(s, "tith-1");
    expect(stillBlocked).toBe(false);
  });
});
