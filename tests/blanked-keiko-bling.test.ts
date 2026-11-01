/**
 * Blanked sources do not apply Keiko / Bling / Wasteland / Mark Yale /
 * Cyberdelia / Keros / Rime continuous helpers (CR 9.12.1d).
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
import { hostedPlayableAsGrip } from "../src/actions/installRunner.js";
import { maybeFireCompanionInstallOrSpendCredits } from "../src/state/companionHooks.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("blanked Keiko / Bling / credit triggers (CR 9.12.1d)", () => {
  it("drops Bling hosted-playable-as-grip while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bling = instantiateCard("bling", "bling-1", "runner:installed");
    s.cards["bling-1"] = bling;
    s.runner.installed = ["bling-1"];
    const hosted = instantiateCard("sure-gamble", "sg-1", "runner:installed");
    hosted.hostId = "bling-1";
    s.cards["sg-1"] = hosted;
    bling.hostedCardIds = ["sg-1"];

    expect(hostedPlayableAsGrip(s, "sg-1")).toBe("bling-1");
    bling.abilitiesBlanked = true;
    expect(hostedPlayableAsGrip(s, "sg-1")).toBeNull();
  });

  it("drops Keiko companion credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 0;
    const keiko = instantiateCard("keiko", "keiko-1", "runner:installed");
    s.cards["keiko-1"] = keiko;
    s.runner.installed = ["keiko-1"];

    maybeFireCompanionInstallOrSpendCredits(s);
    expect(s.runner.credits).toBeGreaterThan(0);

    const blanked = structuredClone(createInitialState());
    blanked.runner.credits = 0;
    const keiko2 = instantiateCard("keiko", "keiko-1", "runner:installed");
    keiko2.abilitiesBlanked = true;
    blanked.cards["keiko-1"] = keiko2;
    blanked.runner.installed = ["keiko-1"];
    maybeFireCompanionInstallOrSpendCredits(blanked);
    expect(blanked.runner.credits).toBe(0);
  });

  it("drops Wasteland first-trash credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const w = instantiateCard("wasteland", "w-1", "runner:installed");
    s.cards["w-1"] = w;
    s.runner.installed = ["w-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        (s.cards[id]?.gainCreditsOnFirstOwnInstalledTrashEachTurn ?? 0) > 0,
    );
    expect(active).toBe(true);
    w.abilitiesBlanked = true;
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          (s.cards[id]?.gainCreditsOnFirstOwnInstalledTrashEachTurn ?? 0) > 0,
      ),
    ).toBe(false);
  });

  it("drops Mark Yale agenda-counter credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const my = instantiateCard("mark-yale", "my-1", "server:hq:root");
    my.rezzed = true;
    s.cards["my-1"] = my;
    s.servers.hq.root = ["my-1"];

    const active = Object.values(s.cards).some(
      (c) =>
        c.rezzed &&
        c.side === "corp" &&
        !abilitiesSuppressed(s, c.id) &&
        (c.gainCreditsOnSpendAgendaCounter ?? 0) > 0,
    );
    expect(active).toBe(true);
    my.abilitiesBlanked = true;
    expect(
      Object.values(s.cards).some(
        (c) =>
          c.rezzed &&
          c.side === "corp" &&
          !abilitiesSuppressed(s, c.id) &&
          (c.gainCreditsOnSpendAgendaCounter ?? 0) > 0,
      ),
    ).toBe(false);
  });

  it("drops Cyberdelia first-full-break credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const cy = instantiateCard("cyberdelia", "cy-1", "runner:installed");
    s.cards["cy-1"] = cy;
    s.runner.installed = ["cy-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        (s.cards[id]?.gainCreditsOnFirstFullyBreakEachTurn ?? 0) > 0,
    );
    expect(active).toBe(true);
    cy.abilitiesBlanked = true;
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          (s.cards[id]?.gainCreditsOnFirstFullyBreakEachTurn ?? 0) > 0,
      ),
    ).toBe(false);
  });

  it("drops Keros McIntyre first-derez credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const k = instantiateCard("keros-mcintyre", "k-1", "runner:installed");
    s.cards["k-1"] = k;
    s.runner.installed = ["k-1"];

    const active = s.runner.installed.some(
      (id) =>
        !abilitiesSuppressed(s, id) &&
        (s.cards[id]?.gainCreditsOnFirstDerezIceEachTurn ?? 0) > 0,
    );
    expect(active).toBe(true);
    k.abilitiesBlanked = true;
    expect(
      s.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(s, id) &&
          (s.cards[id]?.gainCreditsOnFirstDerezIceEachTurn ?? 0) > 0,
      ),
    ).toBe(false);
  });

  it("drops Rime rez-as-non-ice while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const rime = instantiateCard("rime", "rime-1", "server:hq:ice");
    s.cards["rime-1"] = rime;
    s.servers.hq.ice = ["rime-1"];

    expect(rime.rezAsNonIceDuringRunsOnServer).toBe(true);
    expect(abilitiesSuppressed(s, "rime-1")).toBe(false);
    rime.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "rime-1")).toBe(true);
  });
});
