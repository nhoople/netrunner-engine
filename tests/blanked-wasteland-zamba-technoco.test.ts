/**
 * Blanked sources drop Wasteland first-trash credits, Zamba expose gains,
 * TechnoCo / Death and Taxes install gains, and Send a Message (CR 9.12.1d).
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
import { maybeOfferGainCreditsOnExpose } from "../src/effects/kitaraSsPrimitives.js";
import { noteInstalledThisTurn } from "../src/state/programHardwareInstall.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked Wasteland / Zamba / TechnoCo (CR 9.12.1d)", () => {
  it("treats Wasteland first-trash credits as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const w = instantiateCard("wasteland", "w-1", "runner:installed");
    s.cards["w-1"] = w;
    s.runner.installed = ["w-1"];
    expect(w.gainCreditsOnFirstOwnInstalledTrashEachTurn ?? 0).toBeGreaterThan(
      0,
    );
    w.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "w-1")).toBe(true);
  });

  it("drops Zamba expose offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const z = instantiateCard("zamba", "z-1", "runner:installed");
    s.cards["z-1"] = z;
    s.runner.installed = ["z-1"];
    expect(z.mayGainCreditsOnCorpCardExposed ?? 0).toBeGreaterThan(0);

    maybeOfferGainCreditsOnExpose(s);
    expect(s.pendingChoice?.sourceId).toBe("z-1");

    s.pendingChoice = null;
    z.abilitiesBlanked = true;
    maybeOfferGainCreditsOnExpose(s);
    expect(s.pendingChoice).toBeNull();
  });

  it("drops TechnoCo install credits while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tech = instantiateCard("technoco", "tc-1", "server:hq:root");
    tech.rezzed = true;
    s.cards["tc-1"] = tech;
    s.servers.hq.root = ["tc-1"];
    s.corp.credits = 5;
    const icebreaker = instantiateCard("corroder", "cor-1", "runner:installed");
    s.cards["cor-1"] = icebreaker;
    s.runner.installed = ["cor-1"];

    noteInstalledThisTurn(s, "cor-1");
    expect(s.corp.credits).toBeGreaterThan(5);

    s.corp.credits = 5;
    s.turn.installedThisTurn = [];
    tech.abilitiesBlanked = true;
    noteInstalledThisTurn(s, "cor-1");
    expect(s.corp.credits).toBe(5);
  });

  it("treats Send a Message as suppressed while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const msg = instantiateCard("send-a-message", "sam-1", "corp:score-area");
    s.cards["sam-1"] = msg;
    s.corp.scoreArea = ["sam-1"];
    expect(msg.mayRezIceIgnoringCostsOnScoreOrSteal).toBe(true);
    msg.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "sam-1")).toBe(true);
  });
});
