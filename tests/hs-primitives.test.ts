/**
 * Humanity's Shadow primitive smoke — IR kinds + field wiring.
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
  assertCardsPinnedTag("v1.129.0");
});

describe("HS primitives IR validate", () => {
  it("accepts Surge / Replicator / Data Hound / Kraken / Foxfire kinds", () => {
    expect(
      validateEffectTree(
        fx.placeVirusOnProgramThatReceivedVirusThisTurn(2),
      ),
    ).toBeNull();
    expect(
      validateEffectTree(
        fx.maySearchStackCopyOfLastInstalledHardwareAddToGrip(),
      ),
    ).toBeNull();
    expect(
      validateEffectTree(fx.lookTopLastTraceExcessStackTrashOneArrangeRest()),
    ).toBeNull();
    expect(
      validateEffectTree(fx.chooseServerCorpTrashIceProtecting()),
    ).toBeNull();
    expect(
      validateEffectTree(fx.trashVirtualResourceOrLinkCard("choose")),
    ).toBeNull();
    expect(
      validateEffectTree({
        op: "seq",
        effects: [
          { op: "prevent", forbid: "jack_out" },
          fx.trashSelf(),
        ],
      }),
    ).toBeNull();
  });
});
