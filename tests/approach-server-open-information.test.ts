/**
 * FX-small: whether the run stops when the Runner approaches the server is
 * decided from open information only (CR 10.2.2b, 10.2.3a).
 *
 * Formicary's ability can be used from a facedown ice on any server when the
 * Runner approaches a server (6.9.4g). The engine used to stop at
 * `run.approachServerPaw` only when such an ice was installed, read from the
 * facedown card. The current step is in every seat's view, so the Runner
 * learned the facedown ice was Formicary-class. Now the run stops whenever
 * any unrezzed ice is installed, which both seats can see.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  getPublicView,
  legalActions,
} from "../src/index.js";
import { instantiateCard } from "../src/cards/load.js";
import type { Action, GameState, Side } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
});

/** A Runner turn with a facedown ice (or none) protecting R&D; the run is on HQ. */
function runnerTurn(facedownIce: string | null): GameState {
  const s = structuredClone(createInitialState());
  // The fixture's Marjanah in the grip is marked rezzed; Runner cards never
  // are (CR 8.1.4f), and this test does not need it.
  s.cards["runner-program-1"]!.rezzed = false;
  if (facedownIce) {
    const ice = instantiateCard(facedownIce, "rd-ice", "server:rd:ice");
    ice.rezzed = false;
    ice.faceup = false;
    s.cards["rd-ice"] = ice;
    s.servers.rd.ice = ["rd-ice"];
  }
  s.corp.credits = 10;
  s.runner.credits = 5;
  s.runner.clicks = 4;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return s;
}

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

/**
 * Run on HQ and have both players pass at every window until the breach.
 * Returns each step reached and both seats' views at each one.
 */
function runOnHqPassingEverywhere(start: GameState): {
  steps: string[];
  views: Record<Side, unknown[]>;
  corpCouldUseFormicary: boolean;
  end: GameState;
} {
  let s = must(start, { type: "basic_run", serverId: "hq" });
  const steps: string[] = [];
  const views: Record<Side, unknown[]> = { corp: [], runner: [] };
  let corpCouldUseFormicary = false;
  for (let i = 0; i < 40 && s.run && !s.timingKey.startsWith("breach."); i++) {
    steps.push(s.timingKey);
    views.corp.push(seatView(s, "corp"));
    views.runner.push(seatView(s, "runner"));
    const legal = legalActions(s);
    if (
      legal.some(
        (a) =>
          a.type === "use_paid_ability" && a.abilityId === "formicary-approach",
      )
    ) {
      corpCouldUseFormicary = true;
    }
    const next =
      legal.find((a) => a.type === "continue_run") ??
      legal.find((a) => a.type === "pass_window");
    if (!next) throw new Error(`No pass at ${s.timingKey}`);
    s = must(s, next);
  }
  steps.push(s.timingKey);
  return { steps, views, corpCouldUseFormicary, end: s };
}

/**
 * A seat's view. The Corp sees its own facedown ice (CR 10.2.2a), so the
 * Corp's view of that one card is left out; everything else must match.
 */
function seatView(s: GameState, side: Side): unknown {
  const view: unknown = JSON.parse(JSON.stringify(getPublicView(s, side)));
  return side === "corp" ? withoutCard(view, "rd-ice") : view;
}

function withoutCard(value: unknown, id: string): unknown {
  if (Array.isArray(value)) {
    return value
      .filter(
        (v) =>
          !(v && typeof v === "object" && (v as { id?: unknown }).id === id),
      )
      .map((v) => withoutCard(v, id));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== id)
        .map(([k, v]) => [k, withoutCard(v, id)]),
    );
  }
  return value;
}

describe("the approach-server step is decided from open information (CR 10.2.2b, 10.2.3a)", () => {
  it("the run takes the same steps whether the facedown ice is a Formicary or not (CR 10.2.2b)", () => {
    const formicary = runOnHqPassingEverywhere(runnerTurn("formicary"));
    const iceWall = runOnHqPassingEverywhere(runnerTurn("ice-wall"));

    // The Corp may use Formicary there, and only with a Formicary installed.
    expect(formicary.corpCouldUseFormicary).toBe(true);
    expect(iceWall.corpCouldUseFormicary).toBe(false);

    // Both runs stop at the same steps, including the approach-server step.
    expect(formicary.steps).toContain("run.approachServerPaw");
    expect(iceWall.steps).toEqual(formicary.steps);
  });

  it("the Runner's view is the same at every step whether the facedown ice is a Formicary or not (CR 10.2.2b)", () => {
    const formicary = runOnHqPassingEverywhere(runnerTurn("formicary"));
    const iceWall = runOnHqPassingEverywhere(runnerTurn("ice-wall"));
    expect(iceWall.views.runner).toEqual(formicary.views.runner);
    // The Corp sees its own card's face; apart from that its view matches too.
    expect(iceWall.views.corp).toEqual(formicary.views.corp);
  });

  it("after the approach-server stop, the checkpoint outside the movement phase still occurs (CR 10.3.6, 6.9.4h)", () => {
    const { steps, end } = runOnHqPassingEverywhere(runnerTurn("ice-wall"));
    expect(steps).toContain("run.approachServerPaw");
    const stopClosed = end.log.findIndex((l) =>
      l.startsWith("Approach-server PAW closes."),
    );
    const movementCheckpoint = end.log.findIndex((l) =>
      l.startsWith("Checkpoint open [timing] Outside the movement phase"),
    );
    expect(stopClosed).toBeGreaterThanOrEqual(0);
    expect(movementCheckpoint).toBeGreaterThan(stopClosed);
  });

  it("with no unrezzed ice installed, the run goes straight to success (CR 6.9.4g is not a paid ability window)", () => {
    const none = runOnHqPassingEverywhere(runnerTurn(null));
    expect(none.steps).not.toContain("run.approachServerPaw");
    expect(none.end.turn.successfulRunServersThisTurn).toContain("hq");
  });

  it("a rezzed ice alone does not stop the run at the approach-server step", () => {
    const s = runnerTurn("ice-wall");
    s.cards["rd-ice"]!.rezzed = true;
    s.cards["rd-ice"]!.faceup = true;
    const rezzed = runOnHqPassingEverywhere(s);
    expect(rezzed.steps).not.toContain("run.approachServerPaw");
    expect(rezzed.end.turn.successfulRunServersThisTurn).toContain("hq");
  });
});
