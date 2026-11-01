/**
 * Blanked sources do not contribute recurringSpendFor pools or related
 * first-* continuous helpers (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  recurringCreditsForCentralRun,
  runnerCreditsFor,
  spendRunnerCreditsFor,
} from "../src/index.js";
import {
  applyRezIceRecurringTowardCorpRez,
} from "../src/cards/stubs.js";
import { creditsAvailableForInstall } from "../src/state/costs.js";
import { firstClickMustIsActive } from "../src/state/firstClickMust.js";
import { corpCreditsForTrace } from "../src/state/trace.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked recurring spend / first-* (CR 9.12.1d)", () => {
  it("drops Cyberfeeder install_virus pool while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cf = instantiateCard("cyberfeeder", "cf-1", "runner:installed");
    cf.recurringCredits = 1;
    s.cards["cf-1"] = cf;
    s.runner.installed = ["cf-1"];
    s.runner.credits = 0;
    const virus = instantiateCard("datasucker", "ds-1", "runner:grip");

    expect(creditsAvailableForInstall(s, "runner", virus)).toBe(1);
    suppressAbilities(s, cf.id);
    expect(creditsAvailableForInstall(s, "runner", virus)).toBe(0);
  });

  it("drops Cezve run_central pool while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cezve = instantiateCard("cezve", "cz-1", "runner:installed");
    cezve.recurringCredits = 2;
    cezve.recurringSpendFor = ["run_central"];
    s.cards["cz-1"] = cezve;
    s.runner.installed = ["cz-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      successful: false,
      ended: false,
    };

    expect(recurringCreditsForCentralRun(s)).toBe(2);
    suppressAbilities(s, cezve.id);
    expect(recurringCreditsForCentralRun(s)).toBe(0);
  });

  it("drops trash recurring spend while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const az = instantiateCard("azimat", "az-1", "runner:installed");
    az.recurringCredits = 2;
    s.cards["az-1"] = az;
    s.runner.installed = ["az-1"];
    s.runner.credits = 0;

    expect(runnerCreditsFor(s, "trash")).toBe(2);
    spendRunnerCreditsFor(s, 1, "trash");
    expect(az.recurringCredits).toBe(1);

    suppressAbilities(s, az.id);
    az.recurringCredits = 2;
    expect(runnerCreditsFor(s, "trash")).toBe(0);
    spendRunnerCreditsFor(s, 1, "trash");
    expect(az.recurringCredits).toBe(2);
  });

  it("drops Dedicated Server rez_ice recurring while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ds = instantiateCard("dedicated-server", "ds-1", "server:hq:root");
    ds.rezzed = true;
    ds.recurringCredits = 2;
    s.cards["ds-1"] = ds;
    s.servers.hq.root = ["ds-1"];

    expect(applyRezIceRecurringTowardCorpRez(s, 2)).toBe(0);
    expect(ds.recurringCredits).toBe(0);

    ds.recurringCredits = 2;
    suppressAbilities(s, ds.id);
    expect(applyRezIceRecurringTowardCorpRez(s, 2)).toBe(2);
    expect(ds.recurringCredits).toBe(2);
  });

  it("drops Making News trace recurring while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = instantiateCard("nbn-making-news", "nbn-id", "corp:identity");
    id.recurringCredits = 2;
    s.cards["nbn-id"] = id;
    s.corp.identityId = "nbn-id";
    s.corp.credits = 0;

    expect(corpCreditsForTrace(s)).toBe(2);
    suppressAbilities(s, id.id);
    expect(corpCreditsForTrace(s)).toBe(0);
  });

  it("drops Always Be Running first-click must while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const abr = instantiateCard("always-be-running", "abr-1", "runner:installed");
    s.cards["abr-1"] = abr;
    s.runner.installed = ["abr-1"];
    s.activeSide = "runner";
    s.turn.runnerClicksSpentThisTurn = 0;

    expect(firstClickMustIsActive(s)).toBe(true);
    suppressAbilities(s, abr.id);
    expect(firstClickMustIsActive(s)).toBe(false);
  });
});
