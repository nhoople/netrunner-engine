/**
 * Parhelion v0.65: Spark of Inspiration + World Tree.
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
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.69.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Spark of Inspiration", () => {
  it("wires onPlay spark_of_inspiration_resolve (−10¢)", () => {
    const def = getCardDef("spark-of-inspiration");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.onPlay).toEqual({
      op: "do",
      action: { kind: "spark_of_inspiration_resolve", discount: 10 },
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
    expect(validateEffectTree(fx.sparkOfInspirationResolve(10))).toBeNull();
  });

  it("sets aside until program; may install −10¢; shuffles remainder", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const filler = instantiateCard("sure-gamble", "fill-1", "runner:stack");
    const prog = instantiateCard("leech", "prog-1", "runner:stack");
    prog.installCost = 12;
    prog.memoryCost = 1;
    const filler2 = instantiateCard("sure-gamble", "fill-2", "runner:stack");
    s.cards["fill-1"] = filler;
    s.cards["prog-1"] = prog;
    s.cards["fill-2"] = filler2;
    // Top of stack = index 0 (shift order).
    s.runner.deck = ["fill-1", "prog-1", "fill-2"];
    s.runner.credits = 5;
    s.runner.rig = [];
    const src = instantiateCard("spark-of-inspiration", "spark-1", "runner:heap");
    s.cards["spark-1"] = src;

    const r = evalEffect(
      { state: s, sourceId: "spark-1" },
      fx.sparkOfInspirationResolve(10),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "install",
      "decline",
    ]);
    expect(s.runner.setAside).toEqual(["fill-1", "prog-1"]);
    expect(s.runner.deck).toEqual(["fill-2"]);

    s = must(s, { type: "choose_option", optionId: "install" });
    expect(s.runner.rig).toContain("prog-1");
    expect(s.runner.credits).toBe(3); // 12 − 10 = 2; 5 − 2 = 3
    expect(s.runner.setAside ?? []).toEqual([]);
    expect(s.runner.deck.sort()).toEqual(["fill-1", "fill-2"].sort());
    expect(s.cards["fill-1"]!.zone).toBe("runner:stack");
    expect(s.cards["fill-1"]!.faceup).toBe(false);
  });

  it("decline shuffles set-aside including the program", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const prog = instantiateCard("leech", "prog-2", "runner:stack");
    prog.installCost = 5;
    s.cards["prog-2"] = prog;
    s.runner.deck = ["prog-2"];
    s.runner.credits = 20;
    const src = instantiateCard("spark-of-inspiration", "spark-2", "runner:heap");
    s.cards["spark-2"] = src;

    evalEffect(
      { state: s, sourceId: "spark-2" },
      fx.sparkOfInspirationResolve(10),
    );
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.runner.rig).not.toContain("prog-2");
    expect(s.runner.deck).toContain("prog-2");
    expect(s.runner.setAside ?? []).toEqual([]);
  });
});

describe("PH World Tree", () => {
  it("wires once-per-turn onSuccessfulRun may-trash search same type", () => {
    const def = getCardDef("world-tree");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.onSuccessfulRunOncePerTurn).toBe(true);
    expect(def.onSuccessfulRun).toEqual({
      op: "do",
      action: {
        kind: "may_trash_other_installed_search_stack_same_type_install",
        discount: 3,
      },
    });
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    expect(
      validateEffectTree(
        fx.mayTrashOtherInstalledSearchStackSameTypeInstall(3),
      ),
    ).toBeNull();
  });

  it("trash other hardware → search/install hardware −3¢", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tree = instantiateCard("world-tree", "wt-1", "runner:rig");
    s.cards["wt-1"] = tree;
    const hw = instantiateCard("pennyshaver", "hw-1", "runner:rig");
    s.cards["hw-1"] = hw;
    s.runner.rig = ["wt-1", "hw-1"];

    const found = instantiateCard("docklands-pass", "hw-2", "runner:stack");
    found.installCost = 5;
    s.cards["hw-2"] = found;
    s.runner.deck = ["hw-2"];
    s.runner.credits = 5;

    const r = evalEffect(
      { state: s, sourceId: "wt-1" },
      fx.mayTrashOtherInstalledSearchStackSameTypeInstall(3),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["trash:hw-1", "decline"]),
    );

    const creditsBefore = s.runner.credits;
    s = must(s, { type: "choose_option", optionId: "trash:hw-1" });
    expect(s.runner.rig).not.toContain("hw-1");
    expect(s.runner.discard).toContain("hw-1");
    // Sole stack hardware auto-installs at 5 − 3 = 2¢.
    expect(s.runner.rig).toContain("hw-2");
    expect(s.runner.credits).toBe(creditsBefore - 2);
    expect(s.runner.deck).not.toContain("hw-2");
  });

  it("fires once on first successful run via onSuccessfulRunOncePerTurn", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tree = instantiateCard("world-tree", "wt-3", "runner:rig");
    s.cards["wt-3"] = tree;
    const hw = instantiateCard("pennyshaver", "hw-3", "runner:rig");
    s.cards["hw-3"] = hw;
    s.runner.rig = ["wt-3", "hw-3"];
    s.servers.hq.ice = [];
    s.corp.hand = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    let guard = 0;
    while (s.run && !s.pendingChoice && guard++ < 30) {
      if (s.timingKey === "run.jackOutWindow") {
        s = must(s, { type: "continue_run" });
      } else if (
        s.timingKey === "run.approachServerPaw" ||
        s.timingKey === "run.approachPaw"
      ) {
        s = must(s, { type: "pass_window" });
      } else {
        break;
      }
    }
    expect(s.turn.successfulRunThisTurn).toBe(true);
    expect(s.turn.onSuccessfulRunFiredIds).toContain("wt-3");
    expect(s.pendingChoice?.options.some((o) => o.id === "trash:hw-3")).toBe(
      true,
    );
  });

  it("no-ops when no other installed cards", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tree = instantiateCard("world-tree", "wt-2", "runner:rig");
    s.cards["wt-2"] = tree;
    s.runner.rig = ["wt-2"];
    const r = evalEffect(
      { state: s, sourceId: "wt-2" },
      fx.mayTrashOtherInstalledSearchStackSameTypeInstall(3),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeNull();
  });
});
