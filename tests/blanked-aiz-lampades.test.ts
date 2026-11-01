/**
 * Blanked sources do not apply AIZ / Hacktivist / Clot-candidate /
 * Lampades / Gourmand / Open Forum (CR 9.12.1d).
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
import { amazonIndustrialZoneDiscount } from "../src/actions/installCorp.js";
import {
  hacktivistMeetingRequiresHqTrash,
} from "../src/actions/rez.js";
import { clotForbidsScoreAgendaInstalledThisTurn } from "../src/actions/score.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import type { ServerId } from "../src/index.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("blanked AIZ / Hacktivist / Lampades / Gourmand (CR 9.12.1d)", () => {
  it("drops Amazon Industrial Zone discount while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const aiz = instantiateCard(
      "amazon-industrial-zone",
      "aiz-1",
      "server:hq:root",
    );
    aiz.rezzed = true;
    s.cards["aiz-1"] = aiz;
    s.servers.hq.root = ["aiz-1"];

    expect(amazonIndustrialZoneDiscount(s, "hq" as ServerId)).not.toBeNull();
    suppressAbilities(s, aiz.id);
    expect(amazonIndustrialZoneDiscount(s, "hq" as ServerId)).toBeNull();
  });

  it("drops Hacktivist Meeting HQ-trash lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hm = instantiateCard(
      "hacktivist-meeting",
      "hm-1",
      "corp:play-area",
    );
    s.cards["hm-1"] = hm;
    s.corp.playArea = ["hm-1"];

    expect(hacktivistMeetingRequiresHqTrash(s)).toBe(true);
    suppressAbilities(s, hm.id);
    expect(hacktivistMeetingRequiresHqTrash(s)).toBe(false);
  });

  it("drops Clot score lock while blanked (shared helper)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const clot = instantiateCard("clot", "clot-1", "runner:installed");
    s.cards["clot-1"] = clot;
    s.runner.installed = ["clot-1"];

    expect(clotForbidsScoreAgendaInstalledThisTurn(s)).toBe(true);
    suppressAbilities(s, clot.id);
    expect(clotForbidsScoreAgendaInstalledThisTurn(s)).toBe(false);
  });

  it("drops Lampades stealth trash while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const lamp = instantiateCard("lampades", "lamp-1", "runner:installed");
    lamp.powerCounters = 1;
    s.cards["lamp-1"] = lamp;
    s.runner.installed = ["lamp-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        s.cards[id]?.accessTrashPayingPrintedCostFromStealth &&
        (s.cards[id]?.powerCounters ?? 0) >= 1,
    );
    expect(active).toBe(true);
    suppressAbilities(s, lamp.id);
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          s.cards[id]?.accessTrashPayingPrintedCostFromStealth &&
          (s.cards[id]?.powerCounters ?? 0) >= 1,
      ),
    ).toBe(false);
  });

  it("drops Gourmand trash-self while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const g = instantiateCard("gourmand", "g-1", "runner:installed");
    s.cards["g-1"] = g;
    s.runner.installed = ["g-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        s.cards[id]?.accessTrashSelfNonAgendaThenDraw,
    );
    expect(active).toBe(true);
    suppressAbilities(s, g.id);
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          s.cards[id]?.accessTrashSelfNonAgendaThenDraw,
      ),
    ).toBe(false);
  });

  it("drops Open Forum after-mandatory-draw while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const of = instantiateCard("open-forum", "of-1", "server:hq:root");
    of.rezzed = true;
    s.cards["of-1"] = of;
    s.servers.hq.root = ["of-1"];

    const active = Object.values(s.servers).some((server) =>
      server.root.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          s.cards[id]?.rezzed &&
          s.cards[id]?.afterMandatoryDraw,
      ),
    );
    expect(active).toBe(true);
    suppressAbilities(s, of.id);
    expect(
      Object.values(s.servers).some((server) =>
        server.root.some(
          (id) =>
            !abilitiesSuppressed(s, id) &&
            s.cards[id]?.rezzed &&
            s.cards[id]?.afterMandatoryDraw,
        ),
      ),
    ).toBe(false);
  });
});
