import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.10");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

function offered(state: GameState, cardId: string, abilityId: string): boolean {
  return queryLegality(state).legal.some(
    (e) =>
      e.action.type === "use_paid_ability" &&
      e.action.cardId === cardId &&
      e.action.abilityId === abilityId,
  );
}

describe("paid ability windows (CR 9.2.7b / 9.5.2f)", () => {
  it("Clone Chip is usable in the encounter paid window, not only the action window", () => {
    const s = createInitialState();
    const chip = instantiateCard("clone-chip", "chip-1", "runner:installed");
    const program = instantiateCard("corroder", "prog-1", "runner:heap");
    s.cards["chip-1"] = chip;
    s.cards["prog-1"] = program;
    s.runner.installed = ["chip-1"];
    s.runner.discardPile = ["prog-1"];
    s.runner.credits = 5;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    const used = must(s, {
      type: "use_paid_ability",
      cardId: "chip-1",
      abilityId: "clone-chip-install",
    });
    expect(used.runner.discardPile).toContain("chip-1");
  });

  it("Coalescence cannot be used during the Corp's turn (printed: only during your turn)", () => {
    const s = createInitialState();
    const coal = instantiateCard("coalescence", "coal-1", "runner:installed");
    coal.powerCounters = 2;
    s.cards["coal-1"] = coal;
    s.runner.installed = ["coal-1"];
    s.runner.credits = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    expect(offered(s, "coal-1", "coalescence-gain")).toBe(false);
    const denied = applyAction(s, {
      type: "use_paid_ability",
      cardId: "coal-1",
      abilityId: "coalescence-gain",
    });
    expect(denied.ok).toBe(false);

    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    expect(offered(s, "coal-1", "coalescence-gain")).toBe(true);
    const used = must(s, {
      type: "use_paid_ability",
      cardId: "coal-1",
      abilityId: "coalescence-gain",
    });
    expect(used.runner.credits).toBe(5);
    expect(used.cards["coal-1"]?.powerCounters).toBe(1);
  });

  it("Temple of the Liberated Mind gains its click only during the Runner's turn", () => {
    const s = createInitialState();
    const temple = instantiateCard(
      "temple-of-the-liberated-mind",
      "temple-1",
      "runner:installed",
    );
    temple.powerCounters = 1;
    s.cards["temple-1"] = temple;
    s.runner.installed = ["temple-1"];
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const denied = applyAction(s, {
      type: "use_paid_ability",
      cardId: "temple-1",
      abilityId: "temple-spend-power",
    });
    expect(denied.ok).toBe(false);

    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    s.runner.clicks = 3;
    const used = must(s, {
      type: "use_paid_ability",
      cardId: "temple-1",
      abilityId: "temple-spend-power",
    });
    expect(used.runner.clicks).toBe(4);
  });

  it("Flip Switch cannot remove a tag during the Corp's turn", () => {
    const s = createInitialState();
    const flip = instantiateCard("flip-switch", "flip-1", "runner:installed");
    s.cards["flip-1"] = flip;
    s.runner.installed = ["flip-1"];
    s.runner.tags = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const denied = applyAction(s, {
      type: "use_paid_ability",
      cardId: "flip-1",
      abilityId: "flip-switch-remove-tag",
    });
    expect(denied.ok).toBe(false);

    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    const used = must(s, {
      type: "use_paid_ability",
      cardId: "flip-1",
      abilityId: "flip-switch-remove-tag",
    });
    expect(used.runner.tags).toBe(0);
  });

  it("Drago Ivanov gives a tag for 2 advancements with no click, only on the Corp's turn", () => {
    const s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["drago-1"],
    } as GameState["servers"][string];
    const drago = instantiateCard(
      "drago-ivanov",
      "drago-1",
      "server:remote-1:root",
    );
    drago.rezzed = true;
    drago.faceup = true;
    drago.advancementCounters = 2;
    s.cards["drago-1"] = drago;
    s.corp.clicks = 3;
    s.runner.tags = 0;

    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    const denied = applyAction(s, {
      type: "use_paid_ability",
      cardId: "drago-1",
      abilityId: "drago-tag",
    });
    expect(denied.ok).toBe(false);

    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const used = must(s, {
      type: "use_paid_ability",
      cardId: "drago-1",
      abilityId: "drago-tag",
    });
    expect(used.runner.tags).toBe(1);
    expect(used.cards["drago-1"]?.advancementCounters).toBe(0);
    expect(used.corp.clicks).toBe(3); // printed cost has no click (CR 1.2.1)
  });

  it("Advanced Assembly Lines cannot be used during a run, even when submitted directly", () => {
    const s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["aal-1"],
    } as GameState["servers"][string];
    const aal = instantiateCard(
      "advanced-assembly-lines",
      "aal-1",
      "server:remote-1:root",
    );
    aal.rezzed = true;
    aal.faceup = true;
    s.cards["aal-1"] = aal;
    s.activeSide = "runner";
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "remote-1",
    } as GameState["run"];
    const denied = applyAction(s, {
      type: "use_paid_ability",
      cardId: "aal-1",
      abilityId: "aal-install",
    });
    expect(denied.ok).toBe(false);
  });
});
