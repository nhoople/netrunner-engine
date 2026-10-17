/**
 * Comprehensive Rules examples from chapter 2.
 * Each test plays that example's board. An example that already has a
 * test in a mechanism file stays in that file.
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
import { recomputeRunnerLink } from "../src/state/trashHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
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
});
