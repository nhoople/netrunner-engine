/**
 * Blanked sources drop Reaver / Hostile Infrastructure / first-* trash
 * helpers behind abilitiesSuppressed (CR 9.12.1d).
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
import { abilitiesSuppressed } from "../src/state/abilities.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked trashHooks first-* (CR 9.12.1d)", () => {
  it("treats Reaver draw as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const reaver = instantiateCard("reaver", "rv-1", "runner:installed");
    s.cards["rv-1"] = reaver;
    s.runner.installed = ["rv-1"];
    expect(reaver.drawOnFirstTrashInstalledEachTurn).toBe(true);
    reaver.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "rv-1")).toBe(true);
  });

  it("treats Hostile Infrastructure net damage as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hi = instantiateCard(
      "hostile-infrastructure",
      "hi-1",
      "server:hq:root",
    );
    hi.rezzed = true;
    s.cards["hi-1"] = hi;
    s.servers.hq.root = ["hi-1"];
    expect(hi.netDamageWheneverRunnerTrashesCorpCard ?? 0).toBeGreaterThan(0);
    hi.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "hi-1")).toBe(true);
  });
});
