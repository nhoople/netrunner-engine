/**
 * Blanked sources do not apply continuous hand-size, MU, install-cost, or
 * allotted-click modifiers (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  resolveAndAdvance,
} from "../src/index.js";
import { computeRunnerMaxHandSize } from "../src/state/handSize.js";
import { memoryLimit } from "../src/state/turn.js";
import { runnerInstallCost } from "../src/actions/installRunner.js";
import { agendaPointMu, agendaPointHandSize } from "../src/state/staticFlags.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("blanked continuous numerics (CR 9.12.1d)", () => {
  it("drops Public Sympathy hand-size bonus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ps = instantiateCard("public-sympathy", "ps-1", "runner:installed");
    s.cards["ps-1"] = ps;
    s.runner.installed = ["ps-1"];

    expect(computeRunnerMaxHandSize(s)).toBe(7);
    ps.abilitiesBlanked = true;
    expect(computeRunnerMaxHandSize(s)).toBe(5);
  });

  it("drops Chairman Hiro runner hand-size penalty while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hiro = instantiateCard("chairman-hiro", "hiro-1", "server:remote-1:root");
    hiro.rezzed = true;
    s.cards["hiro-1"] = hiro;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hiro-1"],
    };

    expect(computeRunnerMaxHandSize(s)).toBe(3);
    hiro.abilitiesBlanked = true;
    expect(computeRunnerMaxHandSize(s)).toBe(5);
  });

  it("drops CyberSolutions Mem Chip MU bonus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const chip = instantiateCard(
      "cybersolutions-mem-chip",
      "chip-1",
      "runner:installed",
    );
    s.cards["chip-1"] = chip;
    s.runner.installed = ["chip-1"];

    const base = s.runner.memoryLimit;
    expect(memoryLimit(s)).toBe(base + 2);
    chip.abilitiesBlanked = true;
    expect(memoryLimit(s)).toBe(base);
  });

  it("drops Brain Chip agenda-point MU while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const chip = instantiateCard("brain-chip", "bc-1", "runner:installed");
    s.cards["bc-1"] = chip;
    s.runner.installed = ["bc-1"];
    const agenda = instantiateCard("priority-requisition", "ag-1", "runner:score");
    s.cards["ag-1"] = agenda;
    s.runner.scoreArea = ["ag-1"];

    expect(agendaPointMu(s)).toBeGreaterThan(0);
    chip.abilitiesBlanked = true;
    expect(agendaPointMu(s)).toBe(0);
  });

  it("drops TechnoCo program install-cost increase while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tech = instantiateCard("technoco", "tc-1", "server:remote-1:root");
    tech.rezzed = true;
    s.cards["tc-1"] = tech;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["tc-1"],
    };
    const icebreaker = instantiateCard("corroder", "cor-1", "runner:hand");
    s.cards["cor-1"] = icebreaker;

    const printed = icebreaker.installCost;
    expect(runnerInstallCost(s, icebreaker)).toBe(printed + 1);
    tech.abilitiesBlanked = true;
    expect(runnerInstallCost(s, icebreaker)).toBe(printed);
  });

  it("drops Water Monopoly non-virtual resource install increase while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wm = instantiateCard("water-monopoly", "wm-1", "corp:score");
    s.cards["wm-1"] = wm;
    s.corp.scoreArea = ["wm-1"];
    const res = instantiateCard("public-sympathy", "ps-1", "runner:hand");
    s.cards["ps-1"] = res;

    const printed = res.installCost;
    expect(runnerInstallCost(s, res)).toBe(printed + 1);
    wm.abilitiesBlanked = true;
    expect(runnerInstallCost(s, res)).toBe(printed);
  });

  it("drops Akshara Sareen allotted-click bonuses while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const aks = instantiateCard("akshara-sareen", "aks-1", "runner:installed");
    s.cards["aks-1"] = aks;
    s.runner.installed = ["aks-1"];

    s.timingKey = "runner.gainClicks";
    resolveAndAdvance(s);
    expect(s.runner.clicks).toBe(5);

    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const aks2 = instantiateCard("akshara-sareen", "aks-2", "runner:installed");
    aks2.abilitiesBlanked = true;
    s2.cards["aks-2"] = aks2;
    s2.runner.installed = ["aks-2"];
    s2.timingKey = "runner.gainClicks";
    resolveAndAdvance(s2);
    expect(s2.runner.clicks).toBe(4);
  });

  it("drops Director Haas Corp allotted-click bonus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const dh = instantiateCard("director-haas", "dh-1", "server:remote-1:root");
    dh.rezzed = true;
    s.cards["dh-1"] = dh;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["dh-1"],
    };

    s.timingKey = "corp.gainClicks";
    resolveAndAdvance(s);
    expect(s.corp.clicks).toBe(4);

    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const dh2 = instantiateCard("director-haas", "dh-2", "server:remote-1:root");
    dh2.rezzed = true;
    dh2.abilitiesBlanked = true;
    s2.cards["dh-2"] = dh2;
    s2.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["dh-2"],
    };
    s2.timingKey = "corp.gainClicks";
    resolveAndAdvance(s2);
    expect(s2.corp.clicks).toBe(3);
  });

  it("drops Brain Chip agenda-point hand size while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const chip = instantiateCard("brain-chip", "bc-1", "runner:installed");
    s.cards["bc-1"] = chip;
    s.runner.installed = ["bc-1"];
    const agenda = instantiateCard("priority-requisition", "ag-1", "runner:score");
    s.cards["ag-1"] = agenda;
    s.runner.scoreArea = ["ag-1"];

    expect(agendaPointHandSize(s)).toBeGreaterThan(0);
    chip.abilitiesBlanked = true;
    expect(agendaPointHandSize(s)).toBe(0);
  });
});
