/**
 * Blanked sources drop Friday Chip virus placement and Progenitor's
 * one-virus purge prevent (CR 9.12.1d).
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
import {
  fireCotcOnCorpCardTrashed,
  purgeVirusCounters,
} from "../src/state/trashHooks.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked Friday Chip / Progenitor (CR 9.12.1d)", () => {
  it("drops Friday Chip virus while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const chip = instantiateCard("friday-chip", "fc-1", "runner:installed");
    s.cards["fc-1"] = chip;
    s.runner.installed = ["fc-1"];

    fireCotcOnCorpCardTrashed(s);
    expect(chip.virusCounters ?? 0).toBeGreaterThan(0);

    chip.virusCounters = 0;
    suppressAbilities(s, chip.id);
    expect(abilitiesSuppressed(s, "fc-1")).toBe(true);
    fireCotcOnCorpCardTrashed(s);
    expect(chip.virusCounters ?? 0).toBe(0);
  });

  it("drops Progenitor purge-keep while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const prog = instantiateCard("progenitor", "pr-1", "runner:installed");
    const virus = instantiateCard("datasucker", "ds-1", "runner:installed");
    virus.hostId = "pr-1";
    virus.virusCounters = 3;
    prog.hostedCardIds = ["ds-1"];
    s.cards["pr-1"] = prog;
    s.cards["ds-1"] = virus;
    s.runner.installed = ["pr-1", "ds-1"];

    purgeVirusCounters(s, "pr-1");
    expect(virus.virusCounters).toBe(1);

    virus.virusCounters = 3;
    suppressAbilities(s, prog.id);
    purgeVirusCounters(s, "pr-1");
    expect(virus.virusCounters).toBe(0);
  });
});
