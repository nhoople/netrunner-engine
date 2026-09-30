/**
 * Midnight Sun Élivágar Bifurcation: onScore → may_derez_installed
 * (any rezzed installed ice/asset/upgrade; CR §8.1.3 / §9.5).
 * Rewires the prior ice-only `derez_ice` model.
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
  validateEffectTree,
} from "../src/index.js";
import type { Effect } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.104.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function elivagarOnScore(): Effect {
  return fx.mayDerezInstalled({ excludeSelf: true });
}

function setupScoreWithInstalled(opts: {
  rezzedIce?: boolean;
  rezzedAsset?: boolean;
  unrezzedIce?: boolean;
}) {
  let s = createInitialState();
  s = structuredClone(s);

  const agenda = instantiateCard(
    "elivagar-bifurcation",
    "eli-1",
    "server:remote-1:root",
  );
  agenda.unsupported = [];
  agenda.onScore = elivagarOnScore();
  agenda.advancementTokens = agenda.advancementRequirement ?? 2;
  s.cards["eli-1"] = agenda;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: ["eli-1"],
  };

  if (opts.rezzedIce) {
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice.push("ice-1");
  }
  if (opts.unrezzedIce) {
    const ice = instantiateCard("enigma", "ice-unrez", "server:rd:ice");
    ice.rezzed = false;
    s.cards["ice-unrez"] = ice;
    s.servers.rd.ice.push("ice-unrez");
  }
  if (opts.rezzedAsset) {
    const remote2 = "remote-2" as ServerId;
    s.servers[remote2] = {
      id: remote2,
      kind: "remote",
      ice: [],
      root: [],
    };
    const asset = instantiateCard("pad-campaign", "asset-1", `server:${remote2}:root`);
    asset.rezzed = true;
    asset.faceup = true;
    s.cards["asset-1"] = asset;
    s.servers[remote2].root = ["asset-1"];
  }

  s.corp.clicks = 3;
  s.corp.credits = 10;
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  // Isolate agenda onScore from HB Precision Design's onAgendaScored choice.
  const id = s.cards[s.corp.identityId];
  if (id) delete id.onAgendaScored;
  return s;
}

describe("MS Élivágar may_derez_installed onScore", () => {
  it("validates may_derez_installed effect tree", () => {
    expect(validateEffectTree(elivagarOnScore())).toBeNull();
  });

  it("offers rezzed ice and rezzed asset as derez targets", () => {
    let s = setupScoreWithInstalled({ rezzedIce: true, rezzedAsset: true });
    s = must(s, { type: "score_agenda", cardId: "eli-1" });
    expect(s.corp.score).toContain("eli-1");
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toEqual(
      expect.arrayContaining(["derez:ice-1", "derez:asset-1", "decline"]),
    );
  });

  it("derezzes chosen asset (not ice-only)", () => {
    let s = setupScoreWithInstalled({ rezzedIce: true, rezzedAsset: true });
    s = must(s, { type: "score_agenda", cardId: "eli-1" });
    s = must(s, { type: "choose_option", optionId: "derez:asset-1" });
    expect(s.cards["asset-1"]!.rezzed).toBe(false);
    expect(s.cards["ice-1"]!.rezzed).toBe(true);
  });

  it("ignores unrezzed ice; decline leaves rezzed ice up", () => {
    let s = setupScoreWithInstalled({
      rezzedIce: true,
      unrezzedIce: true,
    });
    s = must(s, { type: "score_agenda", cardId: "eli-1" });
    const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("derez:ice-1");
    expect(ids).not.toContain("derez:ice-unrez");
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.cards["ice-1"]!.rezzed).toBe(true);
  });

  it("no choice when nothing rezzed installed", () => {
    let s = setupScoreWithInstalled({});
    s = must(s, { type: "score_agenda", cardId: "eli-1" });
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.score).toContain("eli-1");
  });

  it("evalEffect may_derez_installed directly offers installed targets", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const src = instantiateCard("elivagar-bifurcation", "eli-src", "corp:score");
    s.cards["eli-src"] = src;
    const asset = instantiateCard("pad-campaign", "a1", "server:remote-1:root");
    asset.rezzed = true;
    asset.faceup = true;
    s.cards["a1"] = asset;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["a1"],
    };
    const r = evalEffect({ state: s, sourceId: "eli-src" }, elivagarOnScore());
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id === "derez:a1")).toBe(
      true,
    );
  });
});

describe("MS Élivágar card wiring (v0.31.0+)", () => {
  it("Élivágar clears unsupported with may_derez_installed onScore", () => {
    const def = getCardDef("elivagar-bifurcation");
    expect(def.unsupported).toEqual([]);
    expect(def.type).toBe("agenda");
    expect(def.advancementRequirement).toBe(2);
    expect(def.agendaPoints).toBe(1);
    expect(def.onScore).toEqual({
      op: "do",
      action: {
        kind: "may_derez_installed",
        excludeSelf: true,
      },
    });
  });
});
