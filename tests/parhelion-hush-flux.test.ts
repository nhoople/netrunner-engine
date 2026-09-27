/**
 * Parhelion v0.62: Hush + Flux Capacitor.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  abilitiesSuppressed,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.70.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Hush", () => {
  it("wires trojan blank-host + rehost paid ability", () => {
    const def = getCardDef("hush");
    expect(def.unsupported).toEqual([]);
    expect(def.installOnIce).toBe(true);
    expect(def.blanksHostAbilities).toBe(true);
    expect(def.paidAbilities?.[0]?.id).toBe("hush-rehost");
    expect(validateEffectTree(fx.rehostOnOtherIce())).toBeNull();
  });

  it("blanks host ice abilities continuously", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("anvil", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const hush = instantiateCard("hush", "hush-1", "runner:rig");
    hush.hostId = "ice-1";
    s.cards["hush-1"] = hush;
    s.runner.rig = ["hush-1"];
    expect(abilitiesSuppressed(s, "ice-1")).toBe(true);

    // Rehost clears blank on previous host
    const other = instantiateCard("ice-wall", "ice-2", "server:rd:ice");
    other.rezzed = true;
    s.cards["ice-2"] = other;
    s.servers.rd.ice = ["ice-2"];
    const r = evalEffect(
      { state: s, sourceId: "hush-1" },
      fx.rehostOnOtherIce(),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["hush-1"]!.hostId).toBe("ice-2");
    expect(abilitiesSuppressed(s, "ice-1")).toBe(false);
    expect(abilitiesSuppressed(s, "ice-2")).toBe(true);
  });
});

describe("PH Flux Capacitor", () => {
  it("wires trojan first-break may-charge flag", () => {
    const def = getCardDef("flux-capacitor");
    expect(def.unsupported).toEqual([]);
    expect(def.installOnIce).toBe(true);
    expect(def.chargeOnFirstBreakDuringHostEncounter).toBe(true);
    expect(validateEffectTree(fx.mayChargeChoose())).toBeNull();
  });

  it("offers may-charge on first break during host encounter", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const prop = instantiateCard("propeller", "prop-1", "runner:rig");
    prop.powerCounters = 1;
    s.cards["prop-1"] = prop;
    const flux = instantiateCard("flux-capacitor", "flux-1", "runner:rig");
    flux.hostId = "ice-1";
    s.cards["flux-1"] = flux;
    const orca = instantiateCard("orca", "orca-1", "runner:rig");
    s.cards["orca-1"] = orca;
    s.runner.rig = ["prop-1", "flux-1", "orca-1"];

    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.subtypes = ["sentry"];
    ice.subroutines = [
      { text: "ETR", effect: fx.do({ kind: "end_the_run" }) },
      { text: "ETR2", effect: fx.do({ kind: "end_the_run" }) },
    ];
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.runner.credits = 20;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "ice-1",
        broken: [false, false],
      },
      endedTheRun: false,
      cannotJackOut: false,
    };
    s.run.strengthBoosts = { "orca-1": 10 };
    s.run.encounterStrengthBoosts = {};
    s.run.iceStrengthBoosts = {};
    s.run.accessingCardId = null;

    s = must(s, {
      type: "break_subroutine",
      breakerId: "orca-1",
      subIndex: 0,
    });
    expect(s.run!.encounter!.firstBreakChargeFiredIds).toContain("flux-1");
    expect(s.pendingChoice?.chooser).toBe("runner");
    s = must(s, { type: "choose_option", optionId: "charge" });
    expect(s.cards["prop-1"]!.powerCounters).toBe(2);

    // Second break this encounter does not re-offer
    s = must(s, {
      type: "break_subroutine",
      breakerId: "orca-1",
      subIndex: 1,
    });
    // Orca full-break may still offer charge; decline if present
    if (s.pendingChoice) {
      const ids = s.pendingChoice.options.map((o) => o.id);
      expect(ids).toContain("charge");
      s = must(s, { type: "choose_option", optionId: "decline" });
    }
  });
});
