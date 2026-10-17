/**
 * Comprehensive Rules examples from chapter 4.
 * Each test plays that example's board. An example that already has a
 * test in a mechanism file stays in that file.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

describe("CR examples, chapter 4", () => {
    it("refuses a second remote while Earth Station's limit is already met (CR 4.6.8f.ex1)", () => {
    const s = createInitialState();
    s.cards[s.corp.identityId]!.maxRemoteServers = 1;
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["pad-1"] = pad;
    s.corp.hand = ["pad-1"];
    s.corp.clicks = 1;
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const refused = applyAction(s, {
      type: "basic_install",
      cardId: "pad-1",
      destination: { kind: "new_remote" },
    });
    expect(refused.ok).toBe(false);
    expect(Object.values(s.servers).filter((server) => server.kind === "remote")).toHaveLength(1);
  });
});
