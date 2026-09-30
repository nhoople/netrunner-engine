/**
 * A Study in Static (asis) Effect IR / card-field primitives for v1.91.0.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.107.0");
});

describe("ASIS forbid_runner_runs_this_turn", () => {
  it("validates Uroboros primitive", () => {
    expect(
      validateEffectTree(fx.forbidRunnerRunsThisTurn()),
    ).toBeNull();
  });
});

describe("ASIS bullfrog move ice", () => {
  it("validates move_source_ice_to_outermost_another_server_continue_run", () => {
    expect(
      validateEffectTree(fx.moveSourceIceToOutermostAnotherServerContinueRun()),
    ).toBeNull();
  });
});

describe("ASIS doppelganger may_start_run", () => {
  it("validates may_start_run any", () => {
    expect(
      validateEffectTree(
        fx.do({ kind: "may_start_run", servers: "any" }),
      ),
    ).toBeNull();
  });
});

describe("ASIS set_trace_base_strength", () => {
  it("validates Disrupter interrupt primitive", () => {
    expect(validateEffectTree(fx.setTraceBaseStrength(0))).toBeNull();
  });
});
