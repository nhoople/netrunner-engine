/**
 * Reign and Reverie v1.85.0 J-slice: Blockchain / Peeping Tom / Daruma /
 * Hangeki / Acme Consulting.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "blockchain",
  "peeping-tom",
  "daruma",
  "hangeki",
  "acme-consulting-the-truth-you-need",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.145.0");
});

describe("Reign and Reverie v1.85.0 J-slice", () => {
  it("declares reign-and-reverie supported with at least 55 RaR-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["reign-and-reverie"].cards) {
      const def = getCardDef(id);
      if (
        (def.unsupported ?? []).length === 0 &&
        def.wave === "reign-and-reverie"
      ) {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(55);
  });

  it("loads five clear J-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
    }
  });

  it("Blockchain: gainsSubroutinesBeforePrintedPerFaceupArchives + printed subs", () => {
    const def = getCardDef("blockchain");
    expect(def.gainsSubroutinesBeforePrintedPerFaceupArchives).toMatchObject({
      subtype: "transaction",
      type: "operation",
      per: 2,
    });
    expect(
      validateEffectTree(
        def.gainsSubroutinesBeforePrintedPerFaceupArchives!.subroutine.effect,
      ),
    ).toBeNull();
    expect(def.subroutines).toHaveLength(2);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
    expect(JSON.stringify(def.subroutines![1]!.effect)).toContain(
      "end_the_run",
    );
  });

  it("Peeping Tom: empty subs + choose_type_reveal_gain_etr_unless_tag_for_run", () => {
    const def = getCardDef("peeping-tom");
    expect(def.subroutines ?? []).toEqual([]);
    expect(JSON.stringify(def.onEncounter)).toContain(
      "choose_type_reveal_gain_etr_unless_tag_for_run",
    );
    expect(validateEffectTree(def.onEncounter!)).toBeNull();
  });

  it("Daruma: onApproachServer + daruma_swap + offer_jack_out onSuccess", () => {
    const def = getCardDef("daruma");
    expect(def.onApproachServer).toBeTruthy();
    expect(JSON.stringify(def.onApproachServer)).toContain(
      "swap_this_root_with_other_root_or_hq",
    );
    expect(JSON.stringify(def.onApproachServer)).toContain("offer_jack_out");
    expect(JSON.stringify(def.onApproachServer)).toContain("onSuccess");
    expect(validateEffectTree(def.onApproachServer!)).toBeNull();
  });

  it("Hangeki: trash-only play gate + corp installed + may-access", () => {
    const def = getCardDef("hangeki");
    expect(def.playRequiresRunnerTrashedCorpCardLastTurn).toBe(true);
    expect(def.playRequiresCorpHasInstalledCard).toBe(true);
    expect(JSON.stringify(def.onPlay)).toContain(
      "choose_installed_runner_may_access",
    );
    expect(JSON.stringify(def.onPlay)).toContain("rfg_self");
    expect(JSON.stringify(def.onPlay)).toContain(
      "add_to_runner_score_as_agenda",
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Acme Consulting: additionalTagsDuringOutermostIceEncounter", () => {
    const def = getCardDef("acme-consulting-the-truth-you-need");
    expect(def.additionalTagsDuringOutermostIceEncounter).toBe(1);
    expect(def.type).toBe("identity");
    expect(def.side).toBe("corp");
  });
});
