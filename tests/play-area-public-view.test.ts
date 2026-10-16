/**
 * CR 4.6 play-area membership bags + public view (4.6.2 / 4.6.3 / 4.6.5g–h),
 * set-aside (4.8), and bad publicity fund (10.6.2).
 */
import { describe, expect, it } from "vitest";
import { createGame, getPublicView } from "../src/api/library.js";
import { createShortGameState } from "../src/cards/shortGame.js";
import { instantiateCard } from "../src/cards/load.js";
import { removeCardFromCurrentZone } from "../src/state/scoring.js";
import {
  enterLingeringPlayArea,
  isPlayAreaZone,
  playAreaCardIds,
} from "../src/state/zones.js";

describe("play area zones (CR 4.6)", () => {
  it("treats hosted zones as play area", () => {
    expect(isPlayAreaZone("hosted:ice-1")).toBe(true);
    expect(isPlayAreaZone("runner:installed")).toBe(true);
    expect(isPlayAreaZone("corp:play-area")).toBe(true);
    expect(isPlayAreaZone("corp:hq")).toBe(false);
    expect(isPlayAreaZone("runner:set-aside")).toBe(false);
  });

  it("syncs lingering playArea bags on enter and remove", () => {
    const state = createGame({ setup: () => createShortGameState() });
    const op = instantiateCard("hedge-fund", "op-linger", "corp:hq");
    state.cards[op.id] = op;
    state.corp.hand.push(op.id);
    enterLingeringPlayArea(state, op.id, "corp");
    expect(state.corp.playArea).toContain(op.id);
    expect(op.zone).toBe("corp:play-area");
    expect(playAreaCardIds(state, "corp")).toContain(op.id);

    removeCardFromCurrentZone(state, op.id);
    expect(state.corp.playArea).not.toContain(op.id);
  });
});

describe("getPublicView open locations", () => {
  it("exposes lingering playArea, setAside, badPublicityFund, and hostedCards", () => {
    const state = createGame({ setup: () => createShortGameState() });
    state.badPublicityFund = 3;

    const lockdown = instantiateCard("hedge-fund", "ld-1", "corp:hq");
    lockdown.subtypes = ["lockdown"];
    lockdown.lingerUntilCorpNextTurnBegins = true;
    state.cards[lockdown.id] = lockdown;
    enterLingeringPlayArea(state, lockdown.id, "corp");

    const ice = instantiateCard("ice-wall", "ice-host", "server:hq:ice");
    ice.rezzed = true;
    state.cards[ice.id] = ice;
    state.servers.hq!.ice = [ice.id];

    const daemon = instantiateCard("sure-gamble", "hosted-ev", "hosted:ice-host");
    daemon.faceup = true;
    daemon.hostId = ice.id;
    state.cards[daemon.id] = daemon;
    ice.hostedCardIds = [daemon.id];

    state.runner.setAside = [];
    const aside = instantiateCard("sure-gamble", "aside-1", "runner:set-aside");
    aside.faceup = true;
    state.cards[aside.id] = aside;
    state.runner.setAside = [aside.id];

    const corpView = getPublicView(state, "corp");
    expect(corpView.badPublicityFund).toBe(3);
    expect(corpView.self.playArea.map((c) => c.id)).toContain(lockdown.id);
    expect(corpView.self.playArea[0]?.title).toBe(lockdown.title);
    expect(corpView.setAside.map((c) => c.id)).toContain(aside.id);
    expect(corpView.setAside.find((c) => c.id === aside.id)?.title).toBe(
      aside.title,
    );
    const hqIce = corpView.servers.find((s) => s.id === "hq")?.ice[0];
    expect(hqIce?.hostedCards.map((h) => h.id)).toContain(daemon.id);
    expect(hqIce?.hostedCards[0]?.title).toBe(daemon.title);

    const runnerView = getPublicView(state, "runner");
    expect(runnerView.badPublicityFund).toBe(3);
    expect(runnerView.opponent.playArea.map((c) => c.id)).toContain(lockdown.id);
    // Faceup lockdown is open to the Runner (CR 4.6.3).
    expect(
      runnerView.opponent.playArea.find((c) => c.id === lockdown.id)?.title,
    ).toBe(lockdown.title);
  });

  it("hides facedown set-aside faces from the non-controlling seat", () => {
    const state = createGame({ setup: () => createShortGameState() });
    const aside = instantiateCard("sure-gamble", "aside-secret", "runner:set-aside");
    aside.faceup = false;
    state.cards[aside.id] = aside;
    state.runner.setAside = [aside.id];

    const runnerView = getPublicView(state, "runner");
    expect(runnerView.setAside[0]?.title).toBe(aside.title);

    const corpView = getPublicView(state, "corp");
    expect(corpView.setAside[0]?.id).toBe(aside.id);
    expect(corpView.setAside[0]?.title).toBeNull();
  });
});
