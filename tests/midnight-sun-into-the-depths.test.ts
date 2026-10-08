/**
 * Midnight Sun Into the Depths cluster:
 * exclusive_choices_per_passed_ice + search_stack_program_install.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

const intoTheDepthsOptions = () => [
  {
    id: "credits",
    label: "Gain 4¢",
    effect: fx.gainCredits("runner", 4),
  },
  {
    id: "search",
    label: "Search stack for a program and install it",
    effect: fx.searchStackProgramInstall(),
  },
  {
    id: "charge",
    label: "Charge 1 installed card",
    effect: fx.chargeChoose(),
  },
];

const intoTheDepthsEffect = () =>
  fx.exclusiveChoicesPerPassedIce(intoTheDepthsOptions());

/**
 * Play Into the Depths on HQ with `iceCount` unrezzed ice and walk the run
 * to success (approach pass + jack-out continue per ice).
 */
function playIntoTheDepthsOnHq(
  iceCount: number,
  extras?: (s: ReturnType<typeof createInitialState>) => void,
) {
  let s = createInitialState();
  s = structuredClone(s);
  const ev = instantiateCard("jailbreak", "itd-1", "runner:grip");
  ev.playCost = 0;
  ev.title = "Into the Depths";
  ev.defId = "into-the-depths";
  ev.runEvent = {
    servers: "any",
    skipBreach: true,
    onSuccessfulRun: intoTheDepthsEffect(),
  };
  s.cards["itd-1"] = ev;
  s.runner.hand = ["itd-1"];
  s.runner.credits = 20;
  s.runner.clicks = 4;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  // Keep breach empty so skipBreach isn't required for completion
  s.corp.hand = [];

  s.servers.hq.ice = [];
  for (let i = 0; i < iceCount; i++) {
    const id = `ice-${i}`;
    const ice = instantiateCard("ice-wall", id, "server:hq:ice");
    ice.rezzed = false;
    s.cards[id] = ice;
    s.servers.hq.ice.push(id);
  }

  extras?.(s);
  s = must(s, { type: "play_event", cardId: "itd-1", serverId: "hq" });

  // Unrezzed ice: approach PAW → (decline rez) → movement/pass → jack-out window
  for (let i = 0; i < iceCount; i++) {
    expect(s.timingKey).toBe("run.approachPaw");
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.jackOutWindow");
    s = must(s, { type: "continue_run" });
  }

  // Approach server PAW → success (skipBreach opens exclusive choices; stay on run)
  while (
    s.run &&
    !s.pendingChoice &&
    !s.pendingExclusiveChoices &&
    (s.timingKey === "run.approachServerPaw" ||
      s.timingKey === "run.approachPaw" ||
      s.timingKey === "run.jackOutWindow")
  ) {
    if (s.timingKey === "run.jackOutWindow") {
      s = must(s, { type: "continue_run" });
    } else {
      s = must(s, { type: "pass_window" });
    }
  }
  return s;
}

describe("MS Into the Depths exclusive choices IR (always)", () => {
  it("accepts exclusive_choices_per_passed_ice + search_stack_program_install IR", () => {
    expect(validateEffectTree(intoTheDepthsEffect())).toBeNull();
    expect(validateEffectTree(fx.searchStackProgramInstall())).toBeNull();
    expect(validateEffectTree(fx.installStackProgram("x"))).toBeNull();
  });

  it("rejects empty exclusive options", () => {
    expect(
      validateEffectTree({
        op: "do",
        action: { kind: "exclusive_choices_per_passed_ice", options: [] },
      } as never),
    ).toMatch(/options/);
  });

  it("0 ice passed → no choices", () => {
    const s = playIntoTheDepthsOnHq(0);
    expect(s.pendingChoice).toBeNull();
    expect(s.pendingExclusiveChoices).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(true);
  });

  it("1 ice passed → choose among 3 exclusive options; credits only", () => {
    let s = playIntoTheDepthsOnHq(1);
    expect(s.run?.passedIceIds?.length ?? 0).toBe(1);
    expect(s.pendingExclusiveChoices?.remaining).toBe(1);
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "charge",
      "credits",
      "search",
    ]);

    const before = s.runner.credits;
    s = must(s, { type: "choose_option", optionId: "credits" });
    expect(s.runner.credits).toBe(before + 4);
    expect(s.pendingChoice).toBeNull();
    expect(s.pendingExclusiveChoices).toBeNull();
  });

  it("2 ice → two distinct options; cannot reuse credits", () => {
    let s = playIntoTheDepthsOnHq(2);
    expect(s.run?.passedIceIds?.length ?? 0).toBe(2);
    expect(s.pendingExclusiveChoices?.remaining).toBe(2);

    const before = s.runner.credits;
    s = must(s, { type: "choose_option", optionId: "credits" });
    expect(s.runner.credits).toBe(before + 4);
    // One remaining among charge + search
    expect(s.pendingExclusiveChoices?.remaining).toBe(1);
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "charge",
      "search",
    ]);

    // Charge with no chargeable card → no-op, exclusive finishes
    s = must(s, { type: "choose_option", optionId: "charge" });
    expect(s.pendingChoice).toBeNull();
    expect(s.pendingExclusiveChoices).toBeNull();
  });

  it("3 ice → all three modes; search installs sole stack program", () => {
    let s = playIntoTheDepthsOnHq(3, (st) => {
      const prog = instantiateCard("leech", "prog-1", "runner:stack");
      prog.installCost = 2;
      st.cards["prog-1"] = prog;
      st.runner.deck = ["prog-1"];
      // Chargeable card on rig (sole — program has no power counters)
      const hyp = instantiateCard("hyperbaric", "hyp-1", "runner:rig");
      hyp.powerCounters = 1;
      st.cards["hyp-1"] = hyp;
      st.runner.rig.push("hyp-1");
    });
    expect(s.run?.passedIceIds?.length ?? 0).toBe(3);

    const before = s.runner.credits;
    s = must(s, { type: "choose_option", optionId: "credits" });
    expect(s.runner.credits).toBe(before + 4);

    s = must(s, { type: "choose_option", optionId: "search" });
    // Sole program auto-installs; last mode (charge) auto-resolves sole chargeable
    expect(s.runner.rig).toContain("prog-1");
    expect(s.runner.deck).not.toContain("prog-1");
    expect(s.cards["prog-1"]!.zone).toBe("runner:rig");
    expect(s.cards["hyp-1"]!.powerCounters).toBe(2);
    expect(s.pendingChoice).toBeNull();
    expect(s.pendingExclusiveChoices).toBeNull();
  });

  it("search with multiple affordable programs opens install choice", () => {
    let s = playIntoTheDepthsOnHq(1, (st) => {
      const a = instantiateCard("propeller", "prog-a", "runner:stack");
      a.installCost = 1;
      const b = instantiateCard("leech", "prog-b", "runner:stack");
      b.installCost = 1;
      st.cards["prog-a"] = a;
      st.cards["prog-b"] = b;
      st.runner.deck = ["prog-a", "prog-b"];
    });

    s = must(s, { type: "choose_option", optionId: "search" });
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
      "stack-install-prog-a",
      "stack-install-prog-b",
    ]);
    expect(s.pendingExclusiveChoices?.remaining).toBe(0);

    s = must(s, { type: "choose_option", optionId: "stack-install-prog-b" });
    expect(s.runner.rig).toContain("prog-b");
    expect(s.runner.rig).not.toContain("prog-a");
    expect(s.pendingExclusiveChoices).toBeNull();
  });

  it("4+ ice still caps at 3 exclusive resolutions", () => {
    const s = playIntoTheDepthsOnHq(4);
    expect(s.run?.passedIceIds?.length ?? 0).toBe(4);
    expect(s.pendingExclusiveChoices?.remaining).toBe(3);
  });
});

describe("MS Into the Depths card def (when wired)", () => {
  it("into-the-depths wires exclusive_choices_per_passed_ice when clear", () => {
    const def = getCardDef("into-the-depths");
    if ((def.unsupported?.length ?? 0) > 0) {
      expect(def.unsupported?.[0]).toMatch(/passed-ice|unique option/i);
      return;
    }
    expect(def.runEvent?.onSuccessfulRun).toBeTruthy();
    const fxTree = def.runEvent!.onSuccessfulRun!;
    expect(validateEffectTree(fxTree)).toBeNull();
    expect(
      fxTree.op === "do" &&
        fxTree.action.kind === "exclusive_choices_per_passed_ice",
    ).toBe(true);
  });
});
