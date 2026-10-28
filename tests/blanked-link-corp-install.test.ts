/**
 * Blanked sources do not apply continuous link or Corp install-cost modifiers
 * (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import { runnerInstallCost } from "../src/actions/installRunner.js";
import { recomputeRunnerLink } from "../src/state/trashHooks.js";
import { installCorp } from "../src/actions/installCorp.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked link and Corp install costs (CR 9.12.1d)", () => {
  it("drops Dyson Mem Chip link while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const chip = instantiateCard("dyson-mem-chip", "chip-1", "runner:installed");
    s.cards["chip-1"] = chip;
    s.runner.installed = ["chip-1"];
    recomputeRunnerLink(s);
    expect(s.runner.link).toBeGreaterThan(0);
    const withChip = s.runner.link;
    chip.abilitiesBlanked = true;
    recomputeRunnerLink(s);
    expect(s.runner.link).toBe(withChip - 1);
  });

  it("drops Network Exchange non-innermost ice install increase while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ne = instantiateCard("network-exchange", "ne-1", "runner:installed");
    s.cards["ne-1"] = ne;
    s.runner.installed = ["ne-1"];
    // Existing ice so the new install is not innermost.
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = false;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["wall-1"];
    const enigma = instantiateCard("enigma", "en-1", "corp:hq");
    s.cards["en-1"] = enigma;
    s.corp.hand = ["en-1"];
    s.corp.credits = 20;

    const printed = enigma.installCost + 1; // +1 for protecting over existing ice
    const before = s.corp.credits;
    const r = installCorp(s, "en-1", { kind: "protect", serverId: "hq" });
    expect(r.ok).toBe(true);
    // Network Exchange +1 on top of the standard +1/position cost.
    expect(before - s.corp.credits).toBe(printed + 1);

    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const ne2 = instantiateCard("network-exchange", "ne-2", "runner:installed");
    ne2.abilitiesBlanked = true;
    s2.cards["ne-2"] = ne2;
    s2.runner.installed = ["ne-2"];
    const wall2 = instantiateCard("ice-wall", "wall-2", "server:hq:ice");
    wall2.rezzed = false;
    s2.cards["wall-2"] = wall2;
    s2.servers.hq.ice = ["wall-2"];
    const enigma2 = instantiateCard("enigma", "en-2", "corp:hq");
    s2.cards["en-2"] = enigma2;
    s2.corp.hand = ["en-2"];
    s2.corp.credits = 20;
    const before2 = s2.corp.credits;
    const r2 = installCorp(s2, "en-2", { kind: "protect", serverId: "hq" });
    expect(r2.ok).toBe(true);
    expect(before2 - s2.corp.credits).toBe(printed);
  });

  it("drops Diwan chosen-server install tax while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const diwan = instantiateCard("diwan", "di-1", "runner:installed");
    diwan.chosenServerId = "hq";
    s.cards["di-1"] = diwan;
    s.runner.installed = ["di-1"];
    const wall = instantiateCard("ice-wall", "wall-1", "corp:hq");
    s.cards["wall-1"] = wall;
    s.corp.hand = ["wall-1"];
    s.corp.credits = 20;
    const before = s.corp.credits;
    const r = installCorp(s, "wall-1", { kind: "protect", serverId: "hq" });
    expect(r.ok).toBe(true);
    expect(before - s.corp.credits).toBe(wall.installCost + 1);

    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const diwan2 = instantiateCard("diwan", "di-2", "runner:installed");
    diwan2.chosenServerId = "hq";
    diwan2.abilitiesBlanked = true;
    s2.cards["di-2"] = diwan2;
    s2.runner.installed = ["di-2"];
    const wall2 = instantiateCard("ice-wall", "wall-2", "corp:hq");
    s2.cards["wall-2"] = wall2;
    s2.corp.hand = ["wall-2"];
    s2.corp.credits = 20;
    const before2 = s2.corp.credits;
    const r2 = installCorp(s2, "wall-2", { kind: "protect", serverId: "hq" });
    expect(r2.ok).toBe(true);
    expect(before2 - s2.corp.credits).toBe(wall2.installCost);
  });

  it("drops Eden Fragment first-ice ignore while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const eden = instantiateCard("eden-fragment", "ef-1", "corp:score");
    s.cards["ef-1"] = eden;
    s.corp.scoreArea = ["ef-1"];
    const wall = instantiateCard("ice-wall", "wall-1", "corp:hq");
    s.cards["wall-1"] = wall;
    s.corp.hand = ["wall-1"];
    s.corp.credits = 20;
    const before = s.corp.credits;
    const r = installCorp(s, "wall-1", { kind: "protect", serverId: "hq" });
    expect(r.ok).toBe(true);
    expect(before - s.corp.credits).toBe(0);

    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const eden2 = instantiateCard("eden-fragment", "ef-2", "corp:score");
    eden2.abilitiesBlanked = true;
    s2.cards["ef-2"] = eden2;
    s2.corp.scoreArea = ["ef-2"];
    const wall2 = instantiateCard("ice-wall", "wall-2", "corp:hq");
    s2.cards["wall-2"] = wall2;
    s2.corp.hand = ["wall-2"];
    s2.corp.credits = 20;
    const before2 = s2.corp.credits;
    const r2 = installCorp(s2, "wall-2", { kind: "protect", serverId: "hq" });
    expect(r2.ok).toBe(true);
    expect(before2 - s2.corp.credits).toBe(wall2.installCost);
  });

  it("drops DZMZ Optimizer first-program install discount while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const dzmz = instantiateCard("dzmz-optimizer", "dz-1", "runner:installed");
    s.cards["dz-1"] = dzmz;
    s.runner.installed = ["dz-1"];
    const prog = instantiateCard("corroder", "cor-1", "runner:hand");
    s.cards["cor-1"] = prog;
    const printed = prog.installCost;
    expect(runnerInstallCost(s, prog)).toBeLessThan(printed);
    dzmz.abilitiesBlanked = true;
    expect(runnerInstallCost(s, prog)).toBe(printed);
  });
});
