/**
 * Blanked sources drop power-counter thresholds, place-on-install/rez
 * helpers, and Envelopment ETR-per-power rebuilds (CR 9.12.1d).
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
import { abilitiesSuppressed } from "../src/state/abilities.js";
import {
  fireHostedCreditsOnAnyIceRez,
  firePowerCounterOnAnyCardRez,
  firePowerCounterOnAnyCorpInstall,
  maybeFirePowerCountersGte,
  syncEtrPerPowerCounterSubs,
} from "../src/state/powerCounters.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.18");
});

describe("blanked power counters (CR 9.12.1d)", () => {
  it("drops Environmental Testing threshold while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const et = instantiateCard(
      "environmental-testing",
      "et-1",
      "runner:installed",
    );
    et.powerCounters = 4;
    s.cards["et-1"] = et;
    s.runner.installed = ["et-1"];
    s.runner.credits = 0;

    maybeFirePowerCountersGte(s, "et-1");
    expect(s.runner.credits).toBe(9);
    expect(et.zone).toBe("runner:heap");

    s = createInitialState();
    s = structuredClone(s);
    const et2 = instantiateCard(
      "environmental-testing",
      "et-2",
      "runner:installed",
    );
    et2.powerCounters = 4;
    suppressAbilities(s, et2.id);
    s.cards["et-2"] = et2;
    s.runner.installed = ["et-2"];
    s.runner.credits = 0;
    expect(abilitiesSuppressed(s, "et-2")).toBe(true);
    maybeFirePowerCountersGte(s, "et-2");
    expect(s.runner.credits).toBe(0);
    expect(et2.zone).toBe("runner:installed");
    expect(et2.powerCounters).toBe(4);
  });

  it("drops Alix place-on-Corp-install while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const alix = instantiateCard("alix-t4lb07", "alix-1", "server:hq:root");
    alix.rezzed = true;
    alix.powerCounters = 0;
    s.cards["alix-1"] = alix;
    s.servers.hq.root = ["alix-1"];
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    s.cards["pad-1"] = pad;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      root: ["pad-1"],
      ice: [],
    } as (typeof s.servers)["hq"];

    firePowerCounterOnAnyCorpInstall(s, "pad-1");
    expect(alix.powerCounters).toBe(1);

    alix.powerCounters = 0;
    suppressAbilities(s, alix.id);
    expect(abilitiesSuppressed(s, "alix-1")).toBe(true);
    firePowerCounterOnAnyCorpInstall(s, "pad-1");
    expect(alix.powerCounters).toBe(0);
  });

  it("drops Working Prototype place-on-rez while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const wp = instantiateCard(
      "working-prototype",
      "wp-1",
      "server:hq:root",
    );
    wp.rezzed = true;
    wp.powerCounters = 0;
    s.cards["wp-1"] = wp;
    s.servers.hq.root = ["wp-1"];
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];

    firePowerCounterOnAnyCardRez(s, "iw-1");
    expect(wp.powerCounters).toBe(1);

    wp.powerCounters = 0;
    suppressAbilities(s, wp.id);
    expect(abilitiesSuppressed(s, "wp-1")).toBe(true);
    firePowerCounterOnAnyCardRez(s, "iw-1");
    expect(wp.powerCounters).toBe(0);
  });

  it("drops Envelopment ETR-per-power while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const env = instantiateCard("envelopment", "env-1", "server:hq:ice");
    env.rezzed = true;
    env.powerCounters = 3;
    env.baseSubroutines = env.subroutines
      ? structuredClone(env.subroutines)
      : [];
    s.cards["env-1"] = env;
    s.servers.hq.ice = ["env-1"];

    syncEtrPerPowerCounterSubs(env, s);
    const withPower = (env.subroutines ?? []).length;
    expect(withPower).toBeGreaterThan((env.baseSubroutines ?? []).length);

    suppressAbilities(s, env.id);
    expect(abilitiesSuppressed(s, "env-1")).toBe(true);
    syncEtrPerPowerCounterSubs(env, s);
    expect((env.subroutines ?? []).length).toBe((env.baseSubroutines ?? []).length);
  });

  it("drops Cybersand place-credits-on-ice-rez while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cyber = instantiateCard(
      "cybersand-harvester",
      "cs-1",
      "server:hq:root",
    );
    cyber.rezzed = true;
    cyber.hostedCredits = 0;
    s.cards["cs-1"] = cyber;
    s.servers.hq.root = ["cs-1"];
    const ice = instantiateCard("ice-wall", "iw-2", "server:rd:ice");
    ice.rezzed = true;
    s.cards["iw-2"] = ice;
    s.servers.rd.ice = ["iw-2"];

    fireHostedCreditsOnAnyIceRez(s, "iw-2");
    expect((cyber.hostedCredits ?? 0) > 0).toBe(true);

    const before = cyber.hostedCredits ?? 0;
    suppressAbilities(s, cyber.id);
    expect(abilitiesSuppressed(s, "cs-1")).toBe(true);
    fireHostedCreditsOnAnyIceRez(s, "iw-2");
    expect(cyber.hostedCredits).toBe(before);
  });
});
