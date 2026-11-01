/**
 * Blanked sources do not apply Clot / Interdiction / Hernando / Watchdog /
 * create-server credit locks / Heliamphora / NAT (CR 9.12.1d).
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
import {
  heliamphoraHostInsteadAvailable,
} from "../src/actions/access.js";
import {
  corpGainsCreditsOnCreateServerTotal,
  corpLosesCreditsOnCreateServerTotal,
} from "../src/actions/installCorp.js";
import {
  hernandoIceRezSurcharge,
  interdictionBlocksNonIceRez,
  watchdogFirstIceRezReduction,
} from "../src/actions/rez.js";
import { clotForbidsScoreAgendaInstalledThisTurn } from "../src/actions/score.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("blanked Clot / Interdiction / create-server (CR 9.12.1d)", () => {
  it("drops Clot score lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const clot = instantiateCard("clot", "clot-1", "runner:installed");
    s.cards["clot-1"] = clot;
    s.runner.installed = ["clot-1"];

    expect(clotForbidsScoreAgendaInstalledThisTurn(s)).toBe(true);
    suppressAbilities(s, clot.id);
    expect(clotForbidsScoreAgendaInstalledThisTurn(s)).toBe(false);
  });

  it("drops Interdiction non-ice rez lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cur = instantiateCard("interdiction", "int-1", "corp:play-area");
    s.cards["int-1"] = cur;
    s.corp.playArea = ["int-1"];

    expect(interdictionBlocksNonIceRez(s)).toBe(true);
    suppressAbilities(s, cur.id);
    expect(interdictionBlocksNonIceRez(s)).toBe(false);
  });

  it("drops Hernando ice rez surcharge while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 20;
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = false;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const hernando = instantiateCard(
      "hernando-cortez",
      "hc-1",
      "runner:installed",
    );
    s.cards["hc-1"] = hernando;
    s.runner.installed = ["hc-1"];

    expect(hernandoIceRezSurcharge(s, "iw-1")).toBeGreaterThan(0);
    suppressAbilities(s, hernando.id);
    expect(hernandoIceRezSurcharge(s, "iw-1")).toBe(0);
  });

  it("drops Watchdog first-ice rez reduction while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.tags = 2;
    s.turn.iceRezzedThisTurn = 0;
    const wd = instantiateCard("watchdog", "wd-1", "server:hq:root");
    wd.rezzed = true;
    s.cards["wd-1"] = wd;
    s.servers.hq.root = ["wd-1"];

    expect(watchdogFirstIceRezReduction(s)).toBe(2);
    suppressAbilities(s, wd.id);
    expect(watchdogFirstIceRezReduction(s)).toBe(0);
  });

  it("drops Hijacked Router create-server loss while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hr = instantiateCard("hijacked-router", "hr-1", "runner:installed");
    s.cards["hr-1"] = hr;
    s.runner.installed = ["hr-1"];

    expect(corpLosesCreditsOnCreateServerTotal(s)).toBeGreaterThan(0);
    suppressAbilities(s, hr.id);
    expect(corpLosesCreditsOnCreateServerTotal(s)).toBe(0);
  });

  it("drops Turtlebacks create-server gain while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tb = instantiateCard("turtlebacks", "tb-1", "server:hq:root");
    tb.rezzed = true;
    s.cards["tb-1"] = tb;
    s.servers.hq.root = ["tb-1"];

    expect(corpGainsCreditsOnCreateServerTotal(s)).toBeGreaterThan(0);
    suppressAbilities(s, tb.id);
    expect(corpGainsCreditsOnCreateServerTotal(s)).toBe(0);
  });

  it("drops Heliamphora host-instead while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "archives",
      position: "accessing",
      successful: true,
      heliamphoraHostInsteadUsedThisBreach: false,
    } as typeof s.run;
    const hel = instantiateCard("heliamphora", "hel-1", "runner:installed");
    s.cards["hel-1"] = hel;
    s.runner.installed = ["hel-1"];

    expect(heliamphoraHostInsteadAvailable(s)).toBe(true);
    suppressAbilities(s, hel.id);
    expect(heliamphoraHostInsteadAvailable(s)).toBe(false);
    expect(abilitiesSuppressed(s, "hel-1")).toBe(true);
  });

  it("drops Neutralize All Threats force-trash while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const nat = instantiateCard(
      "neutralize-all-threats",
      "nat-1",
      "runner:installed",
    );
    s.cards["nat-1"] = nat;
    s.runner.installed = ["nat-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        s.cards[id]?.mustTrashFirstAccessedCardWithTrashCostEachTurn,
    );
    expect(active).toBe(true);
    suppressAbilities(s, nat.id);
    const blanked = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        s.cards[id]?.mustTrashFirstAccessedCardWithTrashCostEachTurn,
    );
    expect(blanked).toBe(false);
  });
});
