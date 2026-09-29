/**
 * Elevation v1.10.0: MuslihaT / Nebula / Petty Cash / Zwicky / Magdalene / Peer Review.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "muslihat-multifarious-marketeer",
  "nebula-talent-management-making-stars",
  "petty-cash",
  "the-zwicky-group-invisible-hands",
  "magdalene-keino-chemutai-cryptarchitect",
  "peer-review",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.60.0");
});

describe("Elevation v1.10.0 B-slice", () => {
  it("declares 66 clear elevation cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["elevation"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(66);
  });

  it("loads six newly mapped cards clear", () => {
    for (const id of CLEAR) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });

  it("MuslihaT turn begin look-top reveal breaker/run event IR", () => {
    const c = getCardDef("muslihat-multifarious-marketeer");
    expect(JSON.stringify(c.onTurnBegin)).toContain(
      "look_top_stack_may_reveal_breaker_or_run_event",
    );
    expect(validateEffectTree(c.onTurnBegin!)).toBeNull();
  });

  it("Nebula action phase end flip + flipped hooks", () => {
    const c = getCardDef("nebula-talent-management-making-stars");
    expect(JSON.stringify(c.onCorpActionPhaseEnd)).toContain(
      "corp_played_operation_this_turn",
    );
    expect(JSON.stringify(c.onCorpActionPhaseEnd)).toContain("flip_identity");
    expect(c.identityFlippedHooks?.onFirstOperationPlayThisTurn).toBeDefined();
    expect(validateEffectTree(c.onCorpActionPhaseEnd!)).toBeNull();
  });

  it("Petty Cash gate + Archives paid ability", () => {
    const c = getCardDef("petty-cash");
    expect(c.playRequiresNoCorpActionFinished).toBe(true);
    expect(JSON.stringify(c.onPlay)).toContain("played_from_non_hq");
    expect(c.paidAbilities?.[0]?.usableFromArchives).toBe(true);
    expect(JSON.stringify(c.paidAbilities?.[0]?.effect)).toContain(
      "play_self_from_archives_then_rfg",
    );
  });

  it("Peer Review single onPlay primitive", () => {
    const c = getCardDef("peer-review");
    expect(JSON.stringify(c.onPlay)).toContain("peer_review");
    expect(validateEffectTree(c.onPlay!)).toBeNull();
  });
});
