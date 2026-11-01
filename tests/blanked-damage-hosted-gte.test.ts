/**
 * Blanked sources drop Sentinel Defense / Respirocytes pending marks and
 * Side Hustle hosted-credit thresholds (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  resolveDamage,
} from "../src/index.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { maybeFireFirstEmptyGripTriggers } from "../src/state/damage.js";
import { maybeFireHostedCreditsGte } from "../src/state/hostedCredits.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("blanked damage / hosted-credits threshold (CR 9.12.1d)", () => {
  it("drops Sentinel Defense pending while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const sdp = instantiateCard(
      "sentinel-defense-program",
      "sdp-1",
      "corp:score-area",
    );
    s.cards["sdp-1"] = sdp;
    s.corp.scoreArea = ["sdp-1"];
    // Grip fillers so core damage does not flatline.
    for (let i = 0; i < 5; i++) {
      const id = `grip-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }

    resolveDamage(s, "core", 1, null);
    expect(
      s.log.some(
        (line) =>
          line.includes("Sentinel Defense Program") &&
          line.includes("becomes pending"),
      ),
    ).toBe(true);

    s = createInitialState();
    s = structuredClone(s);
    const sdp2 = instantiateCard(
      "sentinel-defense-program",
      "sdp-2",
      "corp:score-area",
    );
    suppressAbilities(s, sdp2.id);
    s.cards["sdp-2"] = sdp2;
    s.corp.scoreArea = ["sdp-2"];
    for (let i = 0; i < 5; i++) {
      const id = `grip2-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    expect(abilitiesSuppressed(s, "sdp-2")).toBe(true);
    resolveDamage(s, "core", 1, null);
    expect(
      s.log.some(
        (line) =>
          line.includes("Sentinel Defense Program") &&
          line.includes("becomes pending"),
      ),
    ).toBe(false);
  });

  it("drops Respirocytes empty-grip pending while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const resp = instantiateCard("respirocytes", "resp-1", "runner:installed");
    s.cards["resp-1"] = resp;
    s.runner.installed = ["resp-1"];
    s.runner.hand = [];
    maybeFireFirstEmptyGripTriggers(s);
    expect(
      s.log.some(
        (line) =>
          line.includes("Respirocytes") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    s = createInitialState();
    s = structuredClone(s);
    const resp2 = instantiateCard("respirocytes", "resp-2", "runner:installed");
    suppressAbilities(s, resp2.id);
    s.cards["resp-2"] = resp2;
    s.runner.installed = ["resp-2"];
    s.runner.hand = [];
    expect(abilitiesSuppressed(s, "resp-2")).toBe(true);
    maybeFireFirstEmptyGripTriggers(s);
    expect(
      s.log.some(
        (line) =>
          line.includes("Respirocytes") && line.includes("becomes pending"),
      ),
    ).toBe(false);
  });

  it("drops Side Hustle hosted-credits threshold while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hustle = instantiateCard("side-hustle", "sh-1", "runner:installed");
    hustle.hostedCredits = 6;
    s.cards["sh-1"] = hustle;
    s.runner.installed = ["sh-1"];
    s.runner.credits = 0;

    maybeFireHostedCreditsGte(s, "sh-1");
    expect(hustle.hostedCredits).toBe(0);
    expect(s.runner.credits).toBe(6);

    hustle.hostedCredits = 6;
    suppressAbilities(s, hustle.id);
    s.runner.credits = 0;
    expect(abilitiesSuppressed(s, "sh-1")).toBe(true);
    maybeFireHostedCreditsGte(s, "sh-1");
    expect(hustle.hostedCredits).toBe(6);
    expect(s.runner.credits).toBe(0);
  });
});
