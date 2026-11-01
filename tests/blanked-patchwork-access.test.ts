/**
 * Blanked sources do not apply Patchwork / Corporate Defector / Carnivore /
 * Imp / Salsette / Class Act / Cupellation mid-access helpers (CR 9.12.1d).
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
  carnivoreAvailable,
  findCupellationHost,
} from "../src/actions/access.js";
import { patchworkDiscountSource } from "../src/actions/play.js";
import { classActWouldDrawSource } from "../src/effects/draw.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked Patchwork / access helpers (CR 9.12.1d)", () => {
  it("drops Patchwork discount while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const pw = instantiateCard("patchwork", "pw-1", "runner:installed");
    s.cards["pw-1"] = pw;
    s.runner.installed = ["pw-1"];

    expect(patchworkDiscountSource(s)?.amount).toBeGreaterThan(0);
    pw.abilitiesBlanked = true;
    expect(patchworkDiscountSource(s)).toBeNull();
  });

  it("drops Corporate Defector reveal while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cd = instantiateCard(
      "corporate-defector",
      "cd-1",
      "runner:installed",
    );
    s.cards["cd-1"] = cd;
    s.runner.installed = ["cd-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        s.cards[id]?.revealCorpBasicActionDraws,
    );
    expect(active).toBe(true);
    cd.abilitiesBlanked = true;
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          s.cards[id]?.revealCorpBasicActionDraws,
      ),
    ).toBe(false);
  });

  it("drops Carnivore access-trash while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    for (const id of ["g1", "g2"] as const) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.runner.hand = ["g1", "g2"];
    const carn = instantiateCard("carnivore", "carn-1", "runner:installed");
    s.cards["carn-1"] = carn;
    s.runner.installed = ["carn-1"];

    expect(carnivoreAvailable(s)).toBe(true);
    carn.abilitiesBlanked = true;
    expect(carnivoreAvailable(s)).toBe(false);
  });

  it("drops Imp virus trash while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const imp = instantiateCard("imp", "imp-1", "runner:installed");
    imp.virusCounters = 2;
    s.cards["imp-1"] = imp;
    s.runner.installed = ["imp-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        s.cards[id]?.accessTrashWithVirus &&
        (s.cards[id]?.virusCounters ?? 0) >= 1,
    );
    expect(active).toBe(true);
    imp.abilitiesBlanked = true;
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          s.cards[id]?.accessTrashWithVirus &&
          (s.cards[id]?.virusCounters ?? 0) >= 1,
      ),
    ).toBe(false);
  });

  it("drops Salsette Slums RFG while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const slums = instantiateCard(
      "salsette-slums",
      "ss-1",
      "runner:installed",
    );
    s.cards["ss-1"] = slums;
    s.runner.installed = ["ss-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        s.cards[id]?.accessPayTrashCostRemoveFromGameOncePerTurn,
    );
    expect(active).toBe(true);
    slums.abilitiesBlanked = true;
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          s.cards[id]?.accessPayTrashCostRemoveFromGameOncePerTurn,
      ),
    ).toBe(false);
  });

  it("drops Class Act would-draw while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ca = instantiateCard("the-class-act", "ca-1", "runner:installed");
    s.cards["ca-1"] = ca;
    s.runner.installed = ["ca-1"];

    expect(classActWouldDrawSource(s)).toBe("ca-1");
    ca.abilitiesBlanked = true;
    expect(classActWouldDrawSource(s)).toBeNull();
  });

  it("drops Cupellation host while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 5;
    const cup = instantiateCard("cupellation", "cup-1", "runner:installed");
    s.cards["cup-1"] = cup;
    s.runner.installed = ["cup-1"];
    const accessed = instantiateCard("pad-campaign", "pad-1", "server:hq:root");
    s.cards["pad-1"] = accessed;
    s.servers.hq.root = ["pad-1"];
    s.run = {
      attackedServerId: "hq",
      accessingCardId: "pad-1",
    } as typeof s.run;

    expect(findCupellationHost(s)).toBe("cup-1");
    cup.abilitiesBlanked = true;
    expect(findCupellationHost(s)).toBeNull();
  });
});
