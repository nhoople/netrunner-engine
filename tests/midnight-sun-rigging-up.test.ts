/**
 * Midnight Sun Rigging Up cluster:
 * install_from_grip_discount (program/hardware −3¢) + may_charge_card.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
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
  assertCardsPinnedTag("v0.33.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

const riggingUpEffect = () =>
  fx.installFromGripDiscount(["program", "hardware"], 3, true);

describe("MS Rigging Up discounted install + may charge IR (always)", () => {
  it("accepts install_from_grip_discount Effect IR", () => {
    expect(validateEffectTree(riggingUpEffect())).toBeNull();
    expect(validateEffectTree(fx.installGripCard("x", 3))).toBeNull();
    expect(validateEffectTree(fx.mayChargeCard("x"))).toBeNull();
  });

  it("rejects invalid types / discount", () => {
    expect(
      validateEffectTree({
        op: "do",
        action: {
          kind: "install_from_grip_discount",
          types: ["ice"],
          discount: 3,
        },
      } as never),
    ).toMatch(/types/);
    expect(
      validateEffectTree({
        op: "do",
        action: {
          kind: "install_from_grip_discount",
          types: ["program"],
          discount: -1,
        },
      } as never),
    ).toMatch(/discount/);
  });

  it("installs Hyperbaric at 0¢ (3−3) and may charge after powerCountersOnInstall", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("sure-gamble", "ru-1", "runner:grip");
    ev.onPlay = riggingUpEffect();
    s.cards["ru-1"] = ev;
    s.runner.hand = ["ru-1"];

    const h = instantiateCard("hyperbaric", "hyp-1", "runner:grip");
    // Ensure install places counters before may-charge (Hyperbaric ruling).
    h.powerCountersOnInstall = 1;
    h.installCost = 3;
    s.cards["hyp-1"] = h;
    s.runner.hand.push("hyp-1");
    s.runner.credits = 2; // play 0 + install 0; leave spare
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    // Replace sure-gamble with a 0-cost event shell
    ev.type = "event";
    ev.playCost = 0;
    ev.defId = "rigging-up";
    ev.title = "Rigging Up";

    s = must(s, { type: "play_event", cardId: "ru-1" });
    // Sole candidate → auto install, then may-charge pending
    expect(s.runner.rig).toContain("hyp-1");
    expect(s.runner.hand).not.toContain("hyp-1");
    expect(s.cards["hyp-1"]!.powerCounters).toBe(1);
    expect(s.runner.credits).toBe(2); // paid 0 for install
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["charge", "decline"]),
    );

    s = must(s, { type: "choose_option", optionId: "charge" });
    expect(s.cards["hyp-1"]!.powerCounters).toBe(2);
    expect(s.pendingChoice).toBeNull();
  });

  it("decline skips charge after discounted install", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("sure-gamble", "ru-2", "runner:grip");
    ev.type = "event";
    ev.playCost = 0;
    ev.onPlay = riggingUpEffect();
    s.cards["ru-2"] = ev;

    const h = instantiateCard("hyperbaric", "hyp-2", "runner:grip");
    h.powerCountersOnInstall = 1;
    h.installCost = 3;
    s.cards["hyp-2"] = h;
    s.runner.hand = ["ru-2", "hyp-2"];
    s.runner.credits = 0;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "play_event", cardId: "ru-2" });
    expect(s.cards["hyp-2"]!.powerCounters).toBe(1);
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.cards["hyp-2"]!.powerCounters).toBe(1);
  });

  it("does not offer charge when installed card has no power counters", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.mayChargeCard("missing"),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();

    const prog = instantiateCard("cleaver", "cl-1", "runner:rig");
    prog.powerCounters = 0;
    s.cards["cl-1"] = prog;
    s.runner.rig.push("cl-1");
    const r2 = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.mayChargeCard("cl-1"),
    );
    expect(r2.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
  });

  it("chooses among multiple affordable program/hardware; ignores resources", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("sure-gamble", "ru-3", "runner:grip");
    ev.type = "event";
    ev.playCost = 0;
    ev.onPlay = riggingUpEffect();
    s.cards["ru-3"] = ev;

    const h = instantiateCard("hyperbaric", "hyp-3", "runner:grip");
    h.powerCountersOnInstall = 1;
    h.installCost = 3;
    s.cards["hyp-3"] = h;

    const end = instantiateCard("endurance", "end-3", "runner:grip");
    end.powerCountersOnInstall = 3;
    end.installCost = 8;
    s.cards["end-3"] = end;

    const res = instantiateCard("no-free-lunch", "nfl-3", "runner:grip");
    res.type = "resource";
    res.installCost = 0;
    s.cards["nfl-3"] = res;

    s.runner.hand = ["ru-3", "hyp-3", "end-3", "nfl-3"];
    s.runner.credits = 5; // Endurance needs 5 after −3; Hyperbaric 0
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "play_event", cardId: "ru-3" });
    expect(s.pendingChoice).not.toBeNull();
    const ids = s.pendingChoice!.options.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining(["install-hyp-3", "install-end-3"]),
    );
    expect(ids.some((id) => id.includes("nfl"))).toBe(false);

    s = must(s, { type: "choose_option", optionId: "install-end-3" });
    expect(s.runner.rig).toContain("end-3");
    expect(s.runner.credits).toBe(0); // 5 − 5
    expect(s.cards["end-3"]!.powerCounters).toBe(3);
    expect(s.pendingChoice).not.toBeNull();
    s = must(s, { type: "choose_option", optionId: "charge" });
    expect(s.cards["end-3"]!.powerCounters).toBe(4);
  });

  it("no-ops when no affordable candidates", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const h = instantiateCard("hyperbaric", "hyp-4", "runner:grip");
    h.installCost = 3;
    s.cards["hyp-4"] = h;
    s.runner.hand = ["hyp-4"];
    s.runner.credits = 0; // need 0 after discount actually — wait 3-3=0
    // Use a 5-cost program so 5-3=2 unaffordable
    h.installCost = 5;
    const r = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.installFromGripDiscount(["program", "hardware"], 3, true),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.rig).not.toContain("hyp-4");
    expect(s.pendingChoice).toBeNull();
  });
});

describe("MS Rigging Up card wiring (v0.31.0+)", () => {
  it("Rigging Up wires install_from_grip_discount + mayCharge; unsupported empty", () => {
    const def = getCardDef("rigging-up");
    expect(def.type).toBe("event");
    expect(def.playCost).toBe(0);
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.onPlay).toEqual(
      fx.installFromGripDiscount(["program", "hardware"], 3, true),
    );
  });
});
