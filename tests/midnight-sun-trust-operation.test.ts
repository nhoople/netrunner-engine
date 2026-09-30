/**
 * Midnight Sun Trust Operation: trash_resource + install_and_rez_from_archives_free.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
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

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.94.0");
});


function trustOnPlay(): Effect {
  return fx.seq(
    fx.trashResource("choose"),
    fx.installAndRezFromArchivesFree(),
  );
}

describe("MS install_and_rez_from_archives_free (Trust Operation)", () => {
  it("validates Trust Operation effect tree", () => {
    expect(validateEffectTree(trustOnPlay())).toBeNull();
  });

  it("installs and rezzes an Archives asset into a new remote", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const asset = instantiateCard("pad-campaign", "arch-1", "corp:archives");
    s.cards["arch-1"] = asset;
    s.corp.discard = ["arch-1"];
    s.runner.rig = [];
    // No resources — trash_resource no-ops; install still runs.
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.installAndRezFromArchivesFree(),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.discard).not.toContain("arch-1");
    expect(s.cards["arch-1"].rezzed).toBe(true);
    expect(s.cards["arch-1"].zone).toMatch(/^server:remote-\d+:root$/);
  });

  it("installs ice from Archives protecting a new remote", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
    s.cards["arch-ice"] = ice;
    s.corp.discard = ["arch-ice"];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.installAndRezFromArchivesFree(),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["arch-ice"].rezzed).toBe(true);
    expect(s.cards["arch-ice"].zone).toMatch(/^server:remote-\d+:ice$/);
  });

  it("Trust Operation card wiring is fully clear on pin v0.34.0", () => {
    const def = getCardDef("trust-operation");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.playRequiresTagged).toBe(true);
    expect(def.onPlay).toBeTruthy();
  });
});
