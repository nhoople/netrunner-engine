/**
 * Blanked sources drop Maw, Hippo, Polyhistor, Bazaar, and Synth DNA
 * Modification helpers (CR 9.12.1d).
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
  maybeRipDeal,
  onAccessFinishedWithoutStealOrTrash,
  onFullBreak,
  onPassedAllIce,
  onProgramOrHardwareInstalled,
} from "../src/state/cardDeclarations.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

describe("blanked Maw / Hippo / Polyhistor (CR 9.12.1d)", () => {
  it("drops Maw HQ trash while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const maw = instantiateCard("maw", "maw-1", "runner:installed");
    s.cards["maw-1"] = maw;
    s.runner.installed = ["maw-1"];
    const hq = instantiateCard("sure-gamble", "hq-1", "corp:hq");
    s.cards["hq-1"] = hq;
    s.corp.hand = ["hq-1"];
    const accessed = instantiateCard("hedge-fund", "hf-1", "server:hq:root");
    s.cards["hf-1"] = accessed;

    onAccessFinishedWithoutStealOrTrash(s, "hf-1");
    expect(s.corp.discardPile).toContain("hq-1");

    s.corp.hand = ["hq-1"];
    s.corp.discardPile = [];
    hq.zone = "corp:hq";
    s.turn.mawFiredThisTurn = false;
    suppressAbilities(s, maw.id);
    expect(abilitiesSuppressed(s, "maw-1")).toBe(true);
    onAccessFinishedWithoutStealOrTrash(s, "hf-1");
    expect(s.corp.discardPile).not.toContain("hq-1");
  });

  it("drops Hippo offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hippo = instantiateCard("hippo", "hip-1", "runner:installed");
    s.cards["hip-1"] = hippo;
    s.runner.installed = ["hip-1"];
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    onFullBreak(s, "ice-1");
    expect(s.pendingChoice?.sourceId).toBe("hip-1");

    s.pendingChoice = null;
    s.turn.hippoFiredThisTurn = false;
    suppressAbilities(s, hippo.id);
    onFullBreak(s, "ice-1");
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Polyhistor offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const poly = instantiateCard("polyhistor", "poly-1", "runner:installed");
    s.cards["poly-1"] = poly;
    s.runner.installed = ["poly-1"];
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "approach_server",
      position: 0,
      icePassed: 0,
      successful: false,
      breached: false,
    } as typeof s.run;

    onPassedAllIce(s);
    expect(s.pendingChoice?.sourceId).toBe("poly-1");

    s.pendingChoice = null;
    s.turn.polyhistorFiredThisTurn = false;
    suppressAbilities(s, poly.id);
    onPassedAllIce(s);
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Bazaar offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bazaar = instantiateCard("bazaar", "baz-1", "runner:installed");
    s.cards["baz-1"] = bazaar;
    s.runner.installed = ["baz-1"];
    const h1 = instantiateCard("desperado", "d-1", "runner:installed");
    const h2 = instantiateCard("desperado", "d-2", "runner:grip");
    s.cards["d-1"] = h1;
    s.cards["d-2"] = h2;
    s.runner.installed = ["baz-1", "d-1"];
    s.runner.hand = ["d-2"];

    onProgramOrHardwareInstalled(s, "d-1");
    expect(s.pendingChoice?.sourceId).toBe("baz-1");

    s.pendingChoice = null;
    suppressAbilities(s, bazaar.id);
    onProgramOrHardwareInstalled(s, "d-1");
    expect(s.pendingChoice).toBeNull();
  });

  it("drops Synth DNA net damage while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const synth = instantiateCard(
      "synth-dna-modification",
      "sd-1",
      "server:hq:root",
    );
    synth.rezzed = true;
    s.cards["sd-1"] = synth;
    s.servers.hq.root = ["sd-1"];
    const ice = instantiateCard("neural-katana", "nk-1", "server:hq:ice");
    ice.rezzed = true;
    ice.subtypes = ["ap", "sentry"];
    s.cards["nk-1"] = ice;
    s.servers.hq.ice = ["nk-1"];
    s.runner.coreDamage = 0;

    onFullBreak(s, "nk-1");
    expect(s.runner.coreDamage).toBeGreaterThan(0);

    s.runner.coreDamage = 0;
    s.turn.synthDnaFiredThisTurn = false;
    s.turn.hippoFiredThisTurn = true;
    suppressAbilities(s, synth.id);
    onFullBreak(s, "nk-1");
    expect(s.runner.coreDamage).toBe(0);
  });

  it("drops Rip Deal offer while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const rip = instantiateCard("rip-deal", "rd-1", "runner:installed");
    s.cards["rd-1"] = rip;
    s.runner.installed = ["rd-1"];
    const heap = instantiateCard("sure-gamble", "sg-1", "runner:heap");
    s.cards["sg-1"] = heap;
    s.runner.discardPile = ["sg-1"];
    const hq = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    s.cards["hf-1"] = hq;
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "access",
      position: 0,
      icePassed: 0,
      successful: true,
      breached: true,
      accessCandidates: ["hf-1"],
    } as typeof s.run;

    maybeRipDeal(s);
    expect(s.pendingChoice?.sourceId).toBe("rd-1");

    s.pendingChoice = null;
    suppressAbilities(s, rip.id);
    maybeRipDeal(s);
    expect(s.pendingChoice).toBeNull();
  });
});
