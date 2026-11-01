/**
 * Blanked sources drop Aesop's Pawnshop, Personal Workshop, Environmental
 * Testing, Oberth Protocol, Anson Rose, and The Archivist (CR 9.12.1d).
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
  onAgendaScored,
  onCardAdvanced,
  onCorpCardInstalledInRemote,
  onIceRezzed,
  onRunnerTurnBegan,
} from "../src/state/cardDeclarations.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.15");
});

describe("blanked Aesop / Oberth / Anson (CR 9.12.1d)", () => {
  it("drops Personal Workshop power tick while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const pw = instantiateCard("personal-workshop", "pw-1", "runner:installed");
    const guest = instantiateCard("ice-carver", "ic-1", "runner:installed");
    guest.hostId = "pw-1";
    guest.powerCounters = 2;
    guest.zone = "runner:hosted";
    pw.hostedCardIds = ["ic-1"];
    s.cards["pw-1"] = pw;
    s.cards["ic-1"] = guest;
    s.runner.installed = ["pw-1"];

    onRunnerTurnBegan(s);
    expect(guest.powerCounters).toBe(1);

    guest.powerCounters = 2;
    pw.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "pw-1")).toBe(true);
    onRunnerTurnBegan(s);
    expect(guest.powerCounters).toBe(2);
  });

  it("drops Oberth extra advancement while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.advancementCounters = 1;
    ice.rezzed = true;
    const oberth = instantiateCard("oberth-protocol", "ob-1", "server:hq:root");
    oberth.rezzed = true;
    s.cards["ice-1"] = ice;
    s.cards["ob-1"] = oberth;
    s.servers.hq.ice = ["ice-1"];
    s.servers.hq.root = ["ob-1"];

    onCardAdvanced(s, "ice-1");
    expect(ice.advancementCounters).toBeGreaterThan(1);

    ice.advancementCounters = 1;
    s.turn.oberthFiredThisTurn = false;
    oberth.abilitiesBlanked = true;
    onCardAdvanced(s, "ice-1");
    expect(ice.advancementCounters).toBe(1);
  });

  it("drops Anson Rose move-advancement offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const anson = instantiateCard("anson-rose", "ar-1", "server:hq:root");
    anson.rezzed = true;
    anson.advancementCounters = 2;
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ar-1"] = anson;
    s.cards["ice-1"] = ice;
    s.servers.hq.root = ["ar-1"];
    s.servers.hq.ice = ["ice-1"];

    onIceRezzed(s, "ice-1");
    expect(s.pendingChoice?.sourceId).toBe("ar-1");

    s.pendingChoice = null;
    anson.abilitiesBlanked = true;
    onIceRezzed(s, "ice-1");
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Estelle Moon power while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.servers.remote1 = {
      id: "remote1",
      kind: "remote",
      root: [],
      ice: [],
    } as (typeof s.servers)["hq"];
    const et = instantiateCard("estelle-moon", "et-1", "server:remote1:root");
    et.rezzed = true;
    s.cards["et-1"] = et;
    s.servers.remote1.root = ["et-1"];

    onCorpCardInstalledInRemote(s);
    expect(et.powerCounters ?? 0).toBeGreaterThan(0);

    et.powerCounters = 0;
    et.abilitiesBlanked = true;
    onCorpCardInstalledInRemote(s);
    expect(et.powerCounters ?? 0).toBe(0);
  });

  it("drops The Archivist trace while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const arch = instantiateCard("the-archivist", "ta-1", "runner:installed");
    s.cards["ta-1"] = arch;
    s.runner.installed = ["ta-1"];
    const agenda = instantiateCard("priority-requisition", "pr-1", "corp:score");
    agenda.subtypes = ["initiative"];
    s.cards["pr-1"] = agenda;
    s.corp.scoreArea = ["pr-1"];

    onAgendaScored(s, agenda);
    expect(s.trace?.sourceId).toBe("ta-1");

    s.trace = null;
    arch.abilitiesBlanked = true;
    onAgendaScored(s, agenda);
    expect(s.trace).toBeNull();
  });
});
