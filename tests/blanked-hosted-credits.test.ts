/**
 * Blanked sources do not contribute hosted-credit spend pools or related
 * first-event place helpers (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  hostedCreditsSpendableDuringRuns,
  instantiateCard,
} from "../src/index.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import {
  creditsAvailableForInstall,
  hostedCreditsSpendableToUseProgramsDuringRuns,
  spendHostedCreditsDuringRuns,
} from "../src/state/costs.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked hosted credits (CR 9.12.1d)", () => {
  it("drops Ghost Runner spend-during-run pool while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ghost = instantiateCard("ghost-runner", "gh-1", "runner:installed");
    ghost.hostedCredits = 3;
    s.cards["gh-1"] = ghost;
    s.runner.installed = ["gh-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: false,
      ended: false,
    };

    expect(hostedCreditsSpendableDuringRuns(s)).toBe(3);
    expect(spendHostedCreditsDuringRuns(s, 1)).toBe(0);
    expect(ghost.hostedCredits).toBe(2);

    ghost.abilitiesBlanked = true;
    ghost.hostedCredits = 3;
    expect(hostedCreditsSpendableDuringRuns(s)).toBe(0);
    expect(spendHostedCreditsDuringRuns(s, 1)).toBe(1);
    expect(ghost.hostedCredits).toBe(3);
  });

  it("drops Trickster Taka use-program hosted pool while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const taka = instantiateCard("trickster-taka", "taka-1", "runner:installed");
    taka.hostedCredits = 2;
    s.cards["taka-1"] = taka;
    s.runner.installed = ["taka-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "encounter_ice",
      position: 0,
      successful: false,
      ended: false,
    };

    expect(hostedCreditsSpendableToUseProgramsDuringRuns(s)).toBe(2);
    taka.abilitiesBlanked = true;
    expect(hostedCreditsSpendableToUseProgramsDuringRuns(s)).toBe(0);
  });

  it("drops Cybersand hosted install spend while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cyber = instantiateCard(
      "cybersand-harvester",
      "cs-1",
      "server:hq:root",
    );
    cyber.rezzed = true;
    cyber.hostedCredits = 4;
    cyber.hostedCreditsSpendFor = ["install"];
    s.cards["cs-1"] = cyber;
    s.servers.hq.root = ["cs-1"];
    s.corp.credits = 0;
    const ice = instantiateCard("ice-wall", "iw-1", "corp:hq");

    expect(creditsAvailableForInstall(s, "corp", ice)).toBe(4);
    cyber.abilitiesBlanked = true;
    expect(creditsAvailableForInstall(s, "corp", ice)).toBe(0);
  });

  it("treats Debbie as suppressed for hostedCreditsOnRunEventPlay while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const deb = instantiateCard(
      "debbie-downtown-moreira",
      "deb-1",
      "runner:installed",
    );
    s.cards["deb-1"] = deb;
    s.runner.installed = ["deb-1"];
    expect(deb.hostedCreditsOnRunEventPlay ?? 0).toBeGreaterThan(0);
    expect(abilitiesSuppressed(s, "deb-1")).toBe(false);
    deb.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "deb-1")).toBe(true);
  });
});
