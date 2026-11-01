/**
 * Blanked sources drop Wage Workers click-gain and pass-ice pending marks
 * (CR 9.12.1d).
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
import { noteCorpActionType } from "../src/state/corpActionHooks.js";
import {
  fireOnPassRezzedIceProtectingThisServer,
  fireOnPassUnrezzedIce,
} from "../src/state/runTimingHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked Wage Workers / pass-ice hooks (CR 9.12.1d)", () => {
  it("drops Wage Workers click gain while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "corp";
    const ww = instantiateCard("wage-workers", "ww-1", "server:hq:root");
    ww.rezzed = true;
    s.cards["ww-1"] = ww;
    s.servers.hq.root = ["ww-1"];
    s.corp.clicks = 0;
    s.turn.corpActionTypeCounts = { basic_action: 2 };

    noteCorpActionType(s, "basic_action");
    expect(s.corp.clicks).toBe(1);

    s.corp.clicks = 0;
    s.turn.corpActionTypeCounts = { basic_action: 2 };
    ww.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "ww-1")).toBe(true);
    noteCorpActionType(s, "basic_action");
    expect(s.corp.clicks).toBe(0);
  });

  it("drops False Echo pending while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const echo = instantiateCard("false-echo", "fe-1", "runner:installed");
    s.cards["fe-1"] = echo;
    s.runner.installed = ["fe-1"];

    fireOnPassUnrezzedIce(s);
    expect(
      s.log.some(
        (line) => line.includes("False Echo") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    s = createInitialState();
    s = structuredClone(s);
    const echo2 = instantiateCard("false-echo", "fe-2", "runner:installed");
    echo2.abilitiesBlanked = true;
    s.cards["fe-2"] = echo2;
    s.runner.installed = ["fe-2"];
    expect(abilitiesSuppressed(s, "fe-2")).toBe(true);
    fireOnPassUnrezzedIce(s);
    expect(
      s.log.some(
        (line) => line.includes("False Echo") && line.includes("becomes pending"),
      ),
    ).toBe(false);
  });

  it("drops The Twins pending while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const twins = instantiateCard("the-twins", "tt-1", "server:hq:root");
    twins.rezzed = true;
    s.cards["tt-1"] = twins;
    s.servers.hq.root = ["tt-1"];

    fireOnPassRezzedIceProtectingThisServer(s, "hq");
    expect(
      s.log.some(
        (line) => line.includes("The Twins") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    s = createInitialState();
    s = structuredClone(s);
    const twins2 = instantiateCard("the-twins", "tt-2", "server:hq:root");
    twins2.rezzed = true;
    twins2.abilitiesBlanked = true;
    s.cards["tt-2"] = twins2;
    s.servers.hq.root = ["tt-2"];
    expect(abilitiesSuppressed(s, "tt-2")).toBe(true);
    fireOnPassRezzedIceProtectingThisServer(s, "hq");
    expect(
      s.log.some(
        (line) => line.includes("The Twins") && line.includes("becomes pending"),
      ),
    ).toBe(false);
  });
});
