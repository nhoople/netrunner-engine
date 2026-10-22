/**
 * Comprehensive Rules examples from chapter 2.
 * Each test plays that example's board.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceSubtypes,
  instantiateCard,
} from "../src/index.js";
import { recomputeRunnerLink } from "../src/state/trashHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.11");
});

describe("CR examples, chapter 2", () => {
  it("starts the Runner at the identity's printed base link (CR 2.9.1)", () => {
    const s = createInitialState();
    expect(s.runner.link).toBe(s.cards["runner-id"]?.link ?? 0);
    s.cards["runner-id"]!.link = 1;
    const extra = instantiateCard("sure-gamble", "link-1", "runner:installed");
    extra.link = 2;
    s.cards["link-1"] = extra;
    s.runner.installed = ["link-1"];
    recomputeRunnerLink(s);
    expect(s.runner.link).toBe(3);
  });

  it("keeps Lycan a sentry after Tinkering and one advancement (CR 2.16.5.ex1)", () => {
    const s = createInitialState();
    const lycan = instantiateCard("lycan", "lycan-1", "server:hq:ice");
    lycan.rezzed = true;
    lycan.advancementCounters = 1;
    lycan.grantedSubtypesUntilEndOfTurn = ["sentry", "code gate", "barrier"];
    s.cards["lycan-1"] = lycan;
    s.servers.hq.ice = ["lycan-1"];
    const subtypes = effectiveIceSubtypes(s, "lycan-1");
    expect(subtypes).toContain("sentry");
    expect(subtypes).toContain("code gate");
  });
});
