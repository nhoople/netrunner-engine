/**
 * Continuous cost layer residual (rez reductions + Runner install deltas).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  collectIceRezCostReductions,
  createInitialState,
  crDataPresent,
  instantiateCard,
  resolveIceRezCostReduction,
  resolveRunnerInstallCostDelta,
} from "../src/index.js";
import { runnerInstallCost } from "../src/actions/installRunner.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("continuous cost layer (M5 residual)", () => {
  it("collects Vovô ice rez reductions through the cost layer", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wall = instantiateCard("ice-wall", "wall-1", "server:remote-1:ice");
    s.cards["wall-1"] = wall;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["wall-1"],
      root: ["vovo-1"],
    };
    const vovo = instantiateCard("vovo-ozetti", "vovo-1", "server:remote-1:root");
    vovo.rezzed = true;
    s.cards["vovo-1"] = vovo;

    const mods = collectIceRezCostReductions(s, "wall-1");
    expect(mods.some((m) => m.kind === "ice_rez_cost_reduction")).toBe(true);
    expect(resolveIceRezCostReduction(s, "wall-1")).toBeGreaterThan(0);
  });

  it("applies TechnoCo program install increase via the cost layer", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tech = instantiateCard("technoco", "tc-1", "server:hq:root");
    tech.rezzed = true;
    s.cards["tc-1"] = tech;
    s.servers.hq.root = ["tc-1"];
    const prog = instantiateCard("corroder", "prog-1", "runner:hand");
    s.cards["prog-1"] = prog;
    s.runner.hand = ["prog-1"];

    expect(resolveRunnerInstallCostDelta(s, "prog-1")).toBe(1);
    expect(runnerInstallCost(s, prog)).toBe(prog.installCost + 1);
  });
});
