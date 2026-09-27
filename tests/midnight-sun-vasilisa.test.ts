/**
 * Midnight Sun Vasilisa: place_advancements only targets advanceable cards
 * (agenda or canAdvance; CR §1.9.5f).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.56.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS place_advancements advanceable-only (Vasilisa)", () => {
  it("places on agenda, skips non-advanceable ice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.canAdvance = false;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote-1:root",
    );
    s.cards["ag-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };

    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.placeAdvancements(1),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["ag-1"].advancementTokens).toBe(1);
    expect(s.cards["ice-1"].advancementTokens ?? 0).toBe(0);
  });

  it("places on canAdvance asset, skips non-advanceable asset", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote1 = "remote-1" as ServerId;
    const remote2 = "remote-2" as ServerId;
    s.servers[remote1] = { id: remote1, kind: "remote", ice: [], root: [] };
    s.servers[remote2] = { id: remote2, kind: "remote", ice: [], root: [] };

    const plain = instantiateCard("pad-campaign", "plain-1", `server:${remote1}:root`);
    plain.canAdvance = false;
    s.cards["plain-1"] = plain;
    s.servers[remote1].root = ["plain-1"];

    const adv = instantiateCard("ubiquitous-vig", "adv-1", `server:${remote2}:root`);
    adv.canAdvance = true;
    s.cards["adv-1"] = adv;
    s.servers[remote2].root = ["adv-1"];

    const r = evalEffect(
      { state: s, sourceId: "adv-1" },
      fx.placeAdvancements(2),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["adv-1"].advancementTokens).toBe(2);
    expect(s.cards["plain-1"].advancementTokens ?? 0).toBe(0);
  });

  it("no-ops when only non-advanceable cards are installed", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const r = evalEffect(
      { state: s, sourceId: "ice-1" },
      fx.placeAdvancements(1),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["ice-1"].advancementTokens ?? 0).toBe(0);
    expect(s.log.some((l) => /no eligible card/.test(l))).toBe(true);
  });

  it("Vasilisa encounter pay-adv path places on advanceable target", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = { id: remoteId, kind: "remote", ice: [], root: [] };

    const vas = instantiateCard("vasilisa", "vas-1", `server:${remoteId}:ice`);
    vas.unsupported = [];
    vas.rezzed = true;
    vas.faceup = true;
    s.cards["vas-1"] = vas;
    s.servers[remoteId].ice = ["vas-1"];

    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote-2:root",
    );
    s.cards["ag-1"] = agenda;
    s.servers["remote-2"] = {
      id: "remote-2",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };

    s.corp.credits = 5;
    s.runner.clicks = 4;
    s.runner.credits = 10;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: remoteId });
    // Approach → rez already done; walk to encounter
    // Vasilisa may already be rezzed; pass approach if needed
    if (s.timingKey === "run.approachPaw") {
      s = must(s, { type: "pass_window" });
    }
    // Encounter should fire onEncounter choose
    expect(s.pendingChoice?.options.some((o) => o.id === "pay-adv")).toBe(true);
    const before = s.corp.credits;
    s = must(s, { type: "choose_option", optionId: "pay-adv" });
    expect(s.corp.credits).toBe(before - 1);
    expect(s.cards["ag-1"].advancementTokens).toBe(1);
  });
});

describe("MS Vasilisa card wiring (v0.31.0+)", () => {
  it("Vasilisa clears unsupported with advanceable place_advancements", () => {
    const def = getCardDef("vasilisa");
    expect(def.unsupported).toEqual([]);
    expect(def.type).toBe("ice");
    expect(def.onEncounter).toBeTruthy();
    expect(def.strength).toBe(2);
    expect(def.rezCost).toBe(2);
  });
});
