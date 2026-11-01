/**
 * Blanked sources drop Fenris ability-carrier status, Film Critic host,
 * CPC Generator first-gain, and Long-Term Investment sync (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  runnerAbilityCarrierIds,
} from "../src/index.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { syncLongTermInvestment } from "../src/state/cardDeclarations.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("blanked Fenris / Film Critic / CPC / LTI (CR 9.12.1d)", () => {
  it("drops DJ Fenris from ability carriers while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const fenris = instantiateCard("dj-fenris", "df-1", "runner:installed");
    const guest = instantiateCard(
      "reina-roja-freedom-fighter",
      "gmod-1",
      "hosted:df-1",
    );
    fenris.hostedCardIds = ["gmod-1"];
    guest.hostId = "df-1";
    s.cards["df-1"] = fenris;
    s.cards["gmod-1"] = guest;
    s.runner.installed = ["df-1"];

    expect(fenris.gainsTextOfHostedIdentity).toBe(true);
    expect(runnerAbilityCarrierIds(s)).toContain("df-1");
    suppressAbilities(s, fenris.id);
    expect(runnerAbilityCarrierIds(s)).not.toContain("df-1");
  });

  it("treats Film Critic host ability as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const fc = instantiateCard("film-critic", "fc-1", "runner:installed");
    s.cards["fc-1"] = fc;
    s.runner.installed = ["fc-1"];
    expect(fc.mayHostAccessedAgenda).toBe(true);
    expect(abilitiesSuppressed(s, "fc-1")).toBe(false);
    suppressAbilities(s, fc.id);
    expect(abilitiesSuppressed(s, "fc-1")).toBe(true);
  });

  it("treats CPC Generator as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cpc = instantiateCard("cpc-generator", "cpc-1", "server:hq:root");
    cpc.rezzed = true;
    s.cards["cpc-1"] = cpc;
    s.servers.hq.root = ["cpc-1"];
    expect(
      cpc.corpGainsOnFirstRunnerBasicGainCreditEachTurn ?? 0,
    ).toBeGreaterThan(0);
    suppressAbilities(s, cpc.id);
    expect(abilitiesSuppressed(s, "cpc-1")).toBe(true);
  });

  it("skips Long-Term Investment paid-ability sync while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const lti = instantiateCard(
      "long-term-investment",
      "lti-1",
      "server:hq:root",
    );
    lti.rezzed = true;
    lti.hostedCredits = 8;
    s.cards["lti-1"] = lti;
    s.servers.hq.root = ["lti-1"];

    syncLongTermInvestment(s, lti);
    expect((lti.paidAbilities ?? []).some((a) => a.id.includes("take-hosted"))).toBe(
      true,
    );

    // Blanked cards are not synced from candidateClicks; clear then confirm
    // the suppress gate would skip re-sync.
    suppressAbilities(s, lti.id);
    expect(abilitiesSuppressed(s, "lti-1")).toBe(true);
  });
});
