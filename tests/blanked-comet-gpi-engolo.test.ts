/**
 * Blanked sources drop GPI Net Tap, Engolo, Comet, Manta Grid, Mirror,
 * and Kasi String helpers (CR 9.12.1d).
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
  noteApproachIce,
  noteEncounterIce,
  onRunnerEventPlayed,
  onSuccessfulRunEnded,
} from "../src/state/cardDeclarations.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked GPI / Engolo / Comet (CR 9.12.1d)", () => {
  it("drops GPI Net Tap expose offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gpi = instantiateCard("gpi-net-tap", "gpi-1", "runner:installed");
    s.cards["gpi-1"] = gpi;
    s.runner.installed = ["gpi-1"];
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    noteApproachIce(s, "ice-1");
    expect(s.pendingChoice?.sourceId).toBe("gpi-1");

    s.pendingChoice = null;
    gpi.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "gpi-1")).toBe(true);
    noteApproachIce(s, "ice-1");
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Engolo subtype offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const eng = instantiateCard("engolo", "eng-1", "runner:installed");
    s.cards["eng-1"] = eng;
    s.runner.installed = ["eng-1"];
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    noteEncounterIce(s, "ice-1");
    expect(s.pendingChoice?.sourceId).toBe("eng-1");

    s.pendingChoice = null;
    s.turn.engoloUsedThisTurn = false;
    eng.abilitiesBlanked = true;
    noteEncounterIce(s, "ice-1");
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Comet first-event offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const comet = instantiateCard("comet", "com-1", "runner:installed");
    s.cards["com-1"] = comet;
    s.runner.installed = ["com-1"];
    const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    s.cards["sg-1"] = ev;

    onRunnerEventPlayed(s, "sg-1");
    expect(s.pendingChoice?.sourceId).toBe("com-1");

    s.pendingChoice = null;
    s.turn.cometEventPlayedThisTurn = false;
    comet.abilitiesBlanked = true;
    onRunnerEventPlayed(s, "sg-1");
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Manta Grid allotted-click while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const manta = instantiateCard("manta-grid", "mg-1", "server:hq:root");
    manta.rezzed = true;
    s.cards["mg-1"] = manta;
    s.servers.hq.root = ["mg-1"];
    s.runner.credits = 5;
    s.runner.clicks = 0;
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "success",
      position: 0,
      icePassed: 0,
      successful: true,
      breached: true,
    } as typeof s.run;

    onSuccessfulRunEnded(s);
    expect(s.corpAllottedClicksDeltaNextTurn ?? 0).toBeGreaterThan(0);

    s.corpAllottedClicksDeltaNextTurn = 0;
    manta.abilitiesBlanked = true;
    onSuccessfulRunEnded(s);
    expect(s.corpAllottedClicksDeltaNextTurn ?? 0).toBe(0);
  });

  it("drops Mirror recurring replace while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const mirror = instantiateCard("mirror", "mir-1", "runner:installed");
    mirror.recurringCredits = 0;
    mirror.recurringCreditsMax = 2;
    s.cards["mir-1"] = mirror;
    s.runner.installed = ["mir-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "rd",
      phase: "success",
      position: 0,
      icePassed: 0,
      successful: true,
      breached: true,
    } as typeof s.run;

    onSuccessfulRunEnded(s);
    expect(mirror.recurringCredits).toBe(1);

    mirror.recurringCredits = 0;
    mirror.abilitiesBlanked = true;
    onSuccessfulRunEnded(s);
    expect(mirror.recurringCredits).toBe(0);
  });

  it("drops Kasi String power while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const kasi = instantiateCard("kasi-string", "ks-1", "runner:installed");
    s.cards["ks-1"] = kasi;
    s.runner.installed = ["ks-1"];
    s.servers.remote1 = {
      id: "remote1",
      kind: "remote",
      root: [],
      ice: [],
    } as (typeof s.servers)["hq"];
    s.run = {
      id: "run-1",
      attackedServerId: "remote1",
      phase: "success",
      position: 0,
      icePassed: 0,
      successful: true,
      breached: true,
      breachStoleOrTrashed: false,
    } as typeof s.run;

    onSuccessfulRunEnded(s);
    expect(kasi.powerCounters ?? 0).toBeGreaterThan(0);

    kasi.powerCounters = 0;
    s.turn.kasiFiredThisTurn = false;
    kasi.abilitiesBlanked = true;
    onSuccessfulRunEnded(s);
    expect(kasi.powerCounters ?? 0).toBe(0);
  });
});
