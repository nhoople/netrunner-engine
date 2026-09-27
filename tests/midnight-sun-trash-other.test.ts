/**
 * Midnight Sun Corp trash-other cluster:
 * may_trash_installed (+ then) for Svyatogor Excavator, Extract, Stavka.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
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
  assertCardsPinnedTag("v0.30.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function svyatogorOnTurnBegin(): Effect {
  return fx.mayTrashInstalled({
    excludeSelf: true,
    then: fx.gainCredits("corp", 3),
  });
}

function extractOnPlay(): Effect {
  return fx.seq(
    fx.gainCredits("corp", 6),
    fx.mayTrashInstalled({
      excludeSelf: true,
      then: fx.gainCredits("corp", 3),
    }),
  );
}

function stavkaOnRez(): Effect {
  return fx.mayTrashInstalled({
    excludeSelf: true,
    then: fx.fortify(5),
  });
}

function withCorpAsset(
  defId: string,
  instanceId: string,
  opts?: { onTurnBegin?: Effect; rezCost?: number },
) {
  let s = createInitialState();
  s = structuredClone(s);
  const remoteId = "remote-1" as ServerId;
  s.servers[remoteId] = {
    id: remoteId,
    kind: "remote",
    ice: [],
    root: [],
  };
  const card = instantiateCard(defId, instanceId, `server:${remoteId}:root`);
  card.rezzed = true;
  card.faceup = true;
  card.unsupported = [];
  if (opts?.onTurnBegin) card.onTurnBegin = opts.onTurnBegin;
  if (opts?.rezCost !== undefined) card.rezCost = opts.rezCost;
  s.cards[instanceId] = card;
  s.servers[remoteId].root = [instanceId];
  s.corp.credits = 5;
  s.activeSide = "corp";
  s.timingKey = "corp.turnBegins";
  return { s, remoteId };
}

describe("MS may_trash_installed IR (always)", () => {
  it("validates Svyatogor / Extract / Stavka effect trees", () => {
    expect(validateEffectTree(svyatogorOnTurnBegin())).toBeNull();
    expect(validateEffectTree(extractOnPlay())).toBeNull();
    expect(validateEffectTree(stavkaOnRez())).toBeNull();
  });

  it("may_trash_installed offers targets + decline; choosing trashes + then", () => {
    const { s: base } = withCorpAsset("refuge-campaign", "svy-1", {
      onTurnBegin: svyatogorOnTurnBegin(),
    });
    let s = base;
    const otherRemote = "remote-2" as ServerId;
    s.servers[otherRemote] = {
      id: otherRemote,
      kind: "remote",
      ice: [],
      root: [],
    };
    const other = instantiateCard(
      "pad-campaign",
      "pad-1",
      `server:${otherRemote}:root`,
    );
    other.rezzed = true;
    other.faceup = true;
    s.cards["pad-1"] = other;
    s.servers[otherRemote].root = ["pad-1"];

    const r = evalEffect({ state: s, sourceId: "svy-1" }, svyatogorOnTurnBegin());
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.pendingChoice?.options.some((o) => o.id === "trash:pad-1")).toBe(
      true,
    );
    expect(s.pendingChoice?.options.some((o) => o.id === "decline")).toBe(true);
    expect(
      s.pendingChoice?.options.some((o) => o.id === "trash:svy-1"),
    ).toBe(false);

    s = must(s, { type: "choose_option", optionId: "trash:pad-1" });
    expect(s.corp.discard).toContain("pad-1");
    expect(s.servers[otherRemote]!.root).not.toContain("pad-1");
    expect(s.corp.credits).toBe(8); // 5 + 3
  });

  it("may_trash_installed no-ops when no other installed cards", () => {
    const { s } = withCorpAsset("refuge-campaign", "svy-1", {
      onTurnBegin: svyatogorOnTurnBegin(),
    });
    const before = s.corp.credits;
    const r = evalEffect({ state: s, sourceId: "svy-1" }, svyatogorOnTurnBegin());
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.credits).toBe(before);
  });

  it("Extract gains 6 then may trash for +3", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: [],
    };
    const pad = instantiateCard(
      "pad-campaign",
      "pad-1",
      `server:${remoteId}:root`,
    );
    pad.rezzed = true;
    pad.faceup = true;
    s.cards["pad-1"] = pad;
    s.servers[remoteId].root = ["pad-1"];

    const extract = instantiateCard("hedge-fund", "extract-1", "corp:hq");
    extract.onPlay = extractOnPlay();
    extract.playCost = 0;
    extract.unsupported = [];
    s.cards["extract-1"] = extract;
    s.corp.hand = ["extract-1"];
    s.corp.credits = 3;
    s.corp.clicks = 1;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";

    s = must(s, { type: "play_operation", cardId: "extract-1" });
    expect(s.corp.credits).toBe(9); // 3 + 6; may-trash pending
    expect(s.pendingChoice?.options.some((o) => o.id === "trash:pad-1")).toBe(
      true,
    );
    s = must(s, { type: "choose_option", optionId: "trash:pad-1" });
    expect(s.corp.credits).toBe(12); // +3
    expect(s.corp.discard).toContain("pad-1");
  });

  it("Stavka on rez may trash other for +5 strength this run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: [],
    };
    const stavka = instantiateCard("stavka", "stavka-1", `server:${remoteId}:ice`);
    stavka.onRez = stavkaOnRez();
    stavka.unsupported = [];
    stavka.rezzed = false;
    stavka.strength = 2;
    s.cards["stavka-1"] = stavka;
    s.servers[remoteId].ice = ["stavka-1"];

    const pad = instantiateCard(
      "pad-campaign",
      "pad-1",
      `server:${remoteId}:root`,
    );
    pad.rezzed = false;
    pad.faceup = false;
    s.cards["pad-1"] = pad;
    s.servers[remoteId].root = ["pad-1"];

    s.corp.credits = 20;
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "stavka-1" });
    expect(s.pendingChoice?.options.some((o) => o.id === "trash:pad-1")).toBe(
      true,
    );
    expect(
      s.pendingChoice?.options.some((o) => o.id === "trash:stavka-1"),
    ).toBe(false);

    s = must(s, { type: "choose_option", optionId: "trash:pad-1" });
    expect(s.corp.discard).toContain("pad-1");
    expect(s.run?.iceStrengthBoosts["stavka-1"]).toBe(5);
    expect(effectiveIceStrength(s, "stavka-1")).toBe(7);
  });

  it("may_trash_installed can target unrezzed ice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: [],
    };
    const ice = instantiateCard("ice-wall", "iw-1", `server:${remoteId}:ice`);
    ice.rezzed = false;
    s.cards["iw-1"] = ice;
    s.servers[remoteId].ice = ["iw-1"];

    const r = evalEffect(
      { state: s, sourceId: "corp-id" },
      fx.mayTrashInstalled({ excludeSelf: true }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id === "trash:iw-1")).toBe(
      true,
    );
  });
});

describe("MS trash-other card defs (pin v0.30.0)", () => {
  it("Svyatogor / Extract / Stavka are fully clear with may_trash_installed", () => {
    const svy = getCardDef("svyatogor-excavator");
    expect(svy.unsupported).toEqual([]);
    expect(svy.onTurnBegin).toEqual(
      fx.mayTrashInstalled({
        excludeSelf: true,
        then: fx.gainCredits("corp", 3),
      }),
    );

    const extract = getCardDef("extract");
    expect(extract.unsupported).toEqual([]);
    expect(extract.onPlay).toEqual(
      fx.seq(
        fx.gainCredits("corp", 6),
        fx.mayTrashInstalled({
          excludeSelf: true,
          then: fx.gainCredits("corp", 3),
        }),
      ),
    );

    const stavka = getCardDef("stavka");
    expect(stavka.unsupported).toEqual([]);
    expect(stavka.onRez).toEqual(
      fx.mayTrashInstalled({
        excludeSelf: true,
        then: fx.fortify(5),
      }),
    );
  });
});
