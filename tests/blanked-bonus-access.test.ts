/**
 * Blanked sources do not apply continuous bonus-access / breach credit
 * modifiers (CR 9.12.1d).
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
import { beginBreachAccess } from "../src/state/access.js";
import { breachCreditGain } from "../src/state/staticFlags.js";
import type { GameState, ServerId } from "../src/index.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

function hqRunState(): GameState {
  let s = createInitialState();
  s = structuredClone(s);
  for (const id of ["c1", "c2", "c3"] as const) {
    s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
  }
  s.corp.hand = ["c1", "c2", "c3"];
  s.turn.hqBreachesThisTurn = 1;
  s.run = {
    attackedServerId: "hq" as ServerId,
    phase: "breach",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
  return s;
}

describe("blanked bonus access / breach credits (CR 9.12.1d)", () => {
  it("drops HQ Interface bonus access while blanked", () => {
    const s = hqRunState();
    const hw = instantiateCard("hq-interface", "hqi", "runner:installed");
    s.cards["hqi"] = hw;
    s.runner.installed = ["hqi"];

    beginBreachAccess(s);
    expect(s.run!.bonusAccess).toBe(1);

    const blanked = hqRunState();
    const hw2 = instantiateCard("hq-interface", "hqi", "runner:installed");
    suppressAbilities(blanked, hw2.id);
    blanked.cards["hqi"] = hw2;
    blanked.runner.installed = ["hqi"];
    beginBreachAccess(blanked);
    expect(blanked.run!.bonusAccess ?? 0).toBe(0);
    expect(
      blanked.log.some((l) => l.includes("HQ Interface") && l.includes("+1")),
    ).toBe(false);
  });

  it("drops Docklands first-HQ-breach bonus while blanked", () => {
    const s = hqRunState();
    s.turn.hqBreachesThisTurn = 0;
    const pass = instantiateCard("docklands-pass", "dp-1", "runner:installed");
    pass.bonusAccessOnFirstHqBreachThisTurn = 1;
    s.cards["dp-1"] = pass;
    s.runner.installed = ["dp-1"];
    beginBreachAccess(s);
    expect(s.run!.accessCandidates.length).toBe(2);

    const blanked = hqRunState();
    blanked.turn.hqBreachesThisTurn = 0;
    const pass2 = instantiateCard("docklands-pass", "dp-1", "runner:installed");
    pass2.bonusAccessOnFirstHqBreachThisTurn = 1;
    suppressAbilities(blanked, pass2.id);
    blanked.cards["dp-1"] = pass2;
    blanked.runner.installed = ["dp-1"];
    beginBreachAccess(blanked);
    expect(blanked.run!.accessCandidates.length).toBe(1);
  });

  it("drops Manuel tagged HQ/R&D bonus while blanked", () => {
    const s = hqRunState();
    s.runner.tags = 1;
    const manuel = instantiateCard(
      "manuel-lattes-de-moura",
      "ml-1",
      "runner:installed",
    );
    s.cards["ml-1"] = manuel;
    s.runner.installed = ["ml-1"];
    beginBreachAccess(s);
    expect(s.run!.bonusAccess).toBeGreaterThan(0);

    const blanked = hqRunState();
    blanked.runner.tags = 1;
    const manuel2 = instantiateCard(
      "manuel-lattes-de-moura",
      "ml-1",
      "runner:installed",
    );
    suppressAbilities(blanked, manuel2.id);
    blanked.cards["ml-1"] = manuel2;
    blanked.runner.installed = ["ml-1"];
    beginBreachAccess(blanked);
    expect(blanked.run!.bonusAccess ?? 0).toBe(0);
  });

  it("drops Gauntlet fully-broken-ice bonus while blanked", () => {
    const s = hqRunState();
    const g = instantiateCard("the-gauntlet", "tg-1", "runner:installed");
    s.cards["tg-1"] = g;
    s.runner.installed = ["tg-1"];
    s.run!.inFullyBrokenHqProtectingIceIds = ["ice-1", "ice-2"];
    beginBreachAccess(s);
    expect(s.run!.accessCandidates.length).toBe(3);

    const blanked = hqRunState();
    const g2 = instantiateCard("the-gauntlet", "tg-1", "runner:installed");
    suppressAbilities(blanked, g2.id);
    blanked.cards["tg-1"] = g2;
    blanked.runner.installed = ["tg-1"];
    blanked.run!.inFullyBrokenHqProtectingIceIds = ["ice-1", "ice-2"];
    beginBreachAccess(blanked);
    expect(blanked.run!.accessCandidates.length).toBe(1);
  });

  it("drops Mwanza City Grid bonus access and breach credits while blanked", () => {
    const s = hqRunState();
    const mwanza = instantiateCard(
      "mwanza-city-grid",
      "mw-1",
      "server:hq:root",
    );
    mwanza.rezzed = true;
    s.cards["mw-1"] = mwanza;
    s.servers.hq.root = ["mw-1"];
    beginBreachAccess(s);
    expect(s.run!.bonusAccess).toBe(3);

    const blanked = hqRunState();
    const mwanza2 = instantiateCard(
      "mwanza-city-grid",
      "mw-1",
      "server:hq:root",
    );
    mwanza2.rezzed = true;
    suppressAbilities(blanked, mwanza2.id);
    blanked.cards["mw-1"] = mwanza2;
    blanked.servers.hq.root = ["mw-1"];
    beginBreachAccess(blanked);
    expect(blanked.run!.bonusAccess ?? 0).toBe(0);

    const credit = hqRunState();
    const mwCred = instantiateCard(
      "mwanza-city-grid",
      "mw-1",
      "server:hq:root",
    );
    mwCred.rezzed = true;
    credit.cards["mw-1"] = mwCred;
    credit.servers.hq.root = ["mw-1"];
    credit.run!.accessedCardIds = ["c1", "c2"];
    const before = credit.corp.credits;
    breachCreditGain(credit);
    expect(credit.corp.credits).toBeGreaterThan(before);

    const creditBlank = hqRunState();
    const mwCred2 = instantiateCard(
      "mwanza-city-grid",
      "mw-1",
      "server:hq:root",
    );
    mwCred2.rezzed = true;
    suppressAbilities(creditBlank, mwCred2.id);
    creditBlank.cards["mw-1"] = mwCred2;
    creditBlank.servers.hq.root = ["mw-1"];
    creditBlank.run!.accessedCardIds = ["c1", "c2"];
    const beforeBlank = creditBlank.corp.credits;
    breachCreditGain(creditBlank);
    expect(creditBlank.corp.credits).toBe(beforeBlank);
  });
});
