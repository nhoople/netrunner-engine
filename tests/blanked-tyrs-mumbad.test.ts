/**
 * Blanked sources do not open Tyr's Hand break interrupts or force
 * Mumbad Virtual Tour trash (CR 9.12.1d).
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
import { resolveTyrsHandRezDuringBreakInterrupt } from "../src/actions/breakSubroutine.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked Tyr's Hand / Mumbad Virtual Tour (CR 9.12.1d)", () => {
  it("rejects Tyr's Hand rez interrupt while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("heimdall-1-0", "hm-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["hm-1"] = ice;
    s.servers.hq.ice = ["hm-1"];
    const tyr = instantiateCard("tyrs-hand", "th-1", "server:hq:root");
    tyr.rezzed = false;
    s.cards["th-1"] = tyr;
    s.servers.hq.root = ["th-1"];
    s.corp.credits = 10;
    s.pendingSubroutineBreak = {
      iceId: "hm-1",
      subIndex: 0,
      expectedEffects: { breakSubroutine: { iceId: "hm-1", subIndex: 0 } },
    };

    const ok = resolveTyrsHandRezDuringBreakInterrupt(s, "th-1");
    expect(ok.ok).toBe(true);

    // Reset and blank.
    tyr.rezzed = false;
    s.pendingSubroutineBreak = {
      iceId: "hm-1",
      subIndex: 0,
      expectedEffects: { breakSubroutine: { iceId: "hm-1", subIndex: 0 } },
    };
    tyr.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "th-1")).toBe(true);
    const blocked = resolveTyrsHandRezDuringBreakInterrupt(s, "th-1");
    expect(blocked.ok).toBe(false);
  });

  it("treats Mumbad Virtual Tour as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tour = instantiateCard(
      "mumbad-virtual-tour",
      "mvt-1",
      "server:hq:root",
    );
    tour.rezzed = true;
    s.cards["mvt-1"] = tour;
    s.servers.hq.root = ["mvt-1"];
    expect(tour.mustTrashWhenAccessedWhileInstalled).toBe(true);
    expect(abilitiesSuppressed(s, "mvt-1")).toBe(false);
    tour.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "mvt-1")).toBe(true);
  });
});
