import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.18");
});

function put(
  s: GameState,
  defId: string,
  id: string,
  zone: string,
): GameState["cards"][string] {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

/** Targeted Marketing in the Corp play area, having named `namedDefId`. */
function setupMarketing(namedDefId: string): GameState {
  const s = createInitialState();
  put(s, "targeted-marketing", "tm-1", "corp:play-area");
  s.corp.playArea = ["tm-1"];
  const r = evalEffect(
    { state: s, sourceId: "tm-1" },
    fx.do({ kind: "set_name", defId: namedDefId }),
  );
  if (!r.ok) throw new Error(r.error ?? "set_name failed");
  s.corp.credits = 5;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = 5;
  return s;
}

function must(
  s: GameState,
  action: Parameters<typeof applyAction>[1],
): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(r.error ?? "action failed");
  return r.state;
}

describe("Targeted Marketing (gain 10 when the Runner plays/installs the named card)", () => {
  it("gains 10 credits when the Runner plays the named event", () => {
    const s = setupMarketing("sure-gamble");
    put(s, "sure-gamble", "sg-1", "runner:grip");
    s.runner.hand = ["sg-1"];
    const after = must(s, { type: "play_event", cardId: "sg-1" });
    expect(after.corp.credits).toBe(15);
  });

  it("gains 10 credits when the Runner installs the named program", () => {
    const s = setupMarketing("corroder");
    put(s, "corroder", "cor-1", "runner:grip");
    s.runner.hand = ["cor-1"];
    const after = must(s, {
      type: "basic_install",
      cardId: "cor-1",
      destination: { kind: "installed" },
    });
    expect(after.corp.credits).toBe(15);
  });

  it("does not gain for a different card", () => {
    const s = setupMarketing("corroder");
    put(s, "dyson-mem-chip", "dm-1", "runner:grip");
    s.runner.hand = ["dm-1"];
    const after = must(s, {
      type: "basic_install",
      cardId: "dm-1",
      destination: { kind: "installed" },
    });
    expect(after.corp.credits).toBe(5);
  });

  it("does not gain once the current has left the play area", () => {
    const s = setupMarketing("corroder");
    // The current is trashed (e.g. another current played): no longer active.
    s.corp.playArea = [];
    s.cards["tm-1"]!.zone = "corp:archives";
    put(s, "corroder", "cor-1", "runner:grip");
    s.runner.hand = ["cor-1"];
    const after = must(s, {
      type: "basic_install",
      cardId: "cor-1",
      destination: { kind: "installed" },
    });
    expect(after.corp.credits).toBe(5);
  });
});
