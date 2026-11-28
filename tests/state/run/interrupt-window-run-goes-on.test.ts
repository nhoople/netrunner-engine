/**
 * FX-window: after an interrupt window that a run step's instruction opened
 * closes, the run goes on from that step. Found by the second reader (tool
 * 1.16; engine #998, #999): a paid interrupt on a subroutine's damage left a
 * priority frame for the subroutine step on the stack, so the run never went
 * on (CR 9.2.4d), and a "choose one" encounter ability was asked again after
 * a tag window inside it (CR 9.12.3d, 9.11.4g).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertPinnedTag,
  crDataPresent,
  legalActions,
} from "../../../src/index.js";
import type { Action, GameState } from "../../../src/index.js";
import { currentWindow } from "../../../src/cards/stubs.js";
import {
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  optionIds,
  paidAbility,
  pick,
  runnerTurn,
  toHand,
  serverOf,
} from "../../rulings/rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

const startRun = (s: GameState): GameState =>
  must(s, { type: "basic_run", serverId: "hq" });

/** Every frame on the priority stack belongs to a step with a window. */
function framesAreWindows(s: GameState): string[] {
  return s.priorityStack
    .map((f) => f.stepKey)
    .filter((key) => !currentWindow(key) && key !== "run.jackOutWindow");
}

const passedTheIce = (s: GameState): boolean =>
  !s.run || s.timingKey === "run.jackOutWindow";

function grip(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) toHand(s, "runner", "sure-gamble", `gamble-${i}`);
}

function useAbility(s: GameState, cardId: string, part = ""): GameState {
  const action = legalActions(s).find(
    (a) =>
      a.type === "use_paid_ability" &&
      a.cardId === cardId &&
      JSON.stringify(a).includes(part),
  );
  expect(action, `${cardId} is offered`).toBeTruthy();
  return must(s, action as Action);
}

describe("a paid interrupt on a subroutine's damage (CR 9.2.4d)", () => {
  it("after Feedback Filter prevents Tithe's net damage, the run goes on past the ice (CR 9.2.4d)", () => {
    let s = runnerTurn(fresh(), 5);
    installIce(s, "tithe", "tithe-1", "hq");
    installRunner(s, "feedback-filter", "filter-1");
    grip(s, 4);
    s = drive(startRun(s), (x) => Boolean(x.pendingDamage));
    expect(s.timingKey).toBe("run.resolveSub");
    s = useAbility(s, "filter-1", "ff-net");
    expect(framesAreWindows(s)).toEqual([]);
    if (s.pendingDamage) s = must(s, { type: "accept_damage" });
    s = drive(s, passedTheIce);
    expect(passedTheIce(s)).toBe(true);
    expect(s.runner.hand).toHaveLength(4);
    expect(framesAreWindows(s)).toEqual([]);
  });

  it("after Feedback Filter prevents Mausolus's net damage, the run stops for the tag window of its next subroutine, then goes on (CR 9.2.4d, 9.2.9)", () => {
    let s = runnerTurn(fresh(), 5);
    installIce(s, "mausolus", "mausolus-1", "hq");
    installRunner(s, "feedback-filter", "filter-1");
    installRunner(s, "decoy", "decoy-1");
    grip(s, 3);
    s = drive(startRun(s), (x) => Boolean(x.pendingDamage));
    s = useAbility(s, "filter-1", "ff-net");
    if (s.pendingDamage) s = must(s, { type: "accept_damage" });
    expect(s.pendingTags).toBeTruthy();
    expect(s.timingKey).toBe("run.resolveSub");
    s = useAbility(s, "decoy-1");
    expect(s.runner.tags).toBe(0);
    s = drive(s, passedTheIce);
    expect(passedTheIce(s)).toBe(true);
    expect(s.runner.hand).toHaveLength(3);
    expect(framesAreWindows(s)).toEqual([]);
  });

  it("after Caldera prevents 1 of Neural Katana's net damage, the run goes on past the ice (CR 9.2.4d)", () => {
    let s = runnerTurn(fresh(), 5);
    installIce(s, "neural-katana", "katana-1", "hq");
    installRunner(s, "caldera", "caldera-1");
    grip(s, 4);
    s = drive(startRun(s), (x) => Boolean(x.pendingDamage));
    s = useAbility(s, "caldera-1");
    expect(framesAreWindows(s)).toEqual([]);
    if (s.pendingDamage) s = must(s, { type: "accept_damage" });
    s = drive(s, passedTheIce);
    expect(passedTheIce(s)).toBe(true);
    expect(s.runner.hand).toHaveLength(2);
    expect(framesAreWindows(s)).toEqual([]);
  });

  it("after the Corp uses Tori Hanzō on Neural Katana's net damage, the run goes on past the ice (CR 9.2.4d)", () => {
    let s = runnerTurn(fresh(), 5);
    s.corp.credits = 5;
    installIce(s, "neural-katana", "katana-1", "hq");
    const tori = installRoot(s, "tori-hanzo", "tori-1");
    // Tori Hanzō protects HQ: move it from its own remote to HQ's root.
    delete s.servers[serverOf(s, "tori-1")];
    s.servers.hq.root.push(tori.id);
    tori.zone = "server:hq:root" as never;
    grip(s, 4);
    s = drive(
      startRun(s),
      (x) => Boolean(x.pendingDamage) || Boolean(x.pendingChoice),
    );
    for (let i = 0; i < 4 && !passedTheIce(s); i++) {
      if (s.pendingChoice) {
        const pay = optionIds(s).find((id) => /pay|tori|accept|yes/i.test(id));
        s = pick(s, pay ?? optionIds(s)[0]!);
      } else if (paidAbility(s, tori.id)) {
        s = useAbility(s, tori.id);
      } else if (s.pendingDamage) {
        s = must(s, { type: "accept_damage" });
      } else {
        s = drive(
          s,
          (x) =>
            passedTheIce(x) ||
            Boolean(x.pendingDamage) ||
            Boolean(x.pendingChoice),
        );
      }
    }
    s = drive(s, passedTheIce);
    expect(passedTheIce(s)).toBe(true);
    expect(s.runner.coreDamage ?? 0).toBe(1);
    expect(framesAreWindows(s)).toEqual([]);
  });
});

describe("an encounter ability is asked once, after an interrupt window inside it (CR 9.12.3d, 9.11.4f, 9.11.4g)", () => {
  it("after Decoy prevents the tag the Runner chose to take, Data Raven does not ask again and the run goes on (CR 9.12.3d)", () => {
    let s = runnerTurn(fresh(), 5);
    installIce(s, "data-raven", "raven-1", "hq");
    installRunner(s, "decoy", "decoy-1");
    s = drive(startRun(s), (x) => Boolean(x.pendingChoice));
    s = pick(s, "unless-pay");
    expect(s.pendingTags).toBeTruthy();
    s = useAbility(s, "decoy-1");
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.tags).toBe(0);
    expect(s.run).not.toBeNull();
    expect(s.timingKey).toBe("run.encounterPaw");
    expect(framesAreWindows(s)).toEqual([]);
  });

  it("Funhouse asks its nested cost once, even with Decoy installed (CR 9.11.4f, 1.16.11b)", () => {
    let s = runnerTurn(fresh(), 5);
    installIce(s, "funhouse", "funhouse-1", "hq");
    installRunner(s, "decoy", "decoy-1");
    s = drive(startRun(s), (x) => Boolean(x.pendingChoice));
    s = pick(s, "unless-pay");
    if (s.pendingTags) s = must(s, { type: "accept_tags" });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.tags).toBe(1);
    expect(s.timingKey).toBe("run.encounterPaw");
    expect(s.cards["decoy-1"]!.zone).toBe("runner:installed");
  });
});
