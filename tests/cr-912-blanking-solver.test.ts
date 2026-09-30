/**
 * CR adherence — practical 9.12 blanking dependency solver
 * (Hush × Magnet hosting loop; Magnet continuous hosted blanks).
 * Cites CR 9.12.1d / 9.12.1e. Not a full CR→AST continuous-effect compiler.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  abilitiesSuppressed,
  assertPinnedTag,
  blankingEffectDependsOn,
  collectBlankingEffects,
  createInitialState,
  CR,
  crDataPresent,
  cardsDataPresent,
  assertCardsPinnedTag,
  instantiateCard,
  orderBlankingEffects,
  resolveBlankedCardIds,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.140.0");
});

describe("CR 9.12 — practical blanking dependency solver", () => {
  it("cites resolve for 9.12.1d / 9.12.1e", () => {
    expect(CR.dependentEffects).toEqual({
      number: "9.12.1d",
      id: "rule_dependent_effects",
    });
    expect(CR.independentEffects).toEqual({
      number: "9.12.1e",
      id: "rule_independent_effects",
    });
  });

  it("Hush on Magnet: hosting loop → Hush blanks Magnet; Hush keeps abilities (9.12.1e.ex2)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const magnet = instantiateCard("magnet", "mag-1", "server:hq:ice");
    magnet.rezzed = true;
    magnet.hostedProgramsLoseAbilities = true;
    s.cards["mag-1"] = magnet;
    s.servers.hq.ice = ["mag-1"];

    const hush = instantiateCard("hush", "hush-1", "runner:rig");
    hush.hostId = "mag-1";
    hush.blanksHostAbilities = true;
    // Magnet onRez would also set this; flag must not win over Hush.
    hush.abilitiesBlanked = true;
    s.cards["hush-1"] = hush;
    s.runner.rig = ["hush-1"];

    const effects = collectBlankingEffects(s);
    const hushFx = effects.find((e) => e.id === "blank-host:hush-1");
    const magFx = effects.find((e) => e.sourceId === "mag-1");
    expect(hushFx).toBeDefined();
    expect(magFx).toBeDefined();
    expect(blankingEffectDependsOn(hushFx!, magFx!)).toBe(true);
    expect(blankingEffectDependsOn(magFx!, hushFx!)).toBe(true);

    const ordered = orderBlankingEffects(effects);
    expect(ordered[0]!.id).toBe("blank-host:hush-1");
    // Magnet's blank never applies once Hush removes Magnet's ability.
    expect(ordered.some((e) => e.sourceId === "mag-1")).toBe(false);

    expect(abilitiesSuppressed(s, "mag-1")).toBe(true);
    expect(abilitiesSuppressed(s, "hush-1")).toBe(false);
    expect((s.cards["mag-1"].subroutines ?? []).length).toBeGreaterThan(0);
  });

  it("Magnet alone blanks a hosted program continuously", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const magnet = instantiateCard("magnet", "mag-1", "server:hq:ice");
    magnet.rezzed = true;
    magnet.hostedProgramsLoseAbilities = true;
    s.cards["mag-1"] = magnet;
    s.servers.hq.ice = ["mag-1"];

    const botulus = instantiateCard("botulus", "bot-1", "runner:rig");
    botulus.hostId = "mag-1";
    s.cards["bot-1"] = botulus;
    s.runner.rig = ["bot-1"];

    expect(abilitiesSuppressed(s, "bot-1")).toBe(true);
    expect(abilitiesSuppressed(s, "mag-1")).toBe(false);
    expect(resolveBlankedCardIds(s).has("bot-1")).toBe(true);
  });

  it("Hush on non-Magnet ice blanks host without blanking Hush", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    wall.rezzed = true;
    s.cards["ice-1"] = wall;
    s.servers.hq.ice = ["ice-1"];

    const hush = instantiateCard("hush", "hush-1", "runner:rig");
    hush.hostId = "ice-1";
    hush.blanksHostAbilities = true;
    s.cards["hush-1"] = hush;
    s.runner.rig = ["hush-1"];

    expect(abilitiesSuppressed(s, "ice-1")).toBe(true);
    expect(abilitiesSuppressed(s, "hush-1")).toBe(false);
  });

  it("Klevetnik-class abilitiesBlanked flag still suppresses without a host loop", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.cards["res-1"] = {
      id: "res-1",
      defId: "klevetnik-target",
      title: "Blanked Resource",
      type: "resource",
      side: "runner",
      zone: "runner:rig",
      faceup: true,
      rezzed: true,
      abilitiesBlanked: true,
      abilitiesBlankedCorpTurnsRemaining: 1,
    };
    s.runner.rig = ["res-1"];
    expect(abilitiesSuppressed(s, "res-1")).toBe(true);
  });
});
